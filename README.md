# FinDatalytix (v0.8 Alpha)

RAG destekli, çift yapay zekâlı (Claude analist + Gemini hakem) finansal risk
analizi ve Monte Carlo simülasyon platformu. Vanilla JS frontend + Python
FastAPI backend.

## Hızlı Başlangıç

```bash
# 1) Backend bağımlılıkları
cd backend
py -m pip install -r requirements.txt          # Windows
# pip install -r requirements.txt              # macOS/Linux

# 2) API anahtarları (opsiyonel ama önerilir)
copy .env.example .env                          # sonra içine anahtarlarını yaz
# ANTHROPIC_API_KEY=...  ve/veya  GEMINI_API_KEY=...

# 3) Sunucuyu başlat
py -m uvicorn main:app --reload --port 8000

# 4) Arayüz: index.html'i tarayıcıda aç (çift tıklama yeterli)
```

Swagger paneli: http://127.0.0.1:8000/docs

## Mimari

```
index.html ─ styles.css              görünüm (glassmorphism, açık/koyu tema)
config.js                            yapılandırma + TR/EN sözlük
core.js      FDX.store / router / api   tek doğru kaynak, hash router, fetch katmanı
app.js       render + grafikler         state → DOM tek yönlü akış, ECharts

backend/
  main.py        FastAPI uç noktaları
  market.py      yfinance: canlı mu/sigma (önbellek + fallback)
  analysis.py    RSI(14, Wilder) + MACD(12,26,9) + OHLCV
  rag.py         PDF/DOCX → chunk → ChromaDB (MIN_SCORE eşiği)
  ai.py          Claude analist + Gemini hakem, maliyet yönlendirmesi
  report.py      python-docx risk raporu
  history.py     kalıcı simülasyon geçmişi (history.json, atomik yazım)
```

Uç noktalar: `POST /api/simulate`, `POST /api/report` (docx indirir),
`GET /api/asset/{sembol}`, `POST/GET/DELETE /api/documents`, `POST /api/query`,
`GET /api/history`, `GET /api/ai/status`, `GET /api/health`.

## Önemli Davranışlar

- **Zarif düşüş:** İnternet yoksa piyasa verisi varsayılana, AI anahtarı yoksa
  şablon yoruma düşer; sistem asla bu yüzden çökmez ve durumu arayüzde itiraf eder.
- **Determinizm:** Aynı prompt aynı Monte Carlo sonucunu üretir (SHA-256 seed).
- **RAG eşiği:** Benzerlik < 0.50 olan parçalar ne kullanıcıya ne AI'a gösterilir
  (`rag.py` içindeki `MIN_SCORE`).
- **İlk kullanım notu:** İlk doküman yüklemesinde ChromaDB ~80MB embedding
  modelini bir kez indirir; 1-2 dk sürebilir.

## Canlıya Alma (Deploy)

1. **CORS'u daralt:** `.env` içine `CORS_ORIGINS=https://alanadin.com` yaz
   (virgülle birden çok origin).
2. **Sunucu:** `uvicorn main:app --host 0.0.0.0 --port 8000` (reload'suz).
   Süreç yöneticisi olarak systemd / NSSM / Docker önerilir.
3. **Frontend:** Beş statik dosyayı (index.html, styles.css, config.js,
   core.js, app.js) herhangi bir statik sunucuya koy (nginx, Vercel, GitHub
   Pages...). `config.js` içindeki `api.baseUrl`'i backend adresine güncelle.
4. **Güvenlik:** `.env` dosyasını ASLA repoya koyma (`.gitignore`'a ekle:
   `.env`, `chroma_db/`, `history.json`). API anahtarları her çağrıda gerçek
   para harcar; token sayacı arayüzde görünür.
5. **Sürüm takibi:** `git init` + ilk commit — iki elin aynı dosyaya girdiği
   projelerde senkron kazalarının tek ilacı.

## Yasal Not

Simülasyon ve göstergeler istatistiksel modellere dayanır; çıktılar yatırım
tavsiyesi değildir.
