import json, os

SETTINGS_FILE = "settings.json"
VALID_ANALYSTS = {"claude", "gemini"}

_default = {
    "analyst": "claude",
    "chunkTarget": 800,
    "topK": 5
}

def _sanitize(data: dict) -> dict:
    """Diskten gelen değerler SINIRLANIR: geçmişte doğrulamasız kaydedilmiş
    bozuk değer (örn. topK=0) tüm RAG aramasını 500'e düşürüyordu.
    Geçersiz alan sessizce varsayılana iyileşir — sistem asla bu yüzden çökmez."""
    out = {**_default, **data}
    if out.get("analyst") not in VALID_ANALYSTS:
        out["analyst"] = _default["analyst"]
    for key, lo, hi in (("chunkTarget", 300, 1200), ("topK", 1, 20)):
        v = out.get(key)
        if not isinstance(v, int) or not (lo <= v <= hi):
            out[key] = _default[key]
    return out


def load() -> dict:
    if not os.path.exists(SETTINGS_FILE):
        return _default.copy()
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            return _sanitize(json.load(f))
    except Exception:
        return _default.copy()

def get(key: str):
    return load().get(key, _default.get(key))

def save(updates: dict) -> dict:
    data = load()
    data.update(updates)
    # Atomik yazım (history.py ile aynı desen): yazım yarıda kesilirse
    # settings.json bozulmaz — bozuk dosya sessizce varsayılana düşürüyordu.
    tmp = SETTINGS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f)
    os.replace(tmp, SETTINGS_FILE)
    return data
