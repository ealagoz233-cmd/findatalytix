"""chunkTarget ayarının GERÇEKTEN etkili olduğunun kanıtı (eski 5a maddesi)."""
import rag


def _pages(n_para=40, para_len=120):
    text = "\n\n".join("x" * para_len for _ in range(n_para))
    return [(1, text)]


def test_chunk_target_actually_changes_chunking():
    """Küçük hedef -> daha çok, daha kısa chunk. Ayar artık boşa değil."""
    small = rag.chunk_pages(_pages(), target_chars=300)
    large = rag.chunk_pages(_pages(), target_chars=1200)
    assert len(small) > len(large)
    assert max(len(c["text"]) for c in small) < max(len(c["text"]) for c in large)


def test_chunk_target_default_when_none():
    """None -> modül varsayılanı (800); eski davranış birebir korunur."""
    assert rag.chunk_pages(_pages(), None) == rag.chunk_pages(_pages())


def test_settings_rejects_out_of_range_chunk(client):
    """300-1200 dışı chunkTarget 422 ile reddedilir (embedding kırpma koruması)."""
    r = client.post("/api/settings", json={"chunkTarget": 5000})
    assert r.status_code == 422
    r2 = client.post("/api/settings", json={"chunkTarget": 650})
    assert r2.status_code == 200
    assert r2.json()["chunkTarget"] == 650


def test_settings_rejects_out_of_range_topk(client):
    """topK=0 kaydedilebiliyordu -> ChromaDB n_results=0'ı reddedip tüm RAG
    aramasını 500'e düşürüyordu. Artık 1-20 dışı 422."""
    assert client.post("/api/settings", json={"topK": 0}).status_code == 422
    assert client.post("/api/settings", json={"topK": 21}).status_code == 422
    r = client.post("/api/settings", json={"topK": 5})
    assert r.status_code == 200
    assert r.json()["topK"] == 5


def test_load_heals_broken_settings_file(tmp_path, monkeypatch):
    """Diskte geçmişten kalan bozuk değer (topK=0) load()'da varsayılana
    iyileşir — mevcut kurulumlar dosyaya dokunmadan düzelir."""
    monkeypatch.chdir(tmp_path)
    import json, importlib
    import settings
    importlib.reload(settings)
    (tmp_path / "settings.json").write_text(
        json.dumps({"analyst": "gemini", "chunkTarget": 650, "topK": 0}),
        encoding="utf-8")
    data = settings.load()
    assert data["topK"] == 5          # bozuk 0 -> varsayılan
    assert data["chunkTarget"] == 650  # geçerli değer korunur
    assert data["analyst"] == "gemini"
