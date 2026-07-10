"""İzleme listesi bayat-ama-sağlam testleri.

Canlıda görülen kusur (kullanıcı ekran görüntüsüyle raporladı):
Yahoo aralıklı nazlanınca AAPL satırı fiyat <-> "veri bulunamadı"
arasında zıplıyor, satır boyu değişip düzeni oynatıyordu.
Kural: hata rozeti YALNIZCA elimizde hiç veri yokken görünür.
"""

import watchlist


def _temiz():
    watchlist._cache.clear()
    watchlist._last_good.clear()


def test_bayat_fiyat_hata_rozetine_tercih_edilir(monkeypatch):
    _temiz()
    monkeypatch.setattr(watchlist, "_batch", lambda syms: "DF")
    monkeypatch.setattr(
        watchlist, "_extract",
        lambda df, t: {"last": 316.2, "changePct": 0.9, "spark": [1, 2]}
        if t == "AAPL" else None)

    ilk = watchlist.get_quotes(["AAPL"])[0]
    assert ilk["last"] == 316.2 and "error" not in ilk

    # Önbellek süresi doldu + Yahoo bu tur boş döndü -> son sağlam fiyat
    ts, item = watchlist._cache["AAPL"]
    watchlist._cache["AAPL"] = (ts - 9999, item)
    monkeypatch.setattr(watchlist, "_extract", lambda df, t: None)

    yine = watchlist.get_quotes(["AAPL"])[0]
    assert "error" not in yine
    assert yine["last"] == 316.2          # rozet yok, bayat fiyat var


def test_hic_veri_yoksa_durust_rozet(monkeypatch):
    _temiz()
    monkeypatch.setattr(watchlist, "_batch", lambda syms: None)
    monkeypatch.setattr(watchlist, "_extract", lambda df, t: None)

    q = watchlist.get_quotes(["ZZZZ"])[0]
    assert q.get("error")                 # ilk kez + veri yok -> dürüst hata
