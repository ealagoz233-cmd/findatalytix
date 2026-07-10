"""
FinDatalytix — news.py (Haberler sekmesi veri katmanı)
======================================================
Kaynak: Google News RSS (anahtarsız, ücretsiz). Her kategori bir arama
sorgusudur; dil parametresiyle TR/EN akış değişir.

Tasarım kararları:
- SADECE stdlib (urllib + xml.etree) — yeni bağımlılık yok.
- 10 dk önbellek: hem hızlı hem kaynağa nazik (rate limit dostu).
- Bayat-ama-sağlam: taze çekim düşerse süresi geçmiş önbellek sunulur
  (analysis.get_asset ile aynı felsefe).
- Görsel YOK: RSS thumbnail vermiyor; sahte stok görsel koymuyoruz.
"""

from __future__ import annotations

import logging
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

logger = logging.getLogger("findatalytix.news")

CACHE_TTL = 600.0                 # 10 dk
FETCH_TIMEOUT = 10.0
MAX_ITEMS = 24

# Kategori -> arama sorgusu (dil bazlı). Anahtarlar API sözleşmesidir;
# frontend çipleri bu adlarla ister.
CATEGORIES: dict[str, dict[str, str]] = {
    "piyasalar": {"tr": "borsa OR piyasalar OR BIST",
                  "en": "stock market OR wall street"},
    "kripto":    {"tr": "kripto OR bitcoin OR ethereum",
                  "en": "crypto OR bitcoin OR ethereum"},
    "sirketler": {"tr": "şirket hisse bilanço",
                  "en": "company earnings stock"},
    "makro":     {"tr": "enflasyon OR faiz OR \"merkez bankası\"",
                  "en": "inflation OR interest rates OR fed"},
    "dunya":     {"tr": "küresel piyasalar OR fed OR ecb",
                  "en": "global markets OR ecb OR imf"},
}

_cache: dict[tuple[str, str], tuple[float, list[dict]]] = {}


def _feed_url(category: str, lang: str) -> str:
    q = urllib.parse.quote(CATEGORIES[category][lang])
    if lang == "en":
        return f"https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en"
    return f"https://news.google.com/rss/search?q={q}&hl=tr&gl=TR&ceid=TR:tr"


def parse_rss(xml_bytes: bytes) -> list[dict]:
    """RSS -> [{title, link, source, ts}] — ağ yok, saf ayrıştırma (testli).

    Google News başlığı çoğu zaman 'Başlık - Kaynak' biçimindedir;
    <source> etiketi varsa kaynak oradan alınır ve başlıktan kırpılır.
    """
    items: list[dict] = []
    root = ET.fromstring(xml_bytes)
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        source = (it.findtext("source") or "").strip()
        if source and title.endswith(" - " + source):
            title = title[: -(len(source) + 3)].rstrip()
        ts = None
        pub = it.findtext("pubDate")
        if pub:
            try:
                ts = parsedate_to_datetime(pub).timestamp()
            except (ValueError, TypeError):
                ts = None
        if title and link:
            items.append({"title": title, "link": link,
                          "source": source or "?", "ts": ts})
        if len(items) >= MAX_ITEMS:
            break
    return items


def get_news(category: str, lang: str = "tr") -> list[dict]:
    """Önbellekli haber listesi. Bilinmeyen kategori -> ValueError
    (endpoint 422'ye çevirir)."""
    if category not in CATEGORIES:
        raise ValueError(f"Bilinmeyen kategori: {category} "
                         f"(geçerli: {', '.join(CATEGORIES)})")
    lang = "en" if lang == "en" else "tr"

    key = (category, lang)
    now = time.time()
    hit = _cache.get(key)
    if hit and now - hit[0] < CACHE_TTL:
        return hit[1]

    try:
        req = urllib.request.Request(
            _feed_url(category, lang),
            headers={"User-Agent": "FinDatalytix/0.9 (+findatalytix.onrender.com)"})
        with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
            items = parse_rss(resp.read())
        _cache[key] = (now, items)
        return items
    except Exception as exc:                       # ağ/parse — tek kalemde
        logger.warning("Haber çekilemedi (%s/%s): %s", category, lang, exc)
        if hit:                                    # bayat-ama-sağlam
            return hit[1]
        raise ConnectionError("Haber kaynağına ulaşılamadı") from exc
