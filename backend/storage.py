"""
FinDatalytix — storage.py (Aşama 3: RAG belge kalıcılığı)
=========================================================
Sorun: Render free plan diski GEÇİCİ → ./uploads ve ./chroma_db her
restart'ta silinir, yüklenen belgeler uçar.

Çözüm (Yol A): orijinal dosya Supabase Storage'a (kalıcı) da yazılır;
sunucu açılışta (ilk RAG isteğinde) oradan indirip ChromaDB indeksini
yeniden kurar (rehydrate). Kalıcı kaynak = Storage; hızlı arama = Chroma.

ENV (Render panelinde girilir, koda ASLA yazılmaz):
  SUPABASE_URL          https://<proj>.supabase.co
  SUPABASE_SERVICE_KEY  service_role anahtarı (server-side, RLS bypass eder)
  SUPABASE_BUCKET       (opsiyonel) varsayılan: rag-docs

Bu değişkenler yoksa modül SESSİZCE devre dışı kalır: backend eskisi gibi
yalnız yerel diske yazar (yerel geliştirme + geriye uyumluluk bozulmaz).
"""
from __future__ import annotations

import os
import logging

logger = logging.getLogger("findatalytix.storage")

try:
    import requests as _requests
except Exception:                       # requests yoksa Storage sessizce kapalı
    _requests = None

_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
BUCKET = os.getenv("SUPABASE_BUCKET", "rag-docs")
_TIMEOUT = 30


def enabled() -> bool:
    """Storage yalnızca URL + service key + requests hepsi varsa açık."""
    return bool(_URL and _KEY and _requests is not None)


def _headers(extra: dict | None = None) -> dict:
    h = {"Authorization": f"Bearer {_KEY}", "apikey": _KEY}
    if extra:
        h.update(extra)
    return h


def upload(name: str, data: bytes,
           content_type: str = "application/octet-stream") -> bool:
    """Dosyayı buluta yaz (upsert = varsa üzerine). Başarısızsa False
    döner, ASLA patlamaz — indeksleme yine geçerli sayılır."""
    if not enabled():
        return False
    try:
        r = _requests.post(
            f"{_URL}/storage/v1/object/{BUCKET}/{name}",
            data=data,
            headers=_headers({"Content-Type": content_type, "x-upsert": "true"}),
            timeout=_TIMEOUT,
        )
        if r.status_code in (200, 201):
            return True
        logger.warning("storage upload %s: HTTP %s %s", name, r.status_code, r.text[:200])
    except Exception as e:                          # ağ/geçici hata → yut
        logger.warning("storage upload %s hata: %s", name, e)
    return False


def download(name: str) -> bytes | None:
    """Dosya baytlarını indir; yoksa/başarısızsa None."""
    if not enabled():
        return None
    try:
        r = _requests.get(f"{_URL}/storage/v1/object/{BUCKET}/{name}",
                          headers=_headers(), timeout=_TIMEOUT)
        return r.content if r.status_code == 200 else None
    except Exception as e:
        logger.warning("storage download %s hata: %s", name, e)
        return None


def list_names() -> list[str]:
    """Bucket'taki dosya adları (düz liste). Başarısızsa boş liste."""
    if not enabled():
        return []
    try:
        r = _requests.post(
            f"{_URL}/storage/v1/object/list/{BUCKET}",
            json={"prefix": "", "limit": 1000,
                  "sortBy": {"column": "name", "order": "asc"}},
            headers=_headers({"Content-Type": "application/json"}),
            timeout=_TIMEOUT,
        )
        if r.status_code != 200:
            logger.warning("storage list: HTTP %s %s", r.status_code, r.text[:200])
            return []
        return [o["name"] for o in r.json() if o.get("name")]
    except Exception as e:
        logger.warning("storage list hata: %s", e)
        return []


def delete(name: str) -> bool:
    """Dosyayı buluttan sil. Başarısızsa False, patlamaz."""
    if not enabled():
        return False
    try:
        r = _requests.delete(f"{_URL}/storage/v1/object/{BUCKET}/{name}",
                             headers=_headers(), timeout=_TIMEOUT)
        return r.status_code == 200
    except Exception as e:
        logger.warning("storage delete %s hata: %s", name, e)
        return False
