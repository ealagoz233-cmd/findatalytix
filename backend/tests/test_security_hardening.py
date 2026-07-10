"""Güvenlik sertleştirmesi (10 Tem denetimi) regresyon testleri.

Kapatılan açıklar:
1. XFF sahteciliği: ilk durağa güvenmek rate limiti atlatıyordu — artık son durak.
2. Upload (POST /api/documents) pahalı sınıfta değildi — 200/dk x 20MB mümkündü.
3. Gövde freni yoktu — dev Content-Length iddiası RAM'i şişirebilirdi.
4. ReportRequest.aiText sınırsızdı.
"""

from fastapi.testclient import TestClient

import main


class _FakeReq:
    """_client_ip için minimal istek maketi."""
    def __init__(self, xff=None, host="10.0.0.1"):
        self.headers = {} if xff is None else {"x-forwarded-for": xff}
        self.client = type("C", (), {"host": host})()


def test_xff_son_durak_kullanilir():
    # Saldırgan kendi XFF'ini gönderir: "sahte-ip" İLK durakta durur;
    # güvenilir proxy'nin eklediği gerçek IP SONDA. Son alınmalı.
    req = _FakeReq(xff="6.6.6.6, 203.0.113.9")
    assert main._client_ip(req) == "203.0.113.9"


def test_xff_yoksa_dogrudan_ip():
    assert main._client_ip(_FakeReq()) == "10.0.0.1"


def test_upload_pahali_liste_ucuz():
    assert main._is_expensive("/api/documents", "POST") is True    # indeksleme
    assert main._is_expensive("/api/documents", "GET") is False    # liste
    assert main._is_expensive("/api/simulate", "POST") is True
    assert main._is_expensive("/api/health", "GET") is False


def test_dev_govde_iddiasi_erken_reddedilir():
    client = TestClient(main.app)
    r = client.get("/api/health",
                   headers={"content-length": str(main._MAX_BODY + 1)})
    assert r.status_code == 413


def test_rapor_aitext_siniri():
    client = TestClient(main.app)
    r = client.post("/api/report", json={
        "metrics": {},
        "aiText": "x" * 40001,
    })
    assert r.status_code == 422
