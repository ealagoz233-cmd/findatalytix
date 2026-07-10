"""Haberler modülü testleri — ağ YOK, saf ayrıştırma + sözleşme."""

import time

import pytest
from fastapi.testclient import TestClient

import main
import news


ORNEK_RSS = b"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>"borsa" - Google Haberler</title>
  <item>
    <title>BIST 100 rekor tazeledi - Ekonomi Gazetesi</title>
    <link>https://ornek.com/haber-1</link>
    <pubDate>Fri, 10 Jul 2026 08:30:00 GMT</pubDate>
    <source url="https://ornek.com">Ekonomi Gazetesi</source>
  </item>
  <item>
    <title>Dolar yatay seyrediyor</title>
    <link>https://ornek.com/haber-2</link>
  </item>
  <item>
    <title></title>
    <link>https://bos-baslik-atlanmali.com</link>
  </item>
</channel></rss>"""


def test_rss_ayristirma():
    items = news.parse_rss(ORNEK_RSS)
    assert len(items) == 2                       # boş başlık atlandı

    ilk = items[0]
    assert ilk["title"] == "BIST 100 rekor tazeledi"   # kaynak kırpıldı
    assert ilk["source"] == "Ekonomi Gazetesi"
    assert ilk["link"] == "https://ornek.com/haber-1"
    assert ilk["ts"] is not None                 # pubDate çözüldü

    assert items[1]["source"] == "?"             # source etiketi yoksa
    assert items[1]["ts"] is None


def test_bilinmeyen_kategori_422():
    client = TestClient(main.app)
    r = client.get("/api/news?cat=magazin")
    assert r.status_code == 422


def test_onbellek_ve_bayat_yedek(monkeypatch):
    # 1) Taze çekim önbelleğe yazılır
    sayac = {"n": 0}

    def sahte_fetch(url, timeout):
        sayac["n"] += 1

        class R:
            def read(self):
                return ORNEK_RSS

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        return R()

    monkeypatch.setattr(news.urllib.request, "urlopen", sahte_fetch)
    news._cache.clear()
    ilk = news.get_news("piyasalar", "tr")
    assert len(ilk) == 2 and sayac["n"] == 1

    # 2) Önbellek varken ağa çıkılmaz
    news.get_news("piyasalar", "tr")
    assert sayac["n"] == 1

    # 3) Süre dolmuş + ağ çökmüş -> bayat-ama-sağlam yedeği
    eski_ts, eski_items = news._cache[("piyasalar", "tr")]
    news._cache[("piyasalar", "tr")] = (eski_ts - 9999, eski_items)

    def cokmus(url, timeout):
        raise OSError("ağ yok")

    monkeypatch.setattr(news.urllib.request, "urlopen", cokmus)
    assert news.get_news("piyasalar", "tr") == eski_items

    # 4) Önbellek de yoksa dürüst hata
    news._cache.clear()
    with pytest.raises(ConnectionError):
        news.get_news("piyasalar", "tr")
