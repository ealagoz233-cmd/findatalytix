"""Ortak test araçları: sahte AI ve sahte RAG deposu enjeksiyonu."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
import numpy as np, pandas as pd

class FakeEmbedder:
    """Kelime-hash tabanlı deterministik embedding (ağ gerektirmez)."""
    def _vec(self, t):
        import hashlib
        v = np.zeros(64)
        for w in t.lower().split():
            v[int(hashlib.md5(w.encode()).hexdigest()[:6], 16) % 64] += 1
        n = np.linalg.norm(v)
        return (v / n if n else v).tolist()
    def __call__(self, input): return [self._vec(t) for t in input]
    def embed_query(self, input): return self(input)
    def embed_documents(self, input): return self(input)
    def name(self): return "fake-embedder"
    def is_legacy(self): return False

@pytest.fixture
def client(tmp_path, monkeypatch):
    """settings.json/history.json'ı geçici dizine yönlendirilmiş TestClient."""
    monkeypatch.chdir(tmp_path)
    import importlib
    import settings, history, ai, main
    importlib.reload(settings); importlib.reload(history)
    importlib.reload(ai); importlib.reload(main)
    from fastapi.testclient import TestClient
    ai.extract_symbols = lambda p: []
    ai.route_query = lambda p: [p]
    main._store = type("S", (), {"query": lambda self, q, top_k=3: []})()
    return TestClient(main.app)
