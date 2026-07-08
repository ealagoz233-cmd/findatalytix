"""Rapor arşivi döngüsü: üret -> arşivde listele -> indir -> sil."""


def test_report_archive_cycle(client):
    # Üret: gerçek .docx döner VE reports/ altına kopya kaydedilir
    payload = {"prompt": "test", "metrics": {"X.IS": {
        "model": "X.IS", "cagr": 10.0, "vol": 20.0, "sharpe": 0.5, "mdd": -8.0}}}
    r = client.post("/api/report", json=payload)
    assert r.status_code == 200
    assert r.content[:2] == b"PK"          # docx = zip imzası

    # Listele: az önce üretilen rapor arşivde görünmeli
    lst = client.get("/api/reports").json()
    assert lst["count"] >= 1
    name = lst["reports"][0]["name"]
    assert name.endswith(".docx")
    assert lst["reports"][0]["sizeKB"] > 0

    # İndir: aynı imza
    dl = client.get("/api/reports/" + name)
    assert dl.status_code == 200
    assert dl.content[:2] == b"PK"

    # Sil: sonra 404
    assert client.delete("/api/reports/" + name).status_code == 200
    assert client.get("/api/reports/" + name).status_code == 404


def test_report_download_missing_404(client):
    assert client.get("/api/reports/olmayan.docx").status_code == 404
    assert client.delete("/api/reports/olmayan.docx").status_code == 404
