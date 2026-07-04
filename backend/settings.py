import json, os

SETTINGS_FILE = "settings.json"
VALID_ANALYSTS = {"claude", "gemini"}

_default = {
    "analyst": "claude",
    "chunkTarget": 800,
    "topK": 5
}

def load() -> dict:
    if not os.path.exists(SETTINGS_FILE):
        return _default.copy()
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return {**_default, **data}
    except Exception:
        return _default.copy()

def get(key: str):
    return load().get(key, _default.get(key))

def save(updates: dict) -> dict:
    data = load()
    data.update(updates)
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f)
    return data
