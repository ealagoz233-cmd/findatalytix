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
