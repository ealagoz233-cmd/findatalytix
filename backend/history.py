"""
FinDatalytix — history.py (Ay 5.2: kalıcı simülasyon geçmişi)
=============================================================
Her simülasyon history.json'a kaydedilir: son 50 kayıt saklanır,
totalRuns sayacı hiç sıfırlanmaz (durum çubuğundaki döngü sayacı
artık gerçek). Dosya bozulursa sıfırdan başlar, asla çökmez.
"""

from __future__ import annotations
import json, os, time, threading

FILE = "./history.json"
MAX_ITEMS = 50
_lock = threading.Lock()


def _load() -> dict:
    try:
        with open(FILE, encoding="utf-8") as f:
            data = json.load(f)
        assert isinstance(data.get("items"), list)
        return data
    except Exception:
        return {"totalRuns": 0, "items": []}


def record(prompt: str, metrics: dict, mode: str, confidence) -> None:
    with _lock:
        data = _load()
        data["totalRuns"] = int(data.get("totalRuns", 0)) + 1
        data["items"].insert(0, {
            "ts": time.time(),
            "prompt": prompt[:120],
            "sharpeA": metrics["A"]["sharpe"], "sharpeB": metrics["B"]["sharpe"],
            "cagrA": metrics["A"]["cagr"],   "cagrB": metrics["B"]["cagr"],
            "mode": mode,
            "confidence": confidence,
        })
        data["items"] = data["items"][:MAX_ITEMS]
        tmp = FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, FILE)   # atomik yazım: yarıda kesilirse dosya bozulmaz


def snapshot() -> dict:
    return _load()
