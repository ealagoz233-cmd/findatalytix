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
import json
import logging

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

ANALYST = os.getenv("AI_ANALYST", "claude").lower()   # claude | gemini
SIMPLE_PROMPT_CHARS = 200                              # bunun altı → ucuz model

_claude = None
_gemini = None

if ANTHROPIC_KEY:
    try:
        import anthropic
        _claude = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
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
    return {
        "claude": _claude is not None,
        "gemini": _gemini is not None,
        "analyst": ANALYST,
        "referee": "gemini" if ANALYST == "claude" else "claude",
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
    resp = _gemini.generate_content(system + "\n\n" + user)
    usage = getattr(resp, "usage_metadata", None)
    tin = getattr(usage, "prompt_token_count", 0) or 0
    tout = getattr(usage, "candidates_token_count", 0) or 0
    return resp.text.strip(), tin, tout


def _analyst_call(system: str, user: str, cheap: bool):
    if ANALYST == "gemini" and _gemini:
        return "gemini", *_call_gemini(system, user, cheap)
    if _claude:
        return "claude", *_call_claude(system, user, cheap)
    if _gemini:
        return "gemini", *_call_gemini(system, user, cheap)
    return None, "", 0, 0


def _referee_call(system: str, user: str):
    referee = "gemini" if ANALYST == "claude" else "claude"
    if referee == "gemini" and _gemini:
        return "gemini", *_call_gemini(system, user, cheap=True)
    if referee == "claude" and _claude:
        return "claude", *_call_claude(system, user, cheap=True)
    return None, "", 0, 0


# ----------------------------------------------------------
# Prompt şablonları
# ----------------------------------------------------------

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
    'başka hiçbir şey yazma: {"score": 0-100 arası tamsayı, "note": "tek cümlelik Türkçe not"}'
)


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

def analyze(prompt: str, metrics: dict, sources_note: str, chunks: list[dict]) -> dict:
    """Dönen sözlük: {aiText, meta{mode, analyst, referee, confidence,
    refereeNote, tokensIn, tokensOut, ragSources[]}}"""

    rag_sources = sorted({f"{c['source']} (s.{c['page']})" for c in chunks})

    # ---- Hiç model yoksa: dürüst şablon ----
    if _claude is None and _gemini is None:
        a, b = metrics["A"], metrics["B"]
        winner = "A" if a["sharpe"] >= b["sharpe"] else "B"
        text = (
            f"Monte Carlo Analizi: Varlık A yıllık %{a['cagr']} getiri / {a['sharpe']} Sharpe, "
            f"Varlık B %{b['cagr']} / {b['sharpe']}. Risk-ayarlı bazda Varlık {winner} önde. "
            f"Maksimum düşüş: A %{a['mdd']}, B %{b['mdd']}. Veri kaynağı — {sources_note}. "
            f"(Şablon yorum: .env dosyasına ANTHROPIC_API_KEY veya GEMINI_API_KEY "
            f"eklendiğinde gerçek AI analizi devreye girer.)"
        )
        return {"aiText": text, "meta": {
            "mode": "template", "analyst": None, "referee": None,
            "confidence": None, "refereeNote": None,
            "tokensIn": 0, "tokensOut": 0, "ragSources": rag_sources}}

    # ---- Analist ----
    cheap = len(prompt) < SIMPLE_PROMPT_CHARS
    user_msg = (
        f"Kullanıcı sorusu: {prompt}\n\n"
        f"Monte Carlo metrikleri (JSON): {json.dumps(metrics, ensure_ascii=False)}\n"
        f"Piyasa verisi kaynağı: {sources_note}\n\n"
        f"RAG bağlamı:\n{_build_context(chunks)}"
    )

    try:
        analyst_name, text, tin, tout = _analyst_call(ANALYST_SYSTEM, user_msg, cheap)
    except Exception as exc:
        logger.warning("Analist çağrısı başarısız: %s", exc)
        return analyze_fallback_after_error(prompt, metrics, sources_note, rag_sources, str(exc))

    # ---- Hakem ----
    confidence, note, referee_name = None, None, None
    try:
        referee_name, raw, rtin, rtout = _referee_call(
            REFEREE_SYSTEM,
            f"Soru: {prompt}\nVeri: {json.dumps(metrics, ensure_ascii=False)}\nAnaliz:\n{text}"
        )
        if referee_name:
            tin += rtin; tout += rtout
            clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            parsed = json.loads(clean)
            confidence = max(0, min(100, int(parsed.get("score", 0))))
            note = str(parsed.get("note", ""))[:300]
    except Exception as exc:
        logger.warning("Hakem değerlendirmesi alınamadı: %s", exc)
        note = "Hakem değerlendirmesi bu turda alınamadı."

    return {"aiText": text, "meta": {
        "mode": "live-ai", "analyst": analyst_name, "referee": referee_name,
        "confidence": confidence, "refereeNote": note,
        "tokensIn": tin, "tokensOut": tout, "ragSources": rag_sources}}


def analyze_fallback_after_error(prompt, metrics, sources_note, rag_sources, error) -> dict:
    a, b = metrics["A"], metrics["B"]
    text = (
        f"AI servisine ulaşılamadı ({error[:120]}). Ham sonuçlar: "
        f"Varlık A %{a['cagr']} getiri / {a['sharpe']} Sharpe; "
        f"Varlık B %{b['cagr']} / {b['sharpe']}. Kaynak: {sources_note}."
    )
    return {"aiText": text, "meta": {
        "mode": "error-fallback", "analyst": None, "referee": None,
        "confidence": None, "refereeNote": None,
        "tokensIn": 0, "tokensOut": 0, "ragSources": rag_sources}}
