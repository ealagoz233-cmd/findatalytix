"""
FinDatalytix — analysis.py (Ay 6: Varlık Analizi motoru)
========================================================
GET /api/asset/{symbol} için: 1 yıllık OHLCV + RSI(14) + MACD(12,26,9).

Tasarım kararları:
- SEMBOL ÇÖZÜMLEME: Kullanıcı "THYAO" yazar, Yahoo "THYAO.IS" ister.
  Nokta içermeyen sembollerde önce ".IS" (Borsa İstanbul) denenir,
  olmazsa ham hali (ABD hisseleri: AAPL, QQQ...) denenir.
- RSI: Wilder yumuşatması (klasik 14 periyot). İlk 14 değer NaN'dır.
- MACD: EMA12 - EMA26, sinyal EMA9, histogram = fark.
- NaN TEMİZLİĞİ: NaN geçerli JSON değildir; None'a çevrilir, yoksa
  tarayıcıdaki JSON.parse patlar.
- ÖNBELLEK: 15 dk TTL — grafikte her gezinti Yahoo'yu dövmesin.
"""

from __future__ import annotations

import time
import logging

import numpy as np
import pandas as pd

logger = logging.getLogger("findatalytix.analysis")

try:
    import yfinance as yf
    YF_AVAILABLE = True
except ImportError:
    YF_AVAILABLE = False

PERIOD = "1y"
MIN_OBSERVATIONS = 30
CACHE_TTL = 15 * 60
_cache: dict[str, tuple[float, dict]] = {}


# ----------------------------------------------------------
# Göstergeler — saf numpy/pandas, birim test edilebilir
# ----------------------------------------------------------

def rsi(closes: np.ndarray, period: int = 14) -> np.ndarray:
    """Wilder RSI. closes ile aynı uzunlukta; ilk `period` değer NaN."""
    c = np.asarray(closes, dtype=float)
    out = np.full(len(c), np.nan)
    if len(c) <= period:
        return out

    delta = np.diff(c)
    gain = np.where(delta > 0, delta, 0.0)
    loss = np.where(delta < 0, -delta, 0.0)

    avg_g = gain[:period].mean()
    avg_l = loss[:period].mean()

    def _rsi(g, l):
        if l == 0:
            return 100.0
        rs = g / l
        return 100.0 - 100.0 / (1.0 + rs)

    out[period] = _rsi(avg_g, avg_l)
    for i in range(period, len(delta)):
        avg_g = (avg_g * (period - 1) + gain[i]) / period
        avg_l = (avg_l * (period - 1) + loss[i]) / period
        out[i + 1] = _rsi(avg_g, avg_l)
    return out


def macd(closes: np.ndarray, fast=12, slow=26, signal=9):
    """(macd_line, signal_line, histogram) — closes uzunluğunda."""
    s = pd.Series(np.asarray(closes, dtype=float))
    ema_fast = s.ewm(span=fast, adjust=False).mean()
    ema_slow = s.ewm(span=slow, adjust=False).mean()
    line = ema_fast - ema_slow
    sig = line.ewm(span=signal, adjust=False).mean()
    hist = line - sig
    return line.to_numpy(), sig.to_numpy(), hist.to_numpy()


# ----------------------------------------------------------
# Veri çekme
# ----------------------------------------------------------

def _download(ticker: str) -> pd.DataFrame | None:
    """Test edilebilirlik için ayrı fonksiyon (testte monkeypatch edilir)."""
    if not YF_AVAILABLE:
        return None
    try:
        df = yf.download(ticker, period=PERIOD, interval="1d",
                         progress=False, auto_adjust=True, threads=False)
        if df is None or len(df) < MIN_OBSERVATIONS:
            return None
        # yfinance bazen MultiIndex kolon döner; düzleştir
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        return df
    except Exception as exc:
        logger.warning("%s indirilemedi: %s", ticker, exc)
        return None


# Bilinen kripto kodları: Yahoo'da spot fiyat "KOD-USD" biçimindedir.
# TUZAK: "BTC" tek başına Yahoo'da bir ETF'e (Grayscale Bitcoin Mini Trust)
# denk gelir — kullanıcı Bitcoin'i kasteder. Bu yüzden ÖNCE "-USD" denenir.
CRYPTO_USD = frozenset({
    "BTC", "ETH", "BNB", "SOL", "XRP", "DOGE", "ADA", "AVAX",
    "LINK", "TRX", "DOT", "MATIC", "LTC", "SHIB", "XLM",
})


def _resolve(symbol: str) -> tuple[str, pd.DataFrame] | None:
    s = symbol.strip().upper()
    if "." in s or "-" in s:
        candidates = [s]                  # tam yazılmış: THYAO.IS, BTC-USD
    elif s in CRYPTO_USD:
        candidates = [f"{s}-USD", s]      # kripto: önce spot parite
    else:
        candidates = [f"{s}.IS", s]       # önce Borsa İstanbul
    for cand in candidates:
        df = _download(cand)
        if df is not None:
            return cand, df
    return None


def _clean(arr) -> list:
    """NaN → None (geçerli JSON için)."""
    return [None if (x is None or (isinstance(x, float) and np.isnan(x)))
            else round(float(x), 4) for x in arr]


# ----------------------------------------------------------
# Ana giriş
# ----------------------------------------------------------

def get_asset(symbol: str) -> dict | None:
    key = symbol.strip().upper()
    now = time.time()

    if key in _cache and now - _cache[key][0] < CACHE_TTL:
        return _cache[key][1]

    resolved = _resolve(key)
    if resolved is None:
        return None
    ticker, df = resolved

    closes = df["Close"].to_numpy(dtype=float)
    dates = [d.strftime("%d.%m.%y") for d in df.index]
    ohlc = [
        [round(float(o), 2), round(float(c), 2), round(float(l), 2), round(float(h), 2)]
        for o, h, l, c in zip(df["Open"], df["High"], df["Low"], df["Close"])
    ]  # ECharts candlestick sırası: [açılış, kapanış, düşük, yüksek]

    rsi_vals = rsi(closes)
    macd_line, macd_sig, macd_hist = macd(closes)

    last = float(closes[-1])
    prev = float(closes[-2]) if len(closes) > 1 else last
    log_ret = np.diff(np.log(closes))

    result = {
        "symbol": key,
        "resolved": ticker,
        "dates": dates,
        "ohlc": ohlc,
        "rsi": _clean(rsi_vals),
        "macd": {
            "line": _clean(macd_line),
            "signal": _clean(macd_sig),
            "hist": _clean(macd_hist),
        },
        "summary": {
            "last": round(last, 2),
            "changePct": round((last / prev - 1) * 100, 2),
            "high52": round(float(df["High"].max()), 2),
            "low52": round(float(df["Low"].min()), 2),
            "volAnnual": round(float(np.std(log_ret, ddof=1) * np.sqrt(252) * 100), 2),
            "rsiNow": (round(float(rsi_vals[-1]), 1)
                       if not np.isnan(rsi_vals[-1]) else None),
            "observations": len(closes),
        },
    }
    _cache[key] = (now, result)
    return result
