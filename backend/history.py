"""
FinDatalytix — history.py (Ay 5.2: kalıcı simülasyon geçmişi)
=============================================================
Her simülasyon history.json'a kaydedilir: son 50 kayıt saklanır,
totalRuns sayacı hiç sıfırlanmaz (durum çubuğundaki döngü sayacı
artık gerçek). Dosya bozulursa sıfırdan başlar, asla çökmez.
"""

from __future__ import annotations
import json, os, time, threading, datetime

FILE = "./history.json"
MAX_ITEMS = 50
WEEKLY_LIMIT = 600   # durum çubuğundaki döngü tavanı — artık backend yönetiyor
_lock = threading.Lock()


def _load() -> dict:
    try:
        with open(FILE, encoding="utf-8") as f:
            data = json.load(f)
        assert isinstance(data.get("items"), list)
        return data
    except Exception:
        return {"totalRuns": 0, "weeklyCycles": {}, "items": []}


def record(prompt: str, metrics: dict, mode: str, confidence) -> None:
    with _lock:
        data = _load()
        y, w, _ = datetime.date.today().isocalendar()
        cycle_key = f"{y}-W{w:02d}"
        
        data["totalRuns"] = int(data.get("totalRuns", 0)) + 1
        cycles = data.get("weeklyCycles", {})
        cycles[cycle_key] = cycles.get(cycle_key, 0) + 1
        data["weeklyCycles"] = cycles
        data["items"].insert(0, {
            "ts": time.time(),
            "prompt": prompt[:120],
            # Dinamik varlıklar (v0.9): her simülasyondaki tüm semboller
            "assets": [{"sym": k, "sharpe": m["sharpe"], "cagr": m["cagr"]}
                       for k, m in metrics.items()],
            "mode": mode,
            "confidence": confidence,
        })
        data["items"] = data["items"][:MAX_ITEMS]
        tmp = FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, FILE)   # atomik yazım: yarıda kesilirse dosya bozulmaz


def snapshot() -> dict:
    data = _load()
    y, w, _ = datetime.date.today().isocalendar()
    cycle_key = f"{y}-W{w:02d}"
    data["weeklyRuns"] = data.get("weeklyCycles", {}).get(cycle_key, 0)
    data["weeklyLimit"] = WEEKLY_LIMIT
    return data
