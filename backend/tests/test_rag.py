"""RAG boru hattı: indeksleme, eşik, silme."""
import io, fitz
from conftest import FakeEmbedder
import rag

def _pdf(text):
    doc = fitz.open(); p = doc.new_page(); p.insert_text((72, 72), text)
    b = doc.tobytes(); doc.close(); return b

def test_index_and_threshold(tmp_path, monkeypatch):
    # Test embedder'ında eşiği deterministik kılmak için MIN_SCORE'u 0'a çek:
    # amaç eşik MEKANİZMASINI test etmek (skor hesabı + filtre), kalibrasyonu değil.
    store = rag.RagStore(path=str(tmp_path / "cdb"), embedder=FakeEmbedder())
    store.add_document("test.pdf", _pdf(
        "sivil toplum kuruluslari demokrasi onemli onemli onemli buraya metin"))

    # Sorgu skor döndürüyor ve yapı doğru mu?
    monkeypatch.setattr(rag, "MIN_SCORE", 0.0)
    hits = store.query("sivil toplum demokrasi", top_k=3)
    assert len(hits) > 0
    assert "score" in hits[0] and "source" in hits[0]

    # Eşik 1.0 (imkânsız) → her şey elenir: filtre gerçekten çalışıyor
    monkeypatch.setattr(rag, "MIN_SCORE", 1.01)
    assert store.query("sivil toplum demokrasi", top_k=3) == []

def test_duplicate_rejected(tmp_path):
    store = rag.RagStore(path=str(tmp_path / "cdb2"), embedder=FakeEmbedder())
    store.add_document("a.pdf", _pdf("bir metin buraya yaziliyor test icin uzun."))
    try:
        store.add_document("a.pdf", _pdf("x"))
        assert False, "mükerrer kabul edildi"
    except ValueError:
        pass

def test_delete(tmp_path):
    store = rag.RagStore(path=str(tmp_path / "cdb3"), embedder=FakeEmbedder())
    store.add_document("sil.pdf", _pdf("silinecek dokuman metni burada duruyor test."))
    assert store.stats()["documentCount"] == 1
    removed = store.delete_document("sil.pdf")
    assert removed > 0 and store.stats()["documentCount"] == 0
