"""
FinDatalytix — watchlist.py (v0.9.x: İzleme Listesi)
====================================================
GET /api/watchlist için: N sembolün son fiyatı, günlük değişimi ve
7 günlük sparkline verisi.

Tasarım kararları:
- TOPLU İNDİRME: semboller Yahoo'ya tek batch istekte gider.
- .IS ÇÖZÜMLEME: noktasız semboller ilk turda bulunamazsa ikinci
  batch'te ".IS" ekiyle denenir (THYAO -> THYAO.IS).
- SEMBOL BAZLI ÖNBELLEK (55 sn): frontend 60 sn'de bir sorar;
  önbellek TTL'i bunun hemen altında — her poll tek batch, sembol
  ekleyip çıkarmak diğerlerinin önbelleğini bozmaz.
- HATAYA DAYANIKLILIK: veri gelmeyen sembol {"error": ...} olarak
  döner; listenin geri kalanını asla düşürmez.
"""

from __future__ import annotations

import time
import logging

import pandas as pd

# Kripto kodları analysis.py'da tek yerden yönetilir ("BTC" ETF tuzağı
# ve "-USD" parite kuralı orada belgeli). Buradan da aynı küme kullanılır.
from analysis import CRYPTO_USD

logger = logging.getLogger("findatalytix.watchlist")

try:
    import yfinance as yf
    YF_AVAILABLE = True
except ImportError:
    YF_AVAILABLE = False

CACHE_TTL = 55          # saniye — frontend polling'in (60 sn) hemen altında
SPARK_POINTS = 7        # sparkline nokta sayısı (son 7 kapanış)
_cache: dict[str, tuple[float, dict]] = {}


def _batch(symbols: list[str]) -> pd.DataFrame | None:
    if not YF_AVAILABLE or not symbols:
        return None
    try:
        df = yf.download(symbols, period="10d", interval="1d",
                         progress=False, auto_adjust=True,
                         threads=False, group_by="ticker")
        return df if df is not None and len(df) else None
    except Exception as exc:
        logger.warning("Watchlist batch indirilemedi: %s", exc)
        return None


def _extract(df: pd.DataFrame | None, ticker: str) -> dict | None:
    """Batch sonucundan tek sembolün kotasyonunu çıkarır; yoksa None."""
    if df is None:
        return None
    try:
        sub = df[ticker] if isinstance(df.columns, pd.MultiIndex) else df
        closes = sub["Close"].dropna()
        if len(closes) < 2:
            return None
        spark = [round(float(x), 4) for x in closes.tolist()][-SPARK_POINTS:]
        last, prev = spark[-1], spark[-2]
        return {
            "last": round(last, 2),
            "changePct": round((last / prev - 1) * 100, 2),
            "spark": spark,
        }
    except Exception:
        return None


# Bayat-ama-sağlam: sembol başına SON SAĞLAM kotasyon. Yahoo aralıklı
# nazlanınca (canlıda AAPL fiyat<->"veri bulunamadı" arasında zıplıyordu,
# satır boyu da değişip düzeni oynatıyordu) hata rozeti yerine son fiyat
# sunulur; rozet yalnızca elimizde HİÇ veri yokken görünür.
_last_good: dict[str, dict] = {}


def get_quotes(symbols: list[str]) -> list[dict]:
    now = time.time()
    results: dict[str, dict] = {}
    missing: list[str] = []

    # 1) Önbellek
    for s in symbols:
        cached = _cache.get(s)
        if cached and now - cached[0] < CACHE_TTL:
            results[s] = cached[1]
        else:
            missing.append(s)

    # 2) İlk batch: semboller olduğu gibi
    if missing:
        # Kripto kodları spot pariteye yönlendirilir (BTC -> BTC-USD);
        # diğerleri olduğu gibi sorgulanır.
        qmap = {s: (f"{s}-USD" if s in CRYPTO_USD else s) for s in missing}
        df = _batch(list(qmap.values()))
        retry: list[str] = []
        for s in missing:
            q = _extract(df, qmap[s])
            if q is not None:
                item = {"symbol": s, "resolved": qmap[s], **q}
                _cache[s] = (now, item)
                _last_good[s] = item
                results[s] = item
            elif "." not in s and s not in CRYPTO_USD:
                retry.append(s)          # .IS ile tekrar denenecek
            else:
                # Hata da önbelleğe yazılır: bozuk sembol her 60 sn'lik
                # poll'da Yahoo'yu yeniden dövmesin (ban riski + boşa istek).
                # Elde eski sağlam fiyat varsa rozet yerine O sunulur.
                item = _last_good.get(s) or {"symbol": s, "resolved": s,
                                             "error": "veri bulunamadı"}
                _cache[s] = (now, item)
                results[s] = item

        # 3) İkinci batch: BIST çözümlemesi (THYAO -> THYAO.IS)
        if retry:
            candidates = [s + ".IS" for s in retry]
            df2 = _batch(candidates)
            for s, cand in zip(retry, candidates):
                q = _extract(df2, cand)
                if q is not None:
                    item = {"symbol": s, "resolved": cand, **q}
                    _last_good[s] = item
                else:
                    item = _last_good.get(s) or {"symbol": s, "resolved": s,
                                                 "error": "veri bulunamadı"}
                _cache[s] = (now, item)
                results[s] = item

    # İstenen sırayı koru
    return [results[s] for s in symbols if s in results]
