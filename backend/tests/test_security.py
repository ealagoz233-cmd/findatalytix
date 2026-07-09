"""Deploy sertleştirmesi (A): rate limit + güvenlik başlıkları + hata sızıntısı."""


def test_rate_limit_blocks_burst(client, monkeypatch):
    """Limit aşılınca 429 döner (Groq maliyet / Yahoo ban freni)."""
    import main
    monkeypatch.setattr(main, "_RL_LIMIT_DEFAULT", 3)
    main._rl_hits.clear()
    codes = [client.get("/api/health").status_code for _ in range(6)]
    assert codes.count(200) == 3       # ilk 3 geçer
    assert codes[-1] == 429            # sonrası bloklanır
    r = client.get("/api/health")
    assert "retry-after" in {k.lower() for k in r.headers}


def test_security_headers_present_no_frame_deny(client):
    """nosniff + referrer var; X-Frame-Options YOK (PDF iframe kırılmasın)."""
    r = client.get("/api/health")
    hdr = {k.lower(): v for k, v in r.headers.items()}
    assert hdr["x-content-type-options"] == "nosniff"
    assert hdr["referrer-policy"] == "no-referrer"
    assert "x-frame-options" not in hdr


def test_http_exceptions_survive_generic_handler(client):
    """Genel Exception handler, normal HTTPException'ları (404/422) EZMEMELİ."""
    main_mod = __import__("main")
    main_mod._rl_hits.clear()
    assert client.get("/api/reports/yok.docx").status_code == 404
    assert client.post("/api/settings", json={"topK": 0}).status_code == 422
