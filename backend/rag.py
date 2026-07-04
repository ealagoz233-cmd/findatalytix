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

def chunk_pages(pages: list[tuple[int, str]]) -> list[dict]:
    """[{text, page, chunk}] listesi üretir."""
    chunks: list[dict] = []
    index = 0

    for page_no, page_text in pages:
        paragraphs = [p.strip() for p in page_text.split("\n\n") if p.strip()]
        # Tek büyük blok geldiyse satırlardan böl
        if len(paragraphs) <= 1 and len(page_text) > CHUNK_TARGET_CHARS:
            paragraphs = [p.strip() for p in page_text.split("\n") if p.strip()]

        buffer = ""
        for para in paragraphs:
            candidate = (buffer + "\n\n" + para).strip() if buffer else para
            if len(candidate) >= CHUNK_TARGET_CHARS and buffer:
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

class RagStore:

    def __init__(self, path: str = "./chroma_db", embedder=None):
        self.client = chromadb.PersistentClient(path=path)
        kwargs = {"embedding_function": embedder} if embedder is not None else {}
        self.col = self.client.get_or_create_collection(COLLECTION_NAME, **kwargs)

    # ---- yazma ----

    def add_document(self, filename: str, data: bytes) -> dict:
        if self.has_document(filename):
            raise ValueError(f"'{filename}' zaten indeksli. Önce silin.")

        pages = extract_text(filename, data)
        if not pages:
            raise ValueError(f"'{filename}' içinden metin çıkarılamadı (boş ya da taranmış görüntü olabilir).")

        chunks = chunk_pages(pages)
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

    def query(self, question: str, top_k: int = 5) -> list[dict]:
        if self.col.count() == 0:
            return []
        res = self.col.query(query_texts=[question], n_results=min(top_k, self.col.count()))
        out = []
        for text, meta, dist in zip(res["documents"][0], res["metadatas"][0], res["distances"][0]):
            score = round(1.0 / (1.0 + dist), 4)   # mesafe → 0-1 benzerlik
            if score < 0.50:
                continue
            out.append({
                "text": text,
                "source": meta["source"],
                "page": meta["page"],
                "score": score,
            })
        return out
