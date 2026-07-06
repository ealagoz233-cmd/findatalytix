"""findatalytix_engine.simulation — Monte Carlo çekirdeği (GBM)
================================================================
Backend'in main.py'sinden Faz 1'de taşındı; sayısal davranış birebir
korunuyor (backend/tests/test_engine.py determinizm kilidi bunu doğrular).

Sözleşmeler:
- Aynı seed → birebir aynı sonuç (tekrarlanabilirlik).
- Aynı prompt → aynı seed (SHA-256 tabanlı).
- Çıktı alanları sabit: model, cagr, vol, sharpe, mdd.
"""

from __future__ import annotations

import hashlib

import numpy as np

RISK_FREE = 0.05      # yıllık risksiz oran
TRADING_DAYS = 252
N_PATHS = 2_000       # Monte Carlo yol sayısı
HORIZON_DAYS = 252    # 1 yıllık ufuk


def run_gbm(model: str, mu: float, sigma: float, seed: int) -> dict:
    """Geometrik Brown hareketi ile N_PATHS yollu simülasyon.

    Döner: {"model", "cagr", "vol", "sharpe", "mdd"} — yüzdeler 2 hane
    yuvarlanmış, mdd negatif (ya da 0).
    """
    rng = np.random.default_rng(seed)
    dt = 1.0 / TRADING_DAYS

    z = rng.standard_normal((N_PATHS, HORIZON_DAYS))
    log_ret = (mu - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * z

    # Fiyat yolları: S0 = 100
    prices = 100.0 * np.exp(np.cumsum(log_ret, axis=1))
    prices = np.concatenate([np.full((N_PATHS, 1), 100.0), prices], axis=1)

    # CAGR: yol sonu değerlerinin ortalamasından
    terminal = prices[:, -1]
    cagr = float(np.mean(terminal / 100.0) - 1.0)

    # Yıllıklandırılmış volatilite: günlük log getirilerden
    vol = float(np.std(log_ret) * np.sqrt(TRADING_DAYS))

    # Sharpe: (getiri - risksiz) / volatilite
    sharpe = (cagr - RISK_FREE) / vol if vol > 0 else 0.0

    # Maksimum düşüş: her yolun kendi MDD'sinin ortalaması
    running_max = np.maximum.accumulate(prices, axis=1)
    drawdowns = prices / running_max - 1.0
    mdd = float(np.mean(np.min(drawdowns, axis=1)))

    return {
        "model": model,
        "cagr": round(cagr * 100, 2),    # %
        "vol": round(vol * 100, 2),      # %
        "sharpe": round(sharpe, 2),
        "mdd": round(mdd * 100, 2),      # % (negatif)
    }


def seed_from_prompt(prompt: str) -> int:
    """Aynı prompt -> aynı sonuç (tekrarlanabilirlik).
    Farklı prompt -> farklı senaryo."""
    return int(hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:8], 16)
