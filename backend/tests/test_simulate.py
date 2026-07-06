"""Simülasyon: dinamik semboller + RAG toggle + geçmiş kaydı."""
def test_default_symbols(client):
    d = client.post("/api/simulate", json={"prompt": "piyasa nasil"}).json()
    assert d["symbols"] == ["XU030.IS", "QQQ"]
    assert set(d["metrics"].keys()) == {"XU030.IS", "QQQ"}

def test_rag_toggle_off(client):
    d = client.post("/api/simulate", json={"prompt": "test", "useRag": False}).json()
    assert d["aiMeta"]["ragMode"] == "off"

def test_history_records(client):
    client.post("/api/simulate", json={"prompt": "kayit testi"})
    h = client.get("/api/history").json()
    assert h["totalRuns"] >= 1 and h["weeklyRuns"] >= 1
    assert h["items"][0]["assets"]

def test_short_prompt_rejected(client):
    assert client.post("/api/simulate", json={"prompt": "x"}).status_code == 422
