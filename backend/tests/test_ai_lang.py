"""AI çıktı dili + anahtar biçim doğrulama (11 Tem).

Kullanıcı: EN modda AI yorumu Türkçe çıkıyordu. lang parametresi analyze
zincirinden geçirilir; şablon ve hata-yedeği metinleri dile duyarlı.
Ayrıca: yanlış slot'a Gemini anahtarı yapıştırılması (canlı 401) için
Groq anahtarı "gsk_" biçim kontrolünden geçer.
"""

import ai


def test_lang_directive_tr_en():
    assert "Türkçe" in ai._lang("tr")
    assert "English" in ai._lang("en")
    assert ai._lang("zzz") == ai._lang("tr")   # bilinmeyen -> TR


def test_fallback_dile_duyarli():
    m = {"XU030.IS": {"cagr": 10.0, "sharpe": 0.5, "mdd": -20.0}}
    tr = ai.analyze_fallback_after_error("q", m, "Yahoo", [], "boom", "tr")
    en = ai.analyze_fallback_after_error("q", m, "Yahoo", [], "boom", "en")
    assert "ulaşılamadı" in tr["aiText"]
    assert "Couldn't reach the AI service" in en["aiText"]
    assert tr["meta"]["mode"] == en["meta"]["mode"] == "error-fallback"


def test_fallback_hiz_limiti_iki_dilde():
    m = {"X": {"cagr": 1.0, "sharpe": 0.1, "mdd": -5.0}}
    en = ai.analyze_fallback_after_error("q", m, "s", [], "429 quota exhausted", "en")
    tr = ai.analyze_fallback_after_error("q", m, "s", [], "429 quota exhausted", "tr")
    assert "rate limit" in en["aiText"].lower()
    assert "Hız Limiti" in tr["aiText"]


def test_groq_yanlis_anahtar_bosaltilir():
    """Groq anahtarı 'gsk_' ile başlamıyorsa (ör. yanlışlıkla Gemini
    anahtarı yapıştırılmış) import sırasında boşaltılır — ham 401 yerine
    nazik düşüş. .env'de AQ. ile başlayan anahtar varsa GROQ_KEY boş olmalı."""
    if ai._key("GROQ_API_KEY") and not ai._key("GROQ_API_KEY").startswith("gsk_"):
        assert ai.GROQ_KEY == ""      # yanlış biçim -> boşaltıldı
    # doğru biçimdeyse ya da yoksa: bu test bir şey iddia etmez (ortam bağımlı)
