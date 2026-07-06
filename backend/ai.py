"""
FinDatalytix — ai.py (Ay 4: Claude + Gemini ping-pong)
======================================================
Akış: kullanıcı prompt'u + Monte Carlo metrikleri + RAG chunk'ları
      → ANALİST model yorum yazar
      → HAKEM model yorumu puanlar (0-100) + not düşer.

Tasarım kararları:
- ANAHTARLAR: yalnızca ortam değişkeninden (.env) okunur.
  ANTHROPIC_API_KEY ve/veya GEMINI_API_KEY.
  Koda anahtar gömmek yasak — bu dosya repoya girse bile sızıntı olmaz.
- ZARİF DÜŞÜŞ: hiç anahtar yoksa şablon yoruma dönülür ve cevapta
  mode="template" olarak İTİRAF edilir. Sistem asla bu yüzden çökmez.
  Tek anahtar varsa analist çalışır, hakem "atlandı" olarak işaretlenir.
- MALİYET YÖNLENDİRMESİ (yol haritası emri): kısa/basit prompt →
  ucuz model (Haiku / Flash), uzun → güçlü model. Token sayıları
  her cevapta raporlanır.
- ROLLER: varsayılan Claude=analist, Gemini=hakem.
  .env'de AI_ANALYST=gemini yazarak tersine çevrilebilir.
"""

from __future__ import annotations

import os
import re
import json
import logging
import urllib.request

logger = logging.getLogger("findatalytix.ai")

# .env desteği (opsiyonel — kurulu değilse ortam değişkenleri yine çalışır)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ----------------------------------------------------------
# İstemciler — tembel ve hataya dayanıklı kurulum
# ----------------------------------------------------------

ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
GEMINI_KEY = os.getenv("GEMINI_API_KEY", "").strip()

CLAUDE_MODEL_STRONG = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")
CLAUDE_MODEL_CHEAP = os.getenv("CLAUDE_MODEL_CHEAP", "claude-haiku-4-5-20251001")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

# GROQ: ucretsiz + cok comert kota + hizli (Llama 3.3 70B). Anahtar varsa
# tum AI cagrilari buraya gider; Gemini'nin dar dakikalik limitine takilmaz.
GROQ_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")        # guclu analist
GROQ_MODEL_CHEAP = os.getenv("GROQ_MODEL_CHEAP", "llama-3.1-8b-instant")  # sembol/sorgu

import settings as app_settings

def _current_analyst() -> str:
    """Rol artık settings.json'dan (arayüzden) yönetilir; restart gerekmez."""
    return app_settings.get("analyst")

SIMPLE_PROMPT_CHARS = 200                              # bunun altı → ucuz model

_claude = None
_gemini = None
_groq = True if GROQ_KEY else None   # SDK yok; urllib ile REST cagrisi

if ANTHROPIC_KEY:
    try:
        import anthropic
        _claude = anthropic.Anthropic(api_key=ANTHROPIC_KEY, timeout=45.0)
    except Exception as exc:
        logger.warning("Anthropic istemcisi kurulamadı: %s", exc)

if GEMINI_KEY:
    try:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_KEY)
        _gemini = genai.GenerativeModel(GEMINI_MODEL)
    except Exception as exc:
        logger.warning("Gemini istemcisi kurulamadı: %s", exc)


def status() -> dict:
    # Groq varsa oncelikli: tum roller Groq (comert ucretsiz kota).
    if _groq:
        return {"claude": _claude is not None, "gemini": _gemini is not None,
                "groq": True, "analyst": "groq", "referee": "groq"}
    analyst = _current_analyst()
    return {
        "claude": _claude is not None,
        "gemini": _gemini is not None,
        "groq": False,
        "analyst": analyst,
        "referee": "gemini" if analyst == "claude" else "claude",
    }


# ----------------------------------------------------------
# Düşük seviye çağrılar — (metin, giriş_token, çıkış_token)
# ----------------------------------------------------------

