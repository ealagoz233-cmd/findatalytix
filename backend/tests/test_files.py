"""Belge dosyası saklama/servis/silme döngüsü (yan yana önizleme özelliği)."""


def test_upload_saves_serves_and_deletes_file(client, monkeypatch):
    import main

    class FakeStore:
        def add_document(self, fn, data, chunk_target=None):
            return {"filename": fn, "pages": 1, "chunks": 1}
        def delete_document(self, fn):
            return 1

    main._store = FakeStore()

    # Yükle -> orijinal dosya uploads/ altına kaydedilmeli
    files = {"file": ("mini.pdf", b"%PDF-1.4 sahte icerik", "application/pdf")}
    r = client.post("/api/documents", files=files)
    assert r.status_code == 200
    assert r.json()["status"] == "indexed"

    # Servis -> ayni baytlar, inline PDF olarak donmeli
    r2 = client.get("/api/documents/mini.pdf/file")
    assert r2.status_code == 200
    assert r2.content.startswith(b"%PDF")
    assert "pdf" in r2.headers["content-type"]

    # Sil -> dosya da gitmeli, servis 404'e dusmeli
    r3 = client.delete("/api/documents/mini.pdf")
    assert r3.status_code == 200
    assert client.get("/api/documents/mini.pdf/file").status_code == 404


def test_file_endpoint_missing_is_honest_404(client):
    """Eski surumde yuklenen (dosyasi olmayan) belge icin net 404 mesaji."""
    r = client.get("/api/documents/olmayan.pdf/file")
    assert r.status_code == 404
    assert "yeniden" in r.json()["detail"]
