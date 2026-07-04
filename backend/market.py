"""
FinDatalytix — market.py (Ay 1 borcu: gerçek piyasa verisi)
===========================================================
Görevi tek cümle: bir ticker için son 2 yılın günlük kapanışlarından
GBM parametrelerini (mu, sigma) tahmin etmek.

Tasarım kararları:
- ÖNBELLEK: Yahoo'ya her simülasyonda gitmek hem yavaş hem kaba.
  Sonuçlar 1 saat (TTL) bellekte tutulur.
- FALLBACK: İnternet yok / Yahoo cevap vermiyor / veri yetersiz →
  sabit varsayılan parametrelere düşülür ve cevapta source="fallback"
  olarak İTİRAF edilir. Sistem asla bu yüzden çökmez.
- mu TAHMİNİ: GBM sürüklenmesi log-getirilerden şöyle çıkar:
      mu = ortalama(log_getiri) * 252 + sigma^2 / 2
  (Ito düzeltmesi — log getiri ortalamasını doğrudan mu sanmak
  klasik acemi hatasıdır, sigma^2/2 terimi şarttır.)
"""

from __future__ import annotations

import time
import logging

import numpy as np

logger = logging.getLogger("findatalytix.market")

try:
    import yfinance as yf
    YF_AVAILABLE = True
except ImportError:  # yfinance kurulu değilse bile uygulama ayakta kalır
    YF_AVAILABLE = False
    logger.warning("yfinance kurulu değil; tüm varlıklar fallback kullanacak.")

TRADING_DAYS = 252
HISTORY_PERIOD = "2y"
MIN_OBSERVATIONS = 60        # bundan az günlük veri = güvenilmez tahmin
CACHE_TTL_SECONDS = 3600     # 1 saat

# ticker -> (zaman_damgasi, mu, sigma)
_cache: dict[str, tuple[float, float, float]] = {}


def estimate_from_closes(closes: np.ndarray) -> tuple[float, float]:
    """Kapanış serisinden (mu, sigma) tahmini. Saf numpy — test edilebilir."""
    closes = np.asarray(closes, dtype=float)
    log_ret = np.diff(np.log(closes))
    sigma = float(np.std(log_ret, ddof=1) * np.sqrt(TRADING_DAYS))
    mu = float(np.mean(log_ret) * TRADING_DAYS + 0.5 * sigma**2)
    return mu, sigma


def get_params(ticker: str, fallback_mu: float, fallback_sigma: float) -> tuple[float, float, str]:
    """(mu, sigma, source) döner. source: 'live' | 'cache' | 'fallback'."""

    now = time.time()

    # 1) Önbellek
    if ticker in _cache:
        ts, mu, sigma = _cache[ticker]
        if now - ts < CACHE_TTL_SECONDS:
            return mu, sigma, "cache"

    # 2) Canlı veri
    if YF_AVAILABLE:
        try:
            data = yf.download(
                ticker,
                period=HISTORY_PERIOD,
                interval="1d",
                progress=False,
                auto_adjust=True,
                threads=False,
            )
            closes = data["Close"].dropna().to_numpy().ravel()
            if len(closes) < MIN_OBSERVATIONS:
                raise ValueError(
                    f"{ticker}: yalnızca {len(closes)} gözlem "
                    f"(en az {MIN_OBSERVATIONS} gerekli)"
                )
            mu, sigma = estimate_from_closes(closes)
            _cache[ticker] = (now, mu, sigma)
            logger.info("%s canlı: mu=%.4f sigma=%.4f (%d gözlem)",
                        ticker, mu, sigma, len(closes))
            return mu, sigma, "live"
        except Exception as exc:
            logger.warning("%s canlı veri alınamadı (%s) → fallback", ticker, exc)

    # 3) Zarif geri düşüş
    return fallback_mu, fallback_sigma, "fallback"