def _call_claude(system: str, user: str, cheap: bool) -> tuple[str, int, int]:
    model = CLAUDE_MODEL_CHEAP if cheap else CLAUDE_MODEL_STRONG
    msg = _claude.messages.create(
        model=model,
        max_tokens=700,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    text = "".join(b.text for b in msg.content if getattr(b, "text", None))
    return text.strip(), msg.usage.input_tokens, msg.usage.output_tokens


def _call_gemini(system: str, user: str, cheap: bool) -> tuple[str, int, int]:
    resp = _gemini.generate_content(system + "\n\n" + user,
                                    request_options={"timeout": 45})
    usage = getattr(resp, "usage_metadata", None)
    tin = getattr(usage, "prompt_token_count", 0) or 0
    tout = getattr(usage, "candidates_token_count", 0) or 0
    return resp.text.strip(), tin, tout


def _call_groq(system: str, user: str, cheap: bool) -> tuple[str, int, int]:
    """Groq (OpenAI-uyumlu REST). SDK gerektirmez; stdlib urllib yeter.
    Hata (429/timeout vb.) Exception olarak yukselir, cagiranlar zaten yakalar."""
    model = GROQ_MODEL_CHEAP if cheap else GROQ_MODEL
    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": 800,
        "temperature": 0.4,
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=payload,
        headers={"Authorization": f"Bearer {GROQ_KEY}",
                 "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    text = data["choices"][0]["message"]["content"]
    usage = data.get("usage", {})
    return text.strip(), usage.get("prompt_tokens", 0) or 0, usage.get("completion_tokens", 0) or 0


def _analyst_call(system: str, user: str, cheap: bool):
    if _groq:                                    # Groq oncelikli (comert ucretsiz)
        return "groq", *_call_groq(system, user, cheap)
    if _current_analyst() == "gemini" and _gemini:
        return "gemini", *_call_gemini(system, user, cheap)
    if _claude:
        return "claude", *_call_claude(system, user, cheap)
    if _gemini:
        return "gemini", *_call_gemini(system, user, cheap)
    return None, "", 0, 0


def _referee_call(system: str, user: str):
    if _groq:                                    # Groq varsa hakem de Groq
        return "groq", *_call_groq(system, user, cheap=True)
    referee = "gemini" if _current_analyst() == "claude" else "claude"
    if referee == "gemini" and _gemini:
        return "gemini", *_call_gemini(system, user, cheap=True)
    if referee == "claude" and _claude:
        return "claude", *_call_claude(system, user, cheap=True)
    return None, "", 0, 0


# ----------------------------------------------------------
# Prompt şablonları
# ----------------------------------------------------------

EXTRACTOR_SYSTEM = (
    "Kullanicinin finansal analiz isteginden varlik sembollerini cikart. "
    "KURALLAR: BIST hisseleri/endeksleri icin '.IS' uzantisi ekle (THYAO.IS, XU030.IS); "
    "ABD varliklarinda ham sembol (AAPL, QQQ). Sektor/tema ima edilirse uygun BIST "
    "endeksini sec (bankacilik->XBANK.IS, sinai->XUSIN.IS, teknoloji->XUTEK.IS). "
    "En fazla 4 sembol. SADECE gecerli bir JSON dizisi dondur, baska hicbir sey yazma. "
    'Ornek: ["THYAO.IS","AAPL"]. Sembol cikarilamiyorsa [] dondur.'
)

_SYMBOL_RE = re.compile(r"^[A-Z0-9.^-]{2,12}$")


def extract_symbols(prompt: str) -> list[str]:
    """Prompt'tan sembol listesi. Model yoksa/hata olursa/geçersizse []."""
    if _claude is None and _gemini is None and _groq is None:
        return []
    try:
        _, raw, _tin, _tout = _analyst_call(EXTRACTOR_SYSTEM, prompt, cheap=True)
        clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data = json.loads(clean)
        if not isinstance(data, list):
            return []
        out, seen = [], set()
        for s in data:
            sym = str(s).strip().upper()
            if _SYMBOL_RE.match(sym) and sym not in seen:
                seen.add(sym)
                out.append(sym)
            if len(out) >= 4:            # maliyet + ekran freni
                break
        return out
    except Exception as exc:
        logger.warning("Sembol çıkarma başarısız: %s", exc)
        return []


ROUTER_SYSTEM = (
    "Kullanicinin finansal analiz sorusunu incele. Cevabi bulmak icin dokuman "
    "veritabaninda kac farkli arama gerekir? SADECE su JSON'u dondur: "
    '{"type": "simple" veya "complex", "sub_queries": ["arama 1", ...]}. '
    "Basit soru = tek arama (sorunun kendisi). Karmasik soru = en fazla 3 "
    "spesifik arama sorgusu. Sorgular Turkce ve kisa olsun."
)


def route_query(prompt: str) -> list[str]:
    """Prompt'u 1-3 spesifik RAG aramasina ayristirir.
    Model yoksa/parse bozulursa: [prompt] (tek arama) - sistem asla durmaz."""
    if _claude is None and _gemini is None and _groq is None:
        return [prompt]
    try:
        _, raw, _ti, _to = _analyst_call(ROUTER_SYSTEM, prompt, cheap=True)
        clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data = json.loads(clean)
        subs = [str(q).strip() for q in data.get("sub_queries", []) if str(q).strip()]
        return subs[:3] or [prompt]
    except Exception as exc:
        logger.warning("Sorgu yönlendirici başarısız (%s) → tek arama", exc)
        return [prompt]


ANALYST_SYSTEM = (
    "Sen FinDatalytix'in finansal analiz asistanısın. Türkçe, net ve ölçülü yaz. "
    "Sana verilen Monte Carlo metriklerini yorumla; RAG bağlamı verildiyse "
    "iddialarını o kaynaklara dayandır ve kaynağı 'dosya_adı (sayfa N)' "
    "biçiminde an. Bağlamda olmayan bilgiyi uydurma. En fazla iki kısa paragraf. "
    "Yatırım tavsiyesi verme; risk-getiri karşılaştırması yap."
)

REFEREE_SYSTEM = (
    "Sen bir finansal analiz hakemisin. Sana bir soru, veri ve bir analiz "
    "yorumu verilecek. Yorumu şu ölçütlerle değerlendir: verilerle tutarlılık, "
    "kaynak kullanımı, abartı/uydurma olup olmaması. SADECE şu JSON'u döndür, "
    "başka hiçbir şey yazma: "
    '{"score": 0-100 tamsayı, "note": "tek cümlelik Türkçe not", '
    '"gapQuery": "puan 60 altındaysa eksik bilgiyi bulacak kısa arama sorgusu, yoksa null"}'
)

# Öz-düzeltme döngüsü sınırları (maliyet freni)
CONFIDENCE_THRESHOLD = 60   # bunun altı → düzeltme turu
MAX_REVISIONS = 2           # ilk taslak + en fazla 2 yeniden yazım


def _build_context(chunks: list[dict]) -> str:
    if not chunks:
        return "(RAG bağlamı yok — indeksli doküman bulunamadı ya da alakalı parça çıkmadı)"
    lines = []
    for c in chunks:
        lines.append(f"[{c['source']} (sayfa {c['page']}), benzerlik {c['score']}]\n{c['text']}")
    return "\n\n---\n\n".join(lines)


# ----------------------------------------------------------
# Ana giriş noktası
# ----------------------------------------------------------

def _referee_review(prompt: str, metrics: dict, text: str):
    """(referee_adi, score, note, gap_query, tin, tout) - hata olursa score None."""
    referee_name, raw, tin, tout = _referee_call(
        REFEREE_SYSTEM,
        f"Soru: {prompt}\nVeri: {json.dumps(metrics, ensure_ascii=False)}\nAnaliz:\n{text}"
    )
    if not referee_name:
        return None, None, None, None, 0, 0
    clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    parsed = json.loads(clean)
    score = max(0, min(100, int(parsed.get("score", 0))))
    note = str(parsed.get("note", ""))[:300]
    gap = parsed.get("gapQuery")
    gap = str(gap).strip() if gap and str(gap).lower() != "null" else None
    return referee_name, score, note, gap, tin, tout


def analyze(prompt: str, metrics: dict, sources_note: str,
            chunks: list[dict], fetch_more=None) -> dict:
    """Ajan dongusu: taslak -> hakem -> (puan dusukse) eksik veri aramasi ->
    yeniden yazim. fetch_more(query) -> list[chunk]: RAG'e donus kapisi
    (main.py enjekte eder; test edilebilirlik icin bagimlilik disaridan gelir)."""

    rag_sources = sorted({f"{c['source']} (s.{c['page']})" for c in chunks})

    # ---- Hiç model yoksa: dürüst şablon (dinamik N varlık) ----
    if _claude is None and _gemini is None and _groq is None:
        parts = [f"{k}: %{m['cagr']} getiri / {m['sharpe']} Sharpe / %{m['mdd']} MDD"
                 for k, m in metrics.items()]
        winner = max(metrics.items(), key=lambda kv: kv[1]["sharpe"])[0]
        text = (
            f"Monte Carlo Analizi — {'; '.join(parts)}. "
            f"Risk-ayarlı bazda öne çıkan: {winner}. Veri kaynağı — {sources_note}. "
            f"(Şablon yorum: .env dosyasına ANTHROPIC_API_KEY veya GEMINI_API_KEY "
            f"eklendiğinde gerçek AI analizi devreye girer.)"
        )
        return {"aiText": text, "meta": {
            "mode": "template", "analyst": None, "referee": None,
            "confidence": None, "refereeNote": None, "rounds": 0, "roundLog": [],
            "tokensIn": 0, "tokensOut": 0, "ragSources": rag_sources}}

    cheap = len(prompt) < SIMPLE_PROMPT_CHARS
    tin_total = tout_total = 0
    round_log: list[dict] = []
    work_chunks = list(chunks)
    feedback = None
    text = ""
    analyst_name = referee_name = None
    confidence = note = None

    for round_no in range(1, MAX_REVISIONS + 2):   # taslak + düzeltmeler
        user_msg = (
            f"Kullanıcı sorusu: {prompt}\n\n"
            f"Monte Carlo metrikleri (JSON): {json.dumps(metrics, ensure_ascii=False)}\n"
            f"Piyasa verisi kaynağı: {sources_note}\n\n"
            f"RAG bağlamı:\n{_build_context(work_chunks)}"
        )
        if feedback:
            user_msg += (f"\n\nHAKEM GERİ BİLDİRİMİ (önceki taslağın): {feedback}\n"
                         f"Bu eleştiriyi gidererek analizi yeniden yaz.")

        try:
            analyst_name, text, tin, tout = _analyst_call(ANALYST_SYSTEM, user_msg, cheap)
            tin_total += tin; tout_total += tout
        except Exception as exc:
            logger.warning("Analist çağrısı başarısız (tur %d): %s", round_no, exc)
            if round_no == 1:
                return analyze_fallback_after_error(prompt, metrics, sources_note,
                                                    rag_sources, str(exc))
            break   # elde önceki tur taslağı var, onunla devam

        try:
            referee_name, confidence, note, gap, rtin, rtout = \
                _referee_review(prompt, metrics, text)
            tin_total += rtin; tout_total += rtout
        except Exception as exc:
            logger.warning("Hakem değerlendirmesi alınamadı: %s", exc)
            note = "Hakem değerlendirmesi bu turda alınamadı."
            round_log.append({"round": round_no, "score": None, "note": note})
            break

        round_log.append({"round": round_no, "score": confidence, "note": note})

        # Döngü kararı: puan yeterli mi, tur hakkı var mı?
        if confidence is None or confidence >= CONFIDENCE_THRESHOLD:
            break
        if round_no > MAX_REVISIONS:
            break

        # Eksik veri araması (Gap Query) → bağlamı zenginleştir
        if gap and callable(fetch_more):
            try:
                extra = fetch_more(gap) or []
                seen = {(c["source"], c["page"], c["text"][:60]) for c in work_chunks}
                for c in extra:
                    key = (c["source"], c["page"], c["text"][:60])
                    if key not in seen:
                        work_chunks.append(c); seen.add(key)
                logger.info("Düzeltme turu %d: '%s' araması %d yeni chunk getirdi",
                            round_no, gap, len(extra))
            except Exception as exc:
                logger.warning("Gap query başarısız: %s", exc)
        feedback = note + (f" (Eksik bilgi araması yapıldı: '{gap}')" if gap else "")

    rag_sources = sorted({f"{c['source']} (s.{c['page']})" for c in work_chunks})
    return {"aiText": text, "meta": {
        "mode": "live-ai", "analyst": analyst_name, "referee": referee_name,
        "confidence": confidence, "refereeNote": note,
        "rounds": len(round_log), "roundLog": round_log,
        "tokensIn": tin_total, "tokensOut": tout_total,
        "ragSources": rag_sources}}


def analyze_fallback_after_error(prompt, metrics, sources_note, rag_sources, error) -> dict:
    parts = [f"{k} %{m['cagr']} / {m['sharpe']} Sharpe" for k, m in metrics.items()]
    
    err_str = str(error).lower()
    if "429" in err_str or "quota" in err_str or "rate limit" in err_str or "exhausted" in err_str:
        user_error = "Ücretsiz API Katmanı / Hız Limiti Doldu. Lütfen 1-2 dakika bekleyip tekrar deneyin."
    else:
        user_error = error[:120]
        
    text = (
        f"AI servisine ulaşılamadı ({user_error}). Ham sonuçlar: "
        f"{'; '.join(parts)}. Kaynak: {sources_note}."
    )
    return {"aiText": text, "meta": {
        "mode": "error-fallback", "analyst": None, "referee": None,
        "confidence": None, "refereeNote": None, "rounds": 0, "roundLog": [],
        "tokensIn": 0, "tokensOut": 0, "ragSources": rag_sources}}
