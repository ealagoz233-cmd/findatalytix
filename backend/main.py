"""
FinDatalytix — main.py (v0.9: Dinamik Portföy Motoru)
=====================================================
Çalıştırma:
    pip install -r requirements.txt
    uvicorn main:app --port 8000    # --reload KULLANMA: Windows'ta .env okumasini bozar

Endpoint'ler:
    POST /api/simulate        -> AI sembol çıkarma + N varlık Monte Carlo + analist/hakem
    POST /api/report          -> gerçek .docx risk raporu (indirilir)
    GET  /api/asset/{sembol}  -> 1 yıllık OHLCV + RSI + MACD
    POST/GET/DELETE /api/documents, POST /api/query  -> RAG
    GET  /api/history, /api/ai/status, /api/health
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from pathlib import Path as _Path

import market
import ai
import history
import analysis
import watchlist
import settings as app_settings

# Cekirdek motor artik bagimsiz kutuphane (Faz 1: pilot tasima).
# Alias'lar sayesinde asagidaki cagri noktalari degismedi.
from findatalytix_engine.simulation import (
    run_gbm as _run_gbm,
    seed_from_prompt as _seed_from_prompt,
)

# ----------------------------------------------------------
# Uygulama + CORS
# file:// ile açılan sayfanın Origin'i "null" olur; allow_origins=["*"]
# (credentials kapalıyken) hem file:// hem localhost sunucularını kapsar.
# ----------------------------------------------------------

# Surum GERCEKTEN tek kaynaktan: index.html'deki ?v= damgasi ne diyorsa
# API de onu soyler. "Elle iki yeri artir" plani ilk haftasinda cuvalladi
# (canlida health 0.9.26 derken site 0.9.31 servis ediyordu — 11 Tem bakim).
import re as _re


def _detect_version() -> str:
    try:
        html = (_Path(__file__).resolve().parent.parent / "index.html"
                ).read_text(encoding="utf-8")
        m = _re.search(r"\?v=([0-9][0-9.]*)", html)
        if m:
            return m.group(1)
    except OSError:
        pass
    return "0.9"


VERSION = _detect_version()
app = FastAPI(title="FinDatalytix API", version=VERSION)

# CORS: gelistirmede "*" (file:// Origin=null dahil calissin diye),
# deploy gununde .env'e CORS_ORIGINS=https://alanadi.com yazilarak daraltilir.
import os as _os
_origins = [o.strip() for o in _os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------------------------
# GÜVENLİK (deploy sertleştirmesi — A)
#  - Rate limiting: halka açıldığında birinin /simulate'i döverek Groq
#    kotasını yakmasını / Yahoo'yu ban ettirmesini engeller.
#  - Güvenlik başlıkları: nosniff + referrer (X-Frame-Options KOYULMAZ;
#    /documents/*/file iframe'de gösteriliyor, DENY onu kırardı).
#  - Bellek-içi limiter tek süreç MVP için yeterli; çok sürece geçince Redis.
# ----------------------------------------------------------

import time as _time
import logging as _logging
from collections import deque as _deque
from fastapi.responses import JSONResponse as _JSONResponse

_seclog = _logging.getLogger("findatalytix.security")

_RL_WINDOW = 60.0                # saniye (kayan pencere)
_RL_LIMIT_DEFAULT = 200          # normal istek / dk / IP (tek kullanıcı bunu aşmaz)
_RL_LIMIT_EXPENSIVE = 20         # AI + rapor + upload / dk / IP (maliyet/ban freni)
_RL_EXPENSIVE = {"/api/simulate", "/api/report"}
_rl_hits: dict[str, _deque] = {}
_RL_SWEEP_AT = 5000              # bu kadar IP kovası birikince eskiler süpürülür
_MAX_BODY = 25 * 1024 * 1024     # gövde freni: upload 20MB + JSON payı


def _is_expensive(path: str, method: str) -> bool:
    if path in _RL_EXPENSIVE:
        return True
    # Upload = ChromaDB indeksleme (CPU + disk) — en pahalı uçlardan;
    # ama ayni path'in GET'i (liste) ucuzdur, o yuzden metod bakilir.
    return path == "/api/documents" and method == "POST"


def _client_ip(request) -> str:
    # Deploy'da ters proxy arkasında gerçek IP X-Forwarded-For'da olur.
    # SON durak güvenilir proxy'nin eklediğidir; İLK durağı almak
    # SAHTELENEBILIR (istemci kendi XFF başlığını gönderip her istekte
    # farklı "IP" göstererek rate limiti atlatırdı).
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


@app.middleware("http")
async def _security(request, call_next):
    path = request.url.path
    if path.startswith("/api/"):
        # Gövde freni: dev Content-Length iddiasını erken reddet (RAM koruması;
        # upload'ın kendi 20MB kontrolü var ama o TÜM gövdeyi okuduktan sonra).
        cl = request.headers.get("content-length")
        if cl and cl.isdigit() and int(cl) > _MAX_BODY:
            return _JSONResponse(status_code=413,
                                 content={"detail": "İstek gövdesi çok büyük"})

        ip = _client_ip(request)
        expensive = _is_expensive(path, request.method)
        limit = _RL_LIMIT_EXPENSIVE if expensive else _RL_LIMIT_DEFAULT
        key = ip + ("|x" if expensive else "")
        now = _time.time()
        dq = _rl_hits.setdefault(key, _deque())
        while dq and now - dq[0] > _RL_WINDOW:
            dq.popleft()
        if not dq:
            _rl_hits.pop(key, None)             # bos kova birak (bellek hijyeni)
            dq = _rl_hits.setdefault(key, _deque())
        if len(dq) >= limit:
            retry = int(_RL_WINDOW - (now - dq[0])) + 1
            _seclog.warning("Rate limit: %s %s (ip=%s)", request.method, path, ip)
            return _JSONResponse(
                status_code=429,
                content={"detail": "Çok fazla istek — lütfen biraz bekleyin."},
                headers={"Retry-After": str(retry)},
            )
        dq.append(now)

        # Kova hijyeni: hiç dönmeyen IP'lerin kovaları sonsuza dek kalmasın
        # (yavaş bellek sızıntısı). Eşik aşılınca penceresi geçmişler süpürülür.
        if len(_rl_hits) > _RL_SWEEP_AT:
            cutoff = now - _RL_WINDOW
            for k in [k for k, q in _rl_hits.items() if not q or q[-1] < cutoff]:
                _rl_hits.pop(k, None)

    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    # Clickjacking freni yalnız deploy kipinde (CORS_ORIGINS ayarlıyken):
    # canlıda site + PDF iframe'i AYNI origin'de, SAMEORIGIN hiçbir şeyi
    # kırmaz; geliştirmede (file:// veya :8091 -> :8000) origin'ler farklı
    # olduğundan koşulsuz eklemek provenance önizlemesini kırardı.
    if _os.getenv("CORS_ORIGINS"):
        resp.headers["X-Frame-Options"] = "SAMEORIGIN"
    return resp


@app.exception_handler(Exception)
async def _unhandled(request, exc):
    """Beklenmeyen hata: gerçek sebep sunucu logunda; istemciye sızıntısız
    genel mesaj (stack trace / şema DIŞARIYA çıkmaz)."""
    _seclog.exception("Beklenmeyen hata: %s %s", request.method, request.url.path)
    return _JSONResponse(status_code=500, content={"detail": "Sunucu hatası"})


# AI sembol çıkaramazsa devreye giren emniyet kemeri
DEFAULT_SYMBOLS = ["XU030.IS", "QQQ"]
DEFAULT_MU, DEFAULT_SIGMA = 0.20, 0.25   # canlı veri de yoksa GBM varsayılanları
MAX_SYMBOLS = 4

# Monte Carlo cekirdegi findatalytix_engine.simulation'a tasindi (Faz 1).


# ----------------------------------------------------------
# İstek / cevap modelleri
# ----------------------------------------------------------

class SimulateRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=2000)
    useRag: bool = True   # kapalıysa doküman bağlamı hiç aranmaz (hız/maliyet)


class SimulateResponse(BaseModel):
    metrics: dict       # { "THYAO.IS": {...}, "AAPL": {...} } — dinamik anahtarlar
    aiText: str
    dataSources: dict
    aiMeta: dict
    symbols: list       # AI'ın prompt'tan çıkardığı (veya varsayılan) semboller
    quotes: dict = {}   # sembol -> {last, changePct, spark} canlı anlık fiyat (Uzmanpara gibi)


class ReportRequest(BaseModel):
    # Sinirlar: docx ureticisine sinirsiz metin pompalanamasin
    # (gövde freni kaba koruma, bunlar ince ayar).
    prompt: str = Field(default="", max_length=2000)
    metrics: dict
    dataSources: dict = {}
    aiText: str = Field(default="", max_length=40000)
    aiMeta: dict = {}


# ----------------------------------------------------------
# Endpoint'ler
# ----------------------------------------------------------

@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "version": app.version}


@app.post("/api/simulate", response_model=SimulateResponse)
def simulate(req: SimulateRequest) -> SimulateResponse:
    seed = _seed_from_prompt(req.prompt)

    # 1) AI prompt'tan sembolleri çıkarır; boş dönerse emniyet kemeri
    symbols = ai.extract_symbols(req.prompt)[:MAX_SYMBOLS] or DEFAULT_SYMBOLS

    metrics: dict = {}
    sources: dict[str, str] = {}
    for i, sym in enumerate(symbols):
        mu, sigma, source = market.get_params(sym, DEFAULT_MU, DEFAULT_SIGMA)
        metrics[sym] = _run_gbm(sym, mu, sigma, seed=seed + i)
        sources[sym] = source

    src_labels = {"live": "canlı Yahoo Finance", "cache": "önbellek", "fallback": "varsayılan"}
    sources_note = ", ".join(f"{k}: {src_labels[v]}" for k, v in sources.items())

    # RAG: sorgu yönlendirici prompt'u 1-3 spesifik aramaya ayırır,
    # sonuçlar tekilleştirilerek birleştirilir (v1.0 Ajan Beyni)
    top_k = app_settings.get("topK")
    chunks: list = []
    fetch_more = None
    if not req.useRag:
        pass   # kullanıcı tercihi: RAG kapalı → aramaya hiç girilmez
    else:
      try:
        store = get_store()
        seen = set()
        for sub_q in ai.route_query(req.prompt):
            for c in store.query(sub_q, top_k=top_k):
                key = (c["source"], c["page"], c["text"][:60])
                if key not in seen:
                    seen.add(key)
                    chunks.append(c)
        chunks = chunks[:top_k * 2]   # bağlam şişmesin (maliyet freni)
        fetch_more = lambda q: store.query(q, top_k=top_k)
      except Exception:
        chunks, fetch_more = [], None

    result = ai.analyze(req.prompt, metrics, sources_note, chunks,
                        fetch_more=fetch_more)
    result["meta"]["ragMode"] = "on" if req.useRag else "off"

    history.record(req.prompt, metrics,
                   result["meta"]["mode"], result["meta"].get("confidence"))

    # Canlı anlik fiyat + gunluk degisim (Uzmanpara benzeri kart ustu bilgisi).
    # watchlist.get_quotes zaten batch cekiyor + .IS cozumleme yapiyor; yeniden kullaniyoruz.
    try:
        quotes = {q["symbol"]: q for q in watchlist.get_quotes(symbols)}
    except Exception:
        quotes = {}

    return SimulateResponse(
        metrics=metrics,
        aiText=result["aiText"],
        dataSources=sources,
        aiMeta=result["meta"],
        symbols=symbols,   # şeffaflık: AI prompt'u böyle yorumladı
        quotes=quotes,
    )


@app.get("/api/asset/{symbol}")
def get_asset(symbol: str) -> dict:
    """Varlık Analizi: 1 yıllık OHLCV + RSI + MACD (Ay 6)."""
    if not (2 <= len(symbol.strip()) <= 12):
        raise HTTPException(422, "Sembol 2-12 karakter olmalı (örn: THYAO, XU030, AAPL)")
    data = analysis.get_asset(symbol)
    if data is None:
        raise HTTPException(
            404, f"'{symbol.upper()}' için veri bulunamadı. Sembolü kontrol et "
                 f"(BIST için THYAO, GARAN; ABD için AAPL, QQQ; kripto için BTC, ETH gibi) "
                 f"ya da internet bağlantısını doğrula.")
    return data


@app.get("/api/watchlist")
def watchlist_quotes(symbols: str) -> dict:
    """İzleme listesi: N sembol için fiyat + değişim + 7 günlük sparkline."""
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()][:15]
    if not syms:
        raise HTTPException(422, "En az bir sembol gerekli (?symbols=THYAO,AAPL)")
    for s in syms:
        if not (2 <= len(s) <= 12):
            raise HTTPException(422, f"Geçersiz sembol: '{s}' (2-12 karakter)")
    return {"quotes": watchlist.get_quotes(syms)}


@app.get("/api/history")
def get_history() -> dict:
    """Genel Bakış tablosu + durum çubuğu döngü sayacı için."""
    return history.snapshot()


class SettingsPatch(BaseModel):
    analyst: str | None = None
    chunkTarget: int | None = None
    topK: int | None = None


@app.get("/api/settings")
def get_settings() -> dict:
    data = app_settings.load()
    st = ai.status()
    data["available"] = {"claude": st["claude"], "gemini": st["gemini"],
                         "groq": st.get("groq", False)}
    data["referee"] = "gemini" if data["analyst"] == "claude" else "claude"
    return data


@app.post("/api/settings")
def update_settings(patch: SettingsPatch) -> dict:
    body = {k: v for k, v in patch.model_dump().items() if v is not None}
    if "analyst" in body and body["analyst"].lower() not in app_settings.VALID_ANALYSTS:
        raise HTTPException(422, "analyst 'claude' ya da 'gemini' olmalı")
    # Embedding modeli (MiniLM) uzun metni kirptigi icin ust sinir sart;
    # cok kucuk chunk da baglami parcalar.
    if "chunkTarget" in body and not (300 <= body["chunkTarget"] <= 1200):
        raise HTTPException(422, "chunkTarget 300-1200 karakter arasında olmalı")
    # topK=0 kaydedilebiliyordu -> ChromaDB n_results=0'i reddediyor,
    # tum RAG aramasi 500'e dusuyordu. Sinir: 1-20 (QueryRequest ile ayni).
    if "topK" in body and not (1 <= body["topK"] <= 20):
        raise HTTPException(422, "topK 1-20 arasında olmalı")
    saved = app_settings.save(body)
    st = ai.status()
    warning = None
    key_map = {"claude": st["claude"], "gemini": st["gemini"],
               "groq": st.get("groq", False)}
    if not key_map.get(saved["analyst"], False):
        warning = (f"Uyarı: {saved['analyst']} için API anahtarı algılanmadı; "
                   f"anahtar eklenene dek şablon/yedek akış çalışır.")
    saved["referee"] = "gemini" if saved["analyst"] == "claude" else "claude"
    saved["available"] = key_map
    saved["warning"] = warning
    return saved


@app.get("/api/ai/status")
def ai_status() -> dict:
    """Konfigürasyon sayfası için: hangi anahtarlar algılandı, roller ne."""
    return ai.status()


@app.post("/api/report")
def generate_report(req: ReportRequest):
    """Ekrandaki son simülasyon durumundan gerçek .docx üretir ve indirtir.
    Bir kopya reports/ altına kaydedilir -> Risk Raporu sayfasindaki gecmis
    listesi buradan beslenir (tekrar indirilebilir)."""
    import report as report_builder
    from fastapi.responses import Response

    data, filename = report_builder.build_report(req.model_dump())

    try:
        REPORTS_DIR.mkdir(exist_ok=True)
        (REPORTS_DIR / _Path(filename).name).write_bytes(data)
    except OSError:
        pass   # arsiv yazilamasa bile indirme calisir (zarif dusus)

    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"',
                 "Access-Control-Expose-Headers": "Content-Disposition"},
    )


# ----------------------------------------------------------
# Rapor arsivi (Risk Raporu sayfasi) — uretilen .docx'ler
# ----------------------------------------------------------

REPORTS_DIR = _Path("./reports")


@app.get("/api/reports")
def list_reports() -> dict:
    """Uretilmis raporlar, yeniden eskiye."""
    items = []
    if REPORTS_DIR.is_dir():
        for p in REPORTS_DIR.glob("*.docx"):
            st = p.stat()
            items.append({"name": p.name, "sizeKB": round(st.st_size / 1024),
                          "ts": st.st_mtime})
    items.sort(key=lambda x: x["ts"], reverse=True)
    return {"reports": items, "count": len(items)}


@app.get("/api/reports/{filename}")
def download_report(filename: str):
    from fastapi.responses import FileResponse
    safe = _Path(filename).name
    path = REPORTS_DIR / safe
    if not (safe.lower().endswith(".docx") and path.is_file()):
        raise HTTPException(404, f"'{safe}' rapor arşivinde bulunamadı")
    return FileResponse(
        path, filename=safe,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")


@app.delete("/api/reports/{filename}")
def delete_report(filename: str) -> dict:
    safe = _Path(filename).name
    path = REPORTS_DIR / safe
    if not (safe.lower().endswith(".docx") and path.is_file()):
        raise HTTPException(404, f"'{safe}' rapor arşivinde bulunamadı")
    path.unlink()
    return {"status": "deleted", "filename": safe}


# ----------------------------------------------------------
# RAG endpoint'leri (Ay 3)
# ----------------------------------------------------------

import rag
from fastapi import UploadFile, File, HTTPException

MAX_UPLOAD_MB = 20
_store: rag.RagStore | None = None

# Yuklenen orijinal dosyalar burada saklanir; /api/documents/{ad}/file ile
# servis edilir (yan yana PDF onizleme / provenance icin).
UPLOAD_DIR = _Path("./uploads")   # _Path importu dosya basinda


def get_store() -> rag.RagStore:
    """Tembel başlatma: ChromaDB (ve embedding modeli) yalnızca
    ilk RAG isteğinde yüklenir; simülasyon kullanıcıları bedel ödemez."""
    global _store
    if _store is None:
        _store = rag.RagStore(path="./chroma_db")
    return _store


class QueryRequest(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    top_k: int | None = Field(default=None, ge=1, le=20)   # None → ayardan


@app.post("/api/documents")
async def upload_document(file: UploadFile = File(...)) -> dict:
    ext = "." + (file.filename or "").lower().rsplit(".", 1)[-1]
    if ext not in (".pdf", ".docx"):
        raise HTTPException(415, f"Desteklenmeyen tür: {ext} (yalnızca .pdf, .docx)")

    data = await file.read()
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"Dosya {MAX_UPLOAD_MB} MB sınırını aşıyor")

    try:
        # ChromaDB indekslemesi CPU-yoğun ve senkron; async endpoint'in
        # event loop'unu kilitlememesi için threadpool'a itilir.
        from starlette.concurrency import run_in_threadpool
        # Arayuzdeki "Chunk Boyutu (karakter)" ayari YENI yuklemelerde gecerli
        result = await run_in_threadpool(get_store().add_document,
                                         file.filename, data,
                                         app_settings.get("chunkTarget"))
    except ValueError as exc:
        raise HTTPException(422, str(exc))

    # Indeksleme basarili -> orijinali sakla (yan yana onizleme icin).
    # Path(...).name: yol karakterlerini soyar (path traversal onlemi).
    try:
        UPLOAD_DIR.mkdir(exist_ok=True)
        (UPLOAD_DIR / _Path(file.filename or "belge").name).write_bytes(data)
    except OSError:
        pass   # onizleme kaydi basarisiz olsa bile indeksleme gecerli

    return {"status": "indexed", **result}


@app.get("/api/documents")
def list_documents() -> dict:
    return get_store().stats()


@app.delete("/api/documents/{filename}")
def delete_document(filename: str) -> dict:
    deleted = get_store().delete_document(filename)
    if deleted == 0:
        raise HTTPException(404, f"'{filename}' indekste bulunamadı")
    try:
        (UPLOAD_DIR / _Path(filename).name).unlink(missing_ok=True)
    except OSError:
        pass
    return {"status": "deleted", "filename": filename, "chunksRemoved": deleted}


@app.get("/api/documents/{filename}/file")
def get_document_file(filename: str):
    """Yuklenen orijinal belgeyi servis eder (PDF tarayicida acilir;
    #page=N ile arama sonucundaki sayfaya atlanabilir)."""
    from fastapi.responses import FileResponse
    safe = _Path(filename).name
    path = UPLOAD_DIR / safe
    if not path.is_file():
        raise HTTPException(404, "Belge dosyası sunucuda yok — bu belge eski "
                                 "sürümde yüklenmiş olabilir; silip yeniden yükleyin.")
    media = ("application/pdf" if safe.lower().endswith(".pdf") else
             "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    return FileResponse(path, media_type=media, filename=safe,
                        content_disposition_type="inline")


# ----------------------------------------------------------
# Haberler (Google News RSS — anahtarsız; 10 dk önbellek news.py'da)
# ----------------------------------------------------------

import news as news_mod


@app.get("/api/news")
def get_news(cat: str = "piyasalar", lang: str = "tr") -> dict:
    try:
        items = news_mod.get_news(cat, lang)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except ConnectionError as exc:
        raise HTTPException(503, str(exc))
    return {"category": cat, "lang": "en" if lang == "en" else "tr",
            "items": items, "count": len(items)}


@app.post("/api/query")
def query_documents(req: QueryRequest) -> dict:
    # Arama testi = seffaflik araci: en iyi eslesmeleri SKORUYLA goster,
    # AI-icin ayarlanmis esikle gizleme (kisa sorgu/kisaltma elenmesin).
    # Kullanici skoru gorup guveni kendi olcer.
    results = get_store().query(req.question,
                                req.top_k or app_settings.get("topK"),
                                min_score=0.0)
    return {"question": req.question, "results": results, "count": len(results)}


# ----------------------------------------------------------
# FRONTEND SUNUMU — deploy'da tek servis yeter (CORS derdi yok).
# GUVENLIK: StaticFiles ile TUM klasoru acmak .env/main.py gibi
# dosyalari da sunardi; o yuzden SADECE beyaz listedeki 5 dosya.
# Bu route'lar en SONDA tanimli: /api/* her zaman once eslesir,
# /{fname} yalnizca tek parcali yollari yakalar.
# ----------------------------------------------------------
from fastapi.responses import FileResponse as _FileResponse

_FRONTEND_DIR = _Path(__file__).resolve().parent.parent
_FRONTEND_FILES = {"index.html", "app.js", "core.js", "config.js", "styles.css",
                   "logo.png", "favicon-64.png", "apple-touch-icon.png"}


@app.get("/", include_in_schema=False)
def serve_index():
    return _FileResponse(_FRONTEND_DIR / "index.html", media_type="text/html")


@app.get("/{fname}", include_in_schema=False)
def serve_frontend(fname: str):
    if fname not in _FRONTEND_FILES:
        raise HTTPException(404, "Böyle bir sayfa yok")
    return _FileResponse(_FRONTEND_DIR / fname)
