import re

# Read config.js
with open('config.js', 'r', encoding='utf-8') as f:
    config_content = f.read()

# Define the new I18N block
i18n_block = '''FDX.I18N = {
  tr: {
    views: { overview: "Genel Bakış", simulation: "Simülasyon Oluştur",
             vectordb: "Vektör Veri Tabanı", assets: "Varlık Analizi",
             report: "Risk Raporu", config: "Konfigürasyon", settings: "Ayarlar", watchlist: "İzleme Listesi" },
    status: { system: "Sistem Durumu", db: "Vektör Veri Tabanı",
              cycle: "Haftalık Simülasyon Döngüsü" },
    sys: { ready: "Hazır", running: "Simülasyon Çalışıyor",
           reporting: "Rapor Üretiliyor", offline: "Sunucuya Ulaşılamıyor",
           dbOffline: "Bağlantı yok", doc: "doküman", chunk: "parça" },
    settings: {
      appearance: "Görünüm", theme: "Tema", dark: "Koyu", light: "Açık",
      lang: "Dil",
      info: "Tema ve dil tercihlerin tarayıcı hafızasına (localStorage) kaydedilir; sayfayı yenilesen de seçimin kalır. Not: dinamik hata mesajları şimdilik Türkçe."
    },
    sim: {
      placeholder: "Varlık A (BIST-30 Endeks Fonu) vs Varlık B (Nasdaq-100 Teknoloji ETF) için dinamik Monte Carlo simülasyonu çalıştır ve karşılaştırmalı risk raporu oluştur.",
      emptyTitle: "Henüz simülasyon çalıştırılmadı",
      emptyDesc: "Prompt'a analiz etmek istediğin varlıkları yaz (örn: \\"THYAO ile Apple'ı karşılaştır\\") — AI sembolleri çıkarır, her biri için Monte Carlo koşar ve kartlar burada belirir.",
      ragTitle: "RAG Referans Kaynakları",
      aiTitle: "Claude & Gemini Analiz Yorumu",
      reportTitle: "Risk Raporu Üret",
      reportBtn: "Raporu Oluştur",
      reportHint: "Word (.docx) formatında, RAG kaynaklı teknik risk raporu."
    },
    ov: {
      note: "Son Simülasyonlar tablosu ve döngü sayacı artık gerçek geçmişinden besleniyor. Üstteki portföy kartları Ay 6 sonrası hedefinde.",
      totalAssets: "Toplam Varlık", thisWeek: "+2,4% bu hafta",
      dailyPl: "Günlük K/Z",
      weeklyRet: "Haftalık Getiri", belowIdx: "endeksin 0,3 puan altında",
      activeSims: "Aktif Simülasyon", queued: "2 tamamlandı, 1 kuyruğa alındı",
      recentSims: "Son Simülasyonlar",
      thDate: "Tarih", thVs: "Karşılaştırma", thSharpe: "Sharpe", thStatus: "Durum",
      loading: "Geçmiş yükleniyor…"
    },
    watch: {
      note: "Liste tarayıcına (localStorage) kaydedilir. Fiyatlar sayfa açıkken 60 saniyede bir tazelenir; sekme arka plandayken yenileme durur.",
      placeholder: "Sembol ekle: THYAO, NVDA, BTC-USD…",
      addBtn: "Ekle",
      thSym: "Sembol", thPrice: "Fiyat", thChange: "Değişim", th7d: "Son 7 Gün",
      loading: "Liste yükleniyor…"
    },
    vdb: {
      note: "RAG boru hattı aktif: yüklediğin PDF/Word dosyaları ChromaDB'de vektörlenir ve aranabilir hale gelir.",
      docs: "Yüklü Doküman", waitSrv: "sunucu bekleniyor",
      chunks: "Toplam Chunk", vecParts: "vektörlenmiş parça",
      model: "Embedding Modeli", builtIn: "ChromaDB yerleşik (~80MB)",
      updated: "Son Güncelleme", lastWrite: "indeksin son yazımı",
      dragTitle: "PDF veya Word dosyasını sürükle", dragOr: " ya da tıklayıp seç",
      dragHint: "Dosyalar doğrulanır, ChromaDB'de anında vektörlenir ve aramaya açılır.",
      queue: "Yükleme Kuyruğu",
      testTitle: "RAG Arama Testi",
      placeholder: "Örn: politika faizi ne kadar? (indeksli dokümanlarda arar)",
      searchBtn: "Ara"
    },
    asset: {
      note: "Sembol yaz, 1 yıllık gerçek piyasa verisi RSI ve MACD göstergeleriyle çizilsin. BIST için sadece kod yeterli (THYAO), sistem .IS ekini kendisi dener.",
      placeholder: "Örn: THYAO, GARAN, XU030, AAPL, QQQ…",
      analyzeBtn: "Analiz Et",
      lastPrice: "Son Fiyat",
      range52: "52 Hafta Aralığı", lowHigh: "düşük — yüksek",
      volatility: "Yıllık Volatilite", fromDaily: "günlük getirilerden",
      chartTitle: "Fiyat Grafiği"
    },
    rep: {
      note: "Rapor üretimi canlı: Simülasyon sayfasındaki \\"Raporu Oluştur\\" butonu gerçek .docx indirir. Bu sayfadaki rapor geçmişi listesi gelecek sürüm hedefinde.",
      emptyTitle: "Rapor geçmişi boş",
      emptyDesc: "Oluşturduğun her risk raporu burada listelenecek; tekrar indirebilecek ve karşılaştırabileceksin."
    },
    cfg: {
      note: "AI durumu sunucudan okunuyor…",
      aiRoles: "AI Model Rolleri",
      analyst: "Analist Model", analystNote: "hakem otomatik olarak diğeri olur",
      referee: "Hakem Model",
      ragParams: "RAG Parametreleri",
      chunkSize: "Chunk Boyutu (karakter)", chunkNote: "yalnızca yeni yüklenen dokümanlara uygulanır",
      topK: "Bağlama Giden Chunk Sayısı (top-k)",
      saveBtn: "Kaydet"
    }
  },
  en: {
    views: { overview: "Overview", simulation: "Create Simulation",
             vectordb: "Vector Database", assets: "Asset Analysis",
             report: "Risk Report", config: "Configuration", settings: "Settings", watchlist: "Watchlist" },
    status: { system: "System Status", db: "Vector Database",
              cycle: "Weekly Simulation Cycle" },
    sys: { ready: "Ready", running: "Simulation Running",
           reporting: "Generating Report", offline: "Server Unreachable",
           dbOffline: "No connection", doc: "documents", chunk: "chunks" },
    settings: {
      appearance: "Appearance", theme: "Theme", dark: "Dark", light: "Light",
      lang: "Language",
      info: "Theme and language preferences are saved to your browser (localStorage); your selection persists across reloads. Note: dynamic error messages are currently in Turkish."
    },
    sim: {
      placeholder: "Run a dynamic Monte Carlo simulation for Asset A (BIST-30 Index Fund) vs Asset B (Nasdaq-100 Tech ETF) and generate a comparative risk report.",
      emptyTitle: "Simulation not run yet",
      emptyDesc: "Type the assets you want to analyze in the prompt (e.g. \\"compare THYAO with Apple\\") — AI will extract symbols, run Monte Carlo for each, and cards will appear here.",
      ragTitle: "RAG Reference Sources",
      aiTitle: "Claude & Gemini Analysis",
      reportTitle: "Generate Risk Report",
      reportBtn: "Create Report",
      reportHint: "Technical risk report in Word (.docx) format, sourced from RAG."
    },
    ov: {
      note: "Recent Simulations table and cycle counter now feed from real history. Portfolio cards above are targeted for post-Month 6.",
      totalAssets: "Total Assets", thisWeek: "+2.4% this week",
      dailyPl: "Daily P/L",
      weeklyRet: "Weekly Return", belowIdx: "0.3 pts below index",
      activeSims: "Active Simulations", queued: "2 completed, 1 queued",
      recentSims: "Recent Simulations",
      thDate: "Date", thVs: "Comparison", thSharpe: "Sharpe", thStatus: "Status",
      loading: "Loading history…"
    },
    watch: {
      note: "List is saved to your browser (localStorage). Prices refresh every 60s while page is open; stops when tab is in background.",
      placeholder: "Add symbol: THYAO, NVDA, BTC-USD…",
      addBtn: "Add",
      thSym: "Symbol", thPrice: "Price", thChange: "Change", th7d: "Last 7 Days",
      loading: "Loading list…"
    },
    vdb: {
      note: "RAG pipeline active: uploaded PDF/Word files are vectorized in ChromaDB and become searchable.",
      docs: "Loaded Documents", waitSrv: "awaiting server",
      chunks: "Total Chunks", vecParts: "vectorized parts",
      model: "Embedding Model", builtIn: "ChromaDB built-in (~80MB)",
      updated: "Last Updated", lastWrite: "last index write",
      dragTitle: "Drag PDF or Word files here", dragOr: " or click to select",
      dragHint: "Files are validated, instantly vectorized in ChromaDB, and ready for search.",
      queue: "Upload Queue",
      testTitle: "RAG Search Test",
      placeholder: "e.g. what is the policy rate? (searches indexed docs)",
      searchBtn: "Search"
    },
    asset: {
      note: "Type a symbol to plot 1-year real market data with RSI and MACD indicators. For BIST, ticker alone is enough (THYAO), the system tries .IS suffix automatically.",
      placeholder: "e.g. THYAO, GARAN, AAPL, QQQ…",
      analyzeBtn: "Analyze",
      lastPrice: "Last Price",
      range52: "52-Week Range", lowHigh: "low — high",
      volatility: "Annual Volatility", fromDaily: "from daily returns",
      chartTitle: "Price Chart"
    },
    rep: {
      note: "Report generation is live: 'Create Report' button on Simulation page downloads a real .docx. Report history list on this page is planned for next release.",
      emptyTitle: "Report history is empty",
      emptyDesc: "Every risk report you generate will be listed here; you will be able to download and compare them."
    },
    cfg: {
      note: "AI status is being read from server…",
      aiRoles: "AI Model Roles",
      analyst: "Analyst Model", analystNote: "referee becomes the other automatically",
      referee: "Referee Model",
      ragParams: "RAG Parameters",
      chunkSize: "Chunk Size (chars)", chunkNote: "applies only to newly uploaded documents",
      topK: "Context Chunk Count (top-k)",
      saveBtn: "Save"
    }
  }
};'''

# Replace the block
new_config = re.sub(r'FDX\.I18N = \{.*?\n\};', i18n_block, config_content, flags=re.DOTALL)
with open('config.js', 'w', encoding='utf-8') as f:
    f.write(new_config)

print("config.js updated!")
