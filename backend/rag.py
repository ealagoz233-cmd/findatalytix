"""
FinDatalytix — rag.py (Ay 3: RAG temeli)
========================================
Zincir: dosya baytları → metin çıkarma → chunk'lama → ChromaDB.

Tasarım kararları:
- HAFİF EMBEDDING: sentence-transformers + torch (~2GB) yerine
  ChromaDB'nin yerleşik ONNX MiniLM'i (~80MB, ilk kullanımda iner).
  embedder parametresi ile test/ileri seviye modeller takılabilir.
- METADATA KORUMALI CHUNK: her parça kaynağını bilir
  (source=dosya adı, page=sayfa no, chunk=sıra). RAG cevabı
  "hangi dokümandan geldi" sorusunu her zaman yanıtlayabilir.
- CHUNK STRATEJİSİ: paragraf sınırlarına saygılı biriktirme,
  hedef ~800 karakter + ~150 karakter örtüşme (overlap).
  Cümle ortasından kesmek yerine paragraf bütünlüğü korunur;
  böylece "faiz oranı %45" gibi sayısal ifadeler bölünmez.
- KALICILIK: PersistentClient ./chroma_db klasörüne yazar;
  sunucu yeniden başlasa da indeks kaybolmaz.
"""

from __future__ import annotations

import io
import time
import logging

import fitz               # PyMuPDF
import docx as docxlib    # python-docx
import chromadb

logger = logging.getLogger("findatalytix.rag")

CHUNK_TARGET_CHARS = 800
CHUNK_OVERLAP_CHARS = 150
COLLECTION_NAME = "findatalytix_docs"
MIN_SCORE = 0.50


# ----------------------------------------------------------
# 1) METİN ÇIKARMA — (sayfa_no, metin) listesi döner
# ----------------------------------------------------------

def extract_pdf(data: bytes) -> list[tuple[int, str]]:
    pages = []
    with fitz.open(stream=data, filetype="pdf") as doc:
        for i, page in enumerate(doc, start=1):
            text = page.get_text("text").strip()
            if text:
                pages.append((i, text))
    return pages


def extract_docx(data: bytes) -> list[tuple[int, str]]:
    # DOCX'te güvenilir sayfa kavramı yok; tamamı "sayfa 1" sayılır.
    document = docxlib.Document(io.BytesIO(data))
    text = "\n\n".join(p.text for p in document.paragraphs if p.text.strip())
    return [(1, text)] if text.strip() else []


def extract_text(filename: str, data: bytes) -> list[tuple[int, str]]:
    ext = filename.lower().rsplit(".", 1)[-1]
    if ext == "pdf":
        return extract_pdf(data)
    if ext == "docx":
        return extract_docx(data)
    raise ValueError(f"Desteklenmeyen uzantı: .{ext}")


# ----------------------------------------------------------
# 2) CHUNK'LAMA — paragraf sınırlarına saygılı
# ----------------------------------------------------------

def chunk_pages(pages: list[tuple[int, str]], target_chars: int | None = None) -> list[dict]:
    """[{text, page, chunk}] listesi üretir.
    target_chars: hedef chunk boyutu (KARAKTER); None -> modül varsayılanı.
    Arayüzdeki 'Chunk Boyutu' ayarı main.py üzerinden buraya enjekte edilir."""
    target = target_chars or CHUNK_TARGET_CHARS
    chunks: list[dict] = []
    index = 0

    for page_no, page_text in pages:
        paragraphs = [p.strip() for p in page_text.split("\n\n") if p.strip()]
        # Tek büyük blok geldiyse satırlardan böl
        if len(paragraphs) <= 1 and len(page_text) > target:
            paragraphs = [p.strip() for p in page_text.split("\n") if p.strip()]

        buffer = ""
        for para in paragraphs:
            candidate = (buffer + "\n\n" + para).strip() if buffer else para
            if len(candidate) >= target and buffer:
                chunks.append({"text": buffer, "page": page_no, "chunk": index})
                index += 1
                # örtüşme: önceki chunk'ın kuyruğu yeni chunk'ın başı olur
                buffer = (buffer[-CHUNK_OVERLAP_CHARS:] + "\n\n" + para).strip()
            else:
                buffer = candidate
        if buffer:
            chunks.append({"text": buffer, "page": page_no, "chunk": index})
            index += 1

    return chunks


# ----------------------------------------------------------
# 3) VEKTÖR DEPO
# ----------------------------------------------------------

