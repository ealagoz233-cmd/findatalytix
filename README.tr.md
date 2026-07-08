# FinDatalytix

**Yapay zekâ destekli finansal risk analizi platformu** — Monte Carlo simülasyonu, RAG tabanlı belge arama ve çift-AI (analist + hakem) yorum hattı; hepsi gerçek zamanlı bir piyasa panosunun içinde.

🇬🇧 [English README](README.md)

## Ne yapar?

*"THYAO ile Apple'ı karşılaştır"* gibi doğal dilde bir prompt yaz — sistem:

1. Prompt'tan **sembolleri LLM ile çıkarır** (deterministik yedekli),
2. **2 yıllık gerçek piyasa verisi** çekip (Yahoo Finance) GBM parametrelerini tahmin eder (μ, σ — Itô düzeltmesiyle),
3. Varlık başına **2.000 yollu Monte Carlo** koşar — CAGR, volatilite, Sharpe, maksimum düşüş,
4. Yorumu **senin yüklediğin belgelere** dayandırır (PDF/DOCX → ChromaDB vektör arama),
5. Bir LLM analizi yazar, **ikinci bir LLM hakemlik edip** güven puanı verir,
6. Hepsini biçimli bir **.docx risk raporu** olarak indirir.

Çekirdeğin etrafında: canlı **Piyasalar tahtası** (döviz / altın / emtia / endeks / kripto — sparkline ve fiyat flaş animasyonlarıyla), varlık başına **teknik analiz** (mum grafiği + RSI + MACD), kalıcı izleme listesi, simülasyon geçmişi, TR/EN dil desteği ve koyu/açık tema.

## Mimari

```
index.html ── styles.css          glassmorphism arayüz, koyu/açık tema
config.js                         yapılandırma + TR/EN sözlük (FDX namespace)
core.js                           store (tek doğru kaynak) + hash router + API katmanı
app.js                            render katmanı — tek yönlü veri akışı, ECharts
        │  fetch (REST)
        ▼
backend/main.py                   FastAPI — 14 uç nokta
├── market.py                     GBM parametre tahmini (2y kapanış, 1 sa önbellek)
├── analysis.py                   OHLCV + RSI(14, Wilder) + MACD(12,26,9), .IS çözümleme
├── watchlist.py                  toplu kotasyon + 7 günlük sparkline (55 sn önbellek)
├── rag.py                        ChromaDB — PDF/DOCX parçalama ve anlamsal arama
├── ai.py                         analist/hakem hattı (Groq · Anthropic · Gemini)
├── report.py                     python-docx rapor üretici
└── history.py                    simülasyon geçmişi (atomik yazım)

engine/                           findatalytix-engine — çekirdeğin kurulabilir
                                  kütüphaneye taşınması (Monte Carlo taşındı)
```

**Kod genelinde uygulanan tasarım ilkeleri:**

- **Durum DOM'da değil, store'da yaşar.** Frontend el yapımı küçük bir tek yönlü akış: etkileşim → API/router → store → `render(state)`. Framework yok, build adımı yok — statik dosyaları sun, çalışır.
- **Zarif düşüş, dürüst itiraf.** İnternet yoksa piyasa verisi varsayılana düşer ve cevap bunu *itiraf eder* (`source: "fallback"`). AI anahtarı yoksa yorum şablon moduna düşer ve arayüzde söyler.
- **Determinizm.** Aynı prompt aynı Monte Carlo sonucunu üretir (SHA-256 türevli seed) — sonuçlar tekrarlanabilir.
- **Önce önbellek.** Her Yahoo Finance temas noktasının amaca uygun TTL'i var (kotasyon 55 sn, teknikler 15 dk, GBM parametreleri 1 sa) — veri kaynağı asla dövülmez.
- **Hata da veridir.** Bozuk bir sembol toplu isteği düşürmez — `error` alanıyla döner ve silinebilir bir satır olarak çizilir.
- **RAG kalite eşiği:** Benzerliği 0.50'nin altındaki parçalar ne kullanıcıya ne modele gösterilir (`rag.py` içindeki `MIN_SCORE`).

## Hızlı Başlangıç

```bash
# 1) Backend bağımlılıkları
cd backend
py -m pip install -r requirements.txt        # Windows
# pip install -r requirements.txt            # macOS / Linux

# 2) API anahtarları (opsiyonel — anahtarsız şablon modu çalışır)
copy .env.example .env                       # sonra anahtar(lar)ını yaz
# GROQ_API_KEY=...  (ücretsiz katman yeter)  ve/veya  ANTHROPIC_API_KEY / GEMINI_API_KEY

# 3) API'yi başlat   (dikkat: --reload YOK — Windows'ta .env okumasını bozuyor)
py -m uvicorn main:app --port 8000

# 4) Arayüzü repo kökünden sun
py -m http.server 8080     # → http://localhost:8080
```

Swagger paneli: http://127.0.0.1:8000/docs

> İlk belge yüklemesinde ChromaDB ~80 MB'lık embedding modelini bir kez indirir; 1-2 dk sürebilir.

## Testler

```bash
cd backend
python -m pytest tests -q        # 20 passed
```

Tasarım gereği ağsız çalışır (sahte AI + sahte embedder enjekte edilir). Simülasyon ucu, RAG hattı, belge yaşam döngüsü, ayarlar, ajan davranışı ve engine kütüphanesini kapsar.

## Canlıya Alma

1. **CORS'u daralt:** `.env` içine `CORS_ORIGINS=https://alanadin.com` (virgülle çoklu origin).
2. **API:** `uvicorn main:app --host 0.0.0.0 --port 8000` — systemd / NSSM / Docker arkasında.
3. **Frontend:** Beş statik dosya herhangi bir statik sunucuya (nginx, Vercel, GitHub Pages…); `config.js` içindeki `api.baseUrl`'i backend adresine çevir.
4. **Gizlilik:** `.env` repoya asla girmez — `.gitignore` bunu zorlar.

## Yol Haritası

- `findatalytix-engine` taşımasının tamamlanması (market / analysis / RAG katmanları)
- Provenance çekmecesi — AI'ın her iddiasına tıklayınca kaynak chunk'ın açılması
- Tek VPS deploy reçetesi (Caddy + uvicorn)

## Yasal Not

Simülasyon ve göstergeler istatistiksel modellere dayanır; çıktılar **yatırım tavsiyesi değildir**.

## Lisans

[MIT](LICENSE) © 2026 Eren Alagöz
