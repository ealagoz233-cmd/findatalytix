"""
FinDatalytix — main.py (Ay 2: Backend Motoru)
=============================================
Çalıştırma:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

Endpoint'ler:
    POST /api/simulate  -> Monte Carlo (GBM) + metrikler + aiText
    POST /api/report    -> taslak (stub), Ay 5'te python-docx bağlanacak
    GET  /api/health    -> ayakta mı kontrolü
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import market
import ai
import history
import analysis

# ----------------------------------------------------------
# Uygulama + CORS
# file:// ile açılan sayfanın Origin'i "null" olur; allow_origins=["*"]
# (credentials kapalıyken) hem file:// hem localhost sunucularını kapsar.
# ----------------------------------------------------------

app = FastAPI(title="FinDatalytix API", version="0.2.0")

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
# Varlık parametreleri (Ay 1 H3-4'te gerçek piyasa verisine bağlanacak)
# mu: yıllık beklenen getiri, sigma: yıllık volatilite
# ----------------------------------------------------------

@dataclass(frozen=True)
class AssetParams:
    model: str
    ticker: str          # Yahoo Finance sembolü
    mu: float            # fallback: yıllık beklenen getiri
    sigma: float         # fallback: yıllık volatilite


ASSETS: dict[str, AssetParams] = {
    # XU030.IS = BIST-30 endeksi, QQQ = Nasdaq-100 ETF
    "A": AssetParams(model="BIST-30 (XU030)", ticker="XU030.IS", mu=0.30, sigma=0.19),
    "B": AssetParams(model="Nasdaq-100 (QQQ)", ticker="QQQ",     mu=0.27, sigma=0.25),
}

RISK_FREE = 0.05      # yıllık risksiz oran
TRADING_DAYS = 252
N_PATHS = 2_000       # Monte Carlo yol sayısı
HORIZON_DAYS = 252    # 1 yıllık ufuk


# ----------------------------------------------------------
# Monte Carlo çekirdeği (geometrik Brown hareketi)
# ----------------------------------------------------------

def _run_gbm(model: str, mu: float, sigma: float, seed: int) -> dict:
    rng = np.random.default_rng(seed)
    dt = 1.0 / TRADING_DAYS

    z = rng.standard_normal((N_PATHS, HORIZON_DAYS))
    log_ret = (mu - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * z

    # Fiyat yolları: S0 = 100
    prices = 100.0 * np.exp(np.cumsum(log_ret, axis=1))
    prices = np.concatenate([np.full((N_PATHS, 1), 100.0), prices], axis=1)

    # CAGR: yol sonu değerlerinin ortalamasından
    terminal = prices[:, -1]
    cagr = float(np.mean(terminal / 100.0) - 1.0)

    # Yıllıklandırılmış volatilite: günlük log getirilerden
    vol = float(np.std(log_ret) * np.sqrt(TRADING_DAYS))

    # Sharpe: (getiri - risksiz) / volatilite
    sharpe = (cagr - RISK_FREE) / vol if vol > 0 else 0.0

    # Maksimum düşüş: her yolun kendi MDD'sinin ortalaması
    running_max = np.maximum.accumulate(prices, axis=1)
    drawdowns = prices / running_max - 1.0
    mdd = float(np.mean(np.min(drawdowns, axis=1)))

    return {
        "model": model,
        "cagr": round(cagr * 100, 2),    # %
        "vol": round(vol * 100, 2),      # %
        "sharpe": round(sharpe, 2),
        "mdd": round(mdd * 100, 2),      # % (negatif)
    }


def _seed_from_prompt(prompt: str) -> int:
    """Aynı prompt -> aynı sonuç (tekrarlanabilirlik).
    Farklı prompt -> farklı senaryo. RAG gelene kadar 'anlama' bu."""
    return int(hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:8], 16)


# ----------------------------------------------------------
# İstek / cevap modelleri
# ----------------------------------------------------------

class SimulateRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=2000)


class SimulateResponse(BaseModel):
    metrics: dict
    aiText: str
    dataSources: dict   # {"A": "live"|"cache"|"fallback", "B": ...}
    aiMeta: dict        # {mode, analyst, referee, confidence, tokens...}


class ReportRequest(BaseModel):
    prompt: str = ""
    metrics: dict
    dataSources: dict = {}
    aiText: str = ""
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

    metrics: dict = {}
    sources: dict[str, str] = {}
    for i, (key, params) in enumerate(ASSETS.items()):
        mu, sigma, source = market.get_params(params.ticker, params.mu, params.sigma)
        metrics[key] = _run_gbm(params.model, mu, sigma, seed=seed + i)
        sources[key] = source

    src_labels = {"live": "canlı Yahoo Finance", "cache": "önbellek", "fallback": "varsayılan"}
    sources_note = ", ".join(f"{k}: {src_labels[v]}" for k, v in sources.items())

    # RAG: indekste doküman varsa prompt'a en alakalı 3 chunk'ı çek
    try:
        chunks = get_store().query(req.prompt, top_k=3)
    except Exception:
        chunks = []

    result = ai.analyze(req.prompt, metrics, sources_note, chunks)

    history.record(req.prompt, metrics,
                   result["meta"]["mode"], result["meta"].get("confidence"))

    return SimulateResponse(
        metrics=metrics,
        aiText=result["aiText"],
        dataSources=sources,
        aiMeta=result["meta"],
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
                 f"(BIST için THYAO, GARAN; ABD için AAPL, QQQ gibi) "
                 f"ya da internet bağlantısını doğrula.")
    return data


@app.get("/api/history")
def get_history() -> dict:
    """Genel Bakış tablosu + durum çubuğu döngü sayacı için."""
    return history.snapshot()


@app.get("/api/ai/status")
def ai_status() -> dict:
    """Konfigürasyon sayfası için: hangi anahtarlar algılandı, roller ne."""
    return ai.status()


@app.post("/api/report")
def generate_report(req: ReportRequest):
    """Ekrandaki son simülasyon durumundan gerçek .docx üretir ve indirtir."""
    import report as report_builder
    from fastapi.responses import Response

    data, filename = report_builder.build_report(req.model_dump())
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"',
                 "Access-Control-Expose-Headers": "Content-Disposition"},
    )


# ----------------------------------------------------------
# RAG endpoint'leri (Ay 3)
# ----------------------------------------------------------

import rag
from fastapi import UploadFile, File, HTTPException

MAX_UPLOAD_MB = 20
_store: rag.RagStore | None = None


def get_store() -> rag.RagStore:
    """Tembel başlatma: ChromaDB (ve embedding modeli) yalnızca
    ilk RAG isteğinde yüklenir; simülasyon kullanıcıları bedel ödemez."""
    global _store
    if _store is None:
        _store = rag.RagStore(path="./chroma_db")
    return _store


class QueryRequest(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    top_k: int = Field(default=5, ge=1, le=20)


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
        result = await run_in_threadpool(get_store().add_document, file.filename, data)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    return {"status": "indexed", **result}


@app.get("/api/documents")
def list_documents() -> dict:
    return get_store().stats()


@app.delete("/api/documents/{filename}")
def delete_document(filename: str) -> dict:
    deleted = get_store().delete_document(filename)
    if deleted == 0:
        raise HTTPException(404, f"'{filename}' indekste bulunamadı")
    return {"status": "deleted", "filename": filename, "chunksRemoved": deleted}


@app.post("/api/query")
def query_documents(req: QueryRequest) -> dict:
    results = get_store().query(req.question, req.top_k)
    return {"question": req.question, "results": results, "count": len(results)}