class JinaEmbedder:
    """ChromaDB uyumlu çok dilli embedding fonksiyonu (jina-embeddings-v3).
    Türkçe'yi gerçekten anlar (kanıt: TR finans cümleleri arası ~0.71
    benzerlik, alakasız cümleyle ~0.17) — ChromaDB'nin varsayılan İngilizce
    MiniLM'i Türkçe belgede zayıftı. API tabanlı → RAM yemez (Render
    free-tier dostu). Anahtar env'den (JINA_API_KEY); yoksa bu sınıf hiç
    kurulmaz, MiniLM'e düşülür. Arayüz conftest.FakeEmbedder ile aynı
    (ChromaDB'nin beklediği biçim)."""

    def __init__(self, api_key: str, model: str = "jina-embeddings-v3"):
        self._key = api_key
        self._model = model

    def _embed(self, texts) -> list[list[float]]:
        import requests
        texts = list(texts)
        if not texts:
            return []
        r = requests.post(
            "https://api.jina.ai/v1/embeddings",
            headers={"Authorization": f"Bearer {self._key}",
                     "Content-Type": "application/json"},
            json={"model": self._model, "input": texts},
            timeout=60)
        r.raise_for_status()
        data = sorted(r.json()["data"], key=lambda d: d["index"])
        return [d["embedding"] for d in data]

    def __call__(self, input): return self._embed(input)
    def embed_query(self, input): return self._embed(input)
    def embed_documents(self, input): return self._embed(input)
    def name(self): return "jina-v3"
    def is_legacy(self): return False


class RagStore:

    def __init__(self, path: str = "./chroma_db", embedder=None):
        self.client = chromadb.PersistentClient(path=path)
        kwargs = {"embedding_function": embedder} if embedder is not None else {}
        self.col = self.client.get_or_create_collection(COLLECTION_NAME, **kwargs)

    # ---- yazma ----

    def add_document(self, filename: str, data: bytes,
                     chunk_target: int | None = None) -> dict:
        if self.has_document(filename):
            raise ValueError(f"'{filename}' zaten indeksli. Önce silin.")

        pages = extract_text(filename, data)
        if not pages:
            raise ValueError(f"'{filename}' içinden metin çıkarılamadı (boş ya da taranmış görüntü olabilir).")

        chunks = chunk_pages(pages, chunk_target)
        now = time.time()
        self.col.add(
            ids=[f"{filename}::{c['chunk']}" for c in chunks],
            documents=[c["text"] for c in chunks],
            metadatas=[{"source": filename, "page": c["page"],
                        "chunk": c["chunk"], "added": now} for c in chunks],
        )
        logger.info("%s indekslendi: %d sayfa, %d chunk", filename, len(pages), len(chunks))
        return {"filename": filename, "pages": len(pages), "chunks": len(chunks)}

    def delete_document(self, filename: str) -> int:
        existing = self.col.get(where={"source": filename})
        count = len(existing["ids"])
        if count:
            self.col.delete(where={"source": filename})
        return count

    # ---- okuma ----

    def has_document(self, filename: str) -> bool:
        return len(self.col.get(where={"source": filename}, limit=1)["ids"]) > 0

    def stats(self) -> dict:
        data = self.col.get(include=["metadatas"])
        docs: dict[str, dict] = {}
        last = 0.0
        for meta in data["metadatas"]:
            src = meta["source"]
            entry = docs.setdefault(src, {"name": src, "chunks": 0, "added": meta["added"]})
            entry["chunks"] += 1
            last = max(last, meta["added"])
        return {
            "documents": sorted(docs.values(), key=lambda d: d["added"], reverse=True),
            "documentCount": len(docs),
            "totalChunks": len(data["metadatas"]),
            "lastUpdated": last or None,
        }

    def query(self, question: str, top_k: int = 5,
              min_score: float | None = None) -> list[dict]:
        """En benzer chunk'lar. min_score eşiği kullanıma göre değişir:
        - AI bağlamı (None): MIN_SCORE (seçici — LLM'e zayıf parça beslenmesin).
        - Arama testi (0.0): şeffaf — en iyi eşleşmeleri skoruyla göster;
          kısa sorgular/kısaltmalar sessizce elenmesin.
        None çağrı anında okunur (monkeypatch/ayar değişikliğine saygılı)."""
        thr = MIN_SCORE if min_score is None else min_score
        if self.col.count() == 0:
            return []
        res = self.col.query(query_texts=[question], n_results=min(top_k, self.col.count()))
        out = []
        for text, meta, dist in zip(res["documents"][0], res["metadatas"][0], res["distances"][0]):
            score = round(1.0 / (1.0 + dist), 4)   # mesafe → 0-1 benzerlik
            if score < thr:
                continue
            out.append({
                "text": text,
                "source": meta["source"],
                "page": meta["page"],
                "score": score,
            })
        return out
