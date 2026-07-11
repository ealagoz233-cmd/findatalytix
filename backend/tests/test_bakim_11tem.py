"""11 Tem derin bakım — canlıda yakalanan 2 bug'ın regresyon testleri.

1. Sürüm kayması: health "0.9.26" derken site "?v=0.9.31" servis ediyordu.
   Artık backend sürümü index.html'den okur — kayma imkânsız.
2. Bayat manşet: Google News akışı sıralı gelmeyince Haberler manşeti
   2 günlük habere düşüyordu; parse_rss artık tarihe göre sıralar.
"""

import re
from pathlib import Path

import main
import news


def test_surum_tek_kaynak_index_html():
    html = (Path(main.__file__).resolve().parent.parent / "index.html"
            ).read_text(encoding="utf-8")
    beklenen = re.search(r"\?v=([0-9][0-9.]*)", html).group(1)
    assert main.VERSION == beklenen


SIRASIZ_RSS = b"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <item>
    <title>Eski haber</title>
    <link>https://x.com/eski</link>
    <pubDate>Wed, 08 Jul 2026 09:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Tarihsiz haber</title>
    <link>https://x.com/tarihsiz</link>
  </item>
  <item>
    <title>Taze haber</title>
    <link>https://x.com/taze</link>
    <pubDate>Fri, 10 Jul 2026 21:00:00 GMT</pubDate>
  </item>
</channel></rss>"""


def test_manset_en_taze_haber():
    items = news.parse_rss(SIRASIZ_RSS)
    assert [i["title"] for i in items] == [
        "Taze haber", "Eski haber", "Tarihsiz haber"]   # yeni -> eski -> tarihsiz
