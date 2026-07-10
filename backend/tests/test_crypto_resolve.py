"""Kripto sembol çözümleme testleri.

Kural (analysis._resolve):
- Bilinen kripto kodu (BTC, ETH...) -> ÖNCE "-USD" spot parite denenir.
  Sebep: Yahoo'da "BTC" tek başına bir ETF (Grayscale) — kullanıcı
  Bitcoin'i kasteder, ETF'e düşmek sessiz yanlış veri demek.
- BIST önceliği bozulmaz: noktasız tanınmayan sembolde önce ".IS".
- Tam yazılmış sembole (nokta ya da tire içeren) dokunulmaz.
"""

import analysis


def test_kripto_kodu_once_usd_paritesi(monkeypatch):
    calls = []

    def fake(t):
        calls.append(t)
        return "DF" if t == "BTC-USD" else None

    monkeypatch.setattr(analysis, "_download", fake)
    assert analysis._resolve("btc") == ("BTC-USD", "DF")
    assert calls[0] == "BTC-USD"          # ETF tuzağından önce parite


def test_kripto_asla_etf_e_dusmez(monkeypatch):
    """BTC-USD indirilemezse sonuç None olmalı — çıplak 'BTC' (Grayscale
    ETF) ASLA denenmemeli. Canlıda yaşandı: deploy ısınırken tek seferlik
    Yahoo hatası ETF verisini 15 dk önbelleğe sokmuştu."""
    calls = []

    def fake(t):
        calls.append(t)
        return None                        # Yahoo geçici olarak düşük

    monkeypatch.setattr(analysis, "_download", fake)
    assert analysis._resolve("BTC") is None
    assert calls == ["BTC-USD"]           # tek aday; ETF denenmedi


def test_bist_onceligi_bozulmadi(monkeypatch):
    calls = []

    def fake(t):
        calls.append(t)
        return "DF" if t == "THYAO.IS" else None

    monkeypatch.setattr(analysis, "_download", fake)
    assert analysis._resolve("thyao") == ("THYAO.IS", "DF")
    assert calls[0] == "THYAO.IS"


def test_tam_yazilmis_sembole_dokunulmaz(monkeypatch):
    calls = []

    def fake(t):
        calls.append(t)
        return "DF"

    monkeypatch.setattr(analysis, "_download", fake)
    assert analysis._resolve("BTC-USD") == ("BTC-USD", "DF")
    assert calls == ["BTC-USD"]           # tek deneme, ek aday yok


def test_bayat_ama_saglam_yedegi(monkeypatch):
    """Taze indirme düşerse süresi geçmiş önbellek sunulur; önbellek
    de boşsa dürüst None (=404). Yahoo'nun Render IP'sine aralıklı
    nazlanması canlıda yaşandı — kullanıcı veri varken 404 görmesin."""
    monkeypatch.setattr(analysis, "_resolve", lambda s: None)

    bayat = {"symbol": "BTC", "resolved": "BTC-USD", "dates": ["01.01.25"]}
    eski_zaman = 0.0                       # TTL çoktan dolmuş
    monkeypatch.setitem(analysis._cache, "BTC", (eski_zaman, bayat))
    assert analysis.get_asset("BTC") == bayat

    analysis._cache.pop("YOKSEMBOL", None)
    assert analysis.get_asset("YOKSEMBOL") is None


def test_kripto_kumesi_watchlistte_ayni():
    # watchlist aynı kümeyi analysis'ten alır — kopya küme türemesin
    import watchlist
    assert watchlist.CRYPTO_USD is analysis.CRYPTO_USD
