"""Motor kilidi: Monte Carlo çekirdeği + piyasa tahmincisi.

Bu testler Faz 1 (findatalytix-engine'e taşınma) öncesi davranışı
kilitler: taşıma sırasında sayısal davranış değişirse burada patlar.
"""
import numpy as np

# Faz 1: cekirdek artik bagimsiz kutuphanede; testler motoru DOGRUDAN kilitler.
from findatalytix_engine.simulation import run_gbm, seed_from_prompt

import market


# ---------- Monte Carlo (run_gbm) ----------

def test_gbm_deterministic():
    """Aynı seed → birebir aynı sonuç (tekrarlanabilirlik sözleşmesi)."""
    a = run_gbm("TEST", mu=0.20, sigma=0.25, seed=42)
    b = run_gbm("TEST", mu=0.20, sigma=0.25, seed=42)
    assert a == b
    c = run_gbm("TEST", mu=0.20, sigma=0.25, seed=43)
    assert c["cagr"] != a["cagr"]          # farklı seed → farklı senaryo


def test_gbm_metric_sanity():
    """Metrikler mantık sınırlarında: vol>0, MDD<=0, model adı korunur."""
    m = run_gbm("XYZ.IS", mu=0.15, sigma=0.30, seed=7)
    assert m["model"] == "XYZ.IS"
    assert m["vol"] > 0
    assert m["mdd"] <= 0                    # düşüş asla pozitif olamaz
    assert set(m) == {"model", "cagr", "vol", "sharpe", "mdd"}


def test_seed_from_prompt_stable():
    """Aynı prompt → aynı seed; farklı prompt → farklı seed."""
    s1 = seed_from_prompt("THYAO ile AAPL")
    s2 = seed_from_prompt("THYAO ile AAPL")
    s3 = seed_from_prompt("GARAN ile MSFT")
    assert s1 == s2 and s1 != s3


# ---------- Piyasa tahmincisi (estimate_from_closes) ----------

def test_estimate_constant_growth():
    """Sabit günlük log-getirili seri: sigma≈0, mu≈r*252 (Ito terimi sıfır)."""
    r = 0.001                               # günlük log getiri
    closes = 100.0 * np.exp(r * np.arange(300))
    mu, sigma = market.estimate_from_closes(closes)
    assert abs(sigma) < 1e-9                # gürültüsüz seri → volatilite yok
    assert abs(mu - r * 252) < 1e-6


def test_estimate_known_volatility():
    """Bilinen sigma ile üretilmiş seriden tahmin, gerçeğe yakın olmalı."""
    rng = np.random.default_rng(123)
    daily_sigma = 0.02
    log_ret = rng.normal(0.0005, daily_sigma, 2000)
    closes = 100.0 * np.exp(np.cumsum(log_ret))
    mu, sigma = market.estimate_from_closes(closes)
    expected = daily_sigma * np.sqrt(252)
    assert abs(sigma - expected) / expected < 0.10   # %10 tolerans
