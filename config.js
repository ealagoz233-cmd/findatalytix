/* ==========================================================
   FinDatalytix — config.js  (Ay 2: mock devre dışı)
   FDX.MOCK silindi. Simülasyon ve rapor verisi artık yalnızca
   FastAPI'den (127.0.0.1:8000) gelir.
   FDX.SEED: sadece sayfanın İLK boyaması için gereken statik
   metinler/başlangıç değerleri — veri değil, dekor.
   ========================================================== */

"use strict";

window.FDX = window.FDX || {};

FDX.CONFIG = {

  api: {
    useMock: false,                         // ← MOTOR TAKILDI
    baseUrl: "http://127.0.0.1:8000/api",
    timeoutMs: 60000
  },

  surfaces: {
    A: { baseVol: 16, smile: 0.55, termSlope: 0.8, noise: 0.9 },
    B: { baseVol: 22, smile: 0.85, termSlope: 0.5, noise: 1.4 }
  },

  chart: {
    autoRotateSpeed: 6,
    distance: 190,
    alpha: 22,
    beta: 40,
    volMin: 5,
    volMax: 45,
    palette: [
      "#313695", "#4575b4", "#74add1", "#abd9e9",
      "#fee090", "#fdae61", "#f46d43", "#d73027", "#a50026"
    ]
  },

  upload: {
    allowedExt: [".pdf", ".docx"],
    maxSizeMB: 20
  },

  typing: { promptMs: 22, aiMs: 14 }
};

/* ----------------------------------------------------------
   PİYASALAR sayfası — canlı tahta enstrümanları (Yahoo sembolleri).
   Satır eklemek/çıkarmak için sadece bu listeyi düzenle.
---------------------------------------------------------- */
FDX.MARKETS = [
  { sym: "USDTRY=X", label: "Dolar / TL" },
  { sym: "EURTRY=X", label: "Euro / TL" },
  { sym: "GBPTRY=X", label: "Sterlin / TL" },
  { sym: "GC=F",     label: "Altın (ons, $)" },
  /* Hesaplı satırlar: ons altın x dolar kuru'ndan türetilir (calc=true).
     factor: ons->gram = 1/31.1035; çeyrek = gram x 1.603 (1.75g, 22 ayar).
     Not: külçe karşılığıdır; kuyumcu alış-satış makası dahil değildir. */
  { calc: true, label: "Gram Altın (TL)",
    needs: ["GC=F", "USDTRY=X"], factor: 1 / 31.1035,
    note: "hesaplanan: ons × kur" },
  { calc: true, label: "Çeyrek Altın (TL)",
    needs: ["GC=F", "USDTRY=X"], factor: 1.603 / 31.1035,
    note: "hesaplanan: külçe karşılığı" },
  { sym: "SI=F",     label: "Gümüş (ons, $)" },
  { sym: "BZ=F",     label: "Brent Petrol ($)" },
  { sym: "XU100.IS", label: "BIST 100" },
  { sym: "^GSPC",    label: "S&P 500" },
  { sym: "BTC-USD",  label: "Bitcoin ($)" },
  { sym: "ETH-USD",  label: "Ethereum ($)" }
];

/* İlk açılış görünümü — ilk /simulate cevabıyla ezilir */
FDX.SEED = {
  promptText:
    "Varlık A (BIST-30 Endeks Fonu) vs Varlık B (Nasdaq-100 Teknoloji ETF) için " +
    "dinamik Monte Carlo simülasyonu çalıştır ve karşılaştırmalı risk raporu oluştur.",

  aiIntro:
    "Simülasyon motoru hazır. Prompt'u düzenleyip gönder butonuna bastığında " +
    "FastAPI üzerinde 2.000 yollu Monte Carlo (GBM) çalışacak ve sonuçlar " +
    "bu panele düşecek.",

  metrics: {}   // v0.9: kartlar ilk simülasyonla dinamik doğar
};


/* ----------------------------------------------------------
   AY 6.2 — Dil sözlüğü (TR/EN)
   Kapsam: statik arayüz metinleri. JS'in ürettiği dinamik
   mesajlar (hata detayları vb.) bilinçli olarak TR kaldı;
   tam i18n, çeviri dosyası büyüyünce ayrı modüle taşınır.
---------------------------------------------------------- */
FDX.I18N = {
  tr: {
    views: { overview: "Genel Bakış", markets: "Piyasalar", portfolio: "Portföy",
             simulation: "Simülasyon Oluştur",
             vectordb: "Vektör Veri Tabanı", assets: "Varlık Analizi",
             report: "Risk Raporu", config: "Konfigürasyon", settings: "Ayarlar" },
    status: { system: "Sistem Durumu", db: "Vektör Veri Tabanı",
              cycle: "Haftalık Simülasyon Döngüsü" },
    sys: { ready: "Hazır", running: "Simülasyon Çalışıyor",
           reporting: "Rapor Üretiliyor", offline: "Sunucuya Ulaşılamıyor",
           dbOffline: "Bağlantı yok", doc: "doküman", chunk: "chunk" },
    ui: { live: "CANLI", loading: "Veriler yükleniyor…", loadingShort: "Yükleniyor…" },
    tbl: { symbol: "Sembol", price: "Fiyat", change: "Değişim", trend7: "7 Günlük Trend", sharpe: "Sharpe" },
    ov: {
      note: "Bu sayfadaki her kart ve tablo gerçek veriden beslenir — sahte rakam yok.",
      totalSim: "Toplam Simülasyon", totalSimNote: "tümü gerçek geçmişten",
      week: "Bu Hafta", weekNote: "haftalık döngü",
      docs: "İndeksli Belge", docsNote: "vektör veri tabanında",
      watch: "İzleme Listesi", watchNote: "sembol takipte",
      watchTitle: "Canlı İzleme Listesi", watchPh: "Örn: THYAO", add: "Ekle",
      recentSim: "Son Simülasyonlar", date: "Tarih", compare: "Karşılaştırma",
      status: "Durum", histLoading: "Geçmiş yükleniyor…",
      weekLimit: "haftalık limit: ", chunksIndexed: " chunk indeksli"
    },
    mk: {
      note: "Kurlar, emtia, endeks ve kripto Yahoo Finance'ten canlı çekilir; sayfa açıkken 60 saniyede bir tazelenir.",
      title: "Canlı Piyasa Tahtası", instrument: "Enstrüman"
    },
    pf: {
      note: "Kendi varlıklarını gir (adet + alış fiyatı); güncel piyasa fiyatıyla anlık değer ve kâr/zararını hesaplar. Veriler yalnızca senin tarayıcında saklanır.",
      totalValue: "Toplam Değer", totalValueNote: "güncel piyasa fiyatıyla", totalValuePending: "* bazı fiyatlar bekleniyor",
      totalCost: "Toplam Maliyet", totalCostNote: "alış tutarların",
      pnl: "Toplam Kâr / Zarar", count: "Varlık Sayısı", countNote: "portföydeki satır",
      addTitle: "Varlık Ekle", phSym: "Sembol (örn: THYAO, AAPL)", phQty: "Adet", phCost: "Alış fiyatı",
      mine: "Varlıklarım", qty: "Adet", buy: "Alış", current: "Güncel", value: "Değer", pnlShort: "K/Z",
      empty: "Henüz varlık eklenmedi."
    },
    sim: {
      emptyTitle: "Henüz simülasyon çalıştırılmadı",
      emptyBody: "Prompt'a analiz etmek istediğin varlıkları yaz (örn: \"THYAO ile Apple'ı karşılaştır\") — AI sembolleri çıkarır, her biri için Monte Carlo koşar ve kartlar burada belirir.",
      ragTitle: "RAG Referans Kaynakları", ragUse: "simülasyonda kullan",
      aiTitle: "Claude & Gemini Analiz Yorumu",
      reportTitle: "Risk Raporu Üret", reportHint: "Word (.docx) formatında, RAG kaynaklı teknik risk raporu."
    },
    vdb: {
      note: "RAG boru hattı aktif: yüklediğin PDF/Word dosyaları ChromaDB'de vektörlenir ve aranabilir hale gelir.",
      docs: "Yüklü Doküman", docsNote: "sunucu bekleniyor",
      chunks: "Toplam Chunk", chunksNote: "vektörlenmiş parça",
      embModel: "Embedding Modeli", embNote: "ChromaDB yerleşik (~80MB)",
      updated: "Son Güncelleme", updatedNote: "indeksin son yazımı",
      dropStrong: "PDF veya Word dosyasını sürükle", dropRest: "ya da tıklayıp seç",
      dzHint: "Dosyalar doğrulanır, ChromaDB'de anında vektörlenir ve aramaya açılır.",
      queue: "Yükleme Kuyruğu", indexed: "İndeksli Belgeler",
      searchTitle: "RAG Arama Testi", searchPh: "Örn: politika faizi ne kadar? (indeksli dokümanlarda arar)"
    },
    as: {
      note: "Sembol yaz, 1 yıllık gerçek piyasa verisi RSI ve MACD göstergeleriyle çizilsin. BIST için sadece kod yeterli (THYAO), sistem .IS ekini kendisi dener.",
      ph: "Örn: THYAO, GARAN, XU030, AAPL, QQQ…",
      last: "Son Fiyat", range: "52 Hafta Aralığı", rangeNote: "düşük — yüksek",
      vol: "Yıllık Volatilite", volNote: "günlük getirilerden", rsi: "RSI (14)",
      chartTitle: "Fiyat Grafiği"
    },
    rep: {
      note: "Üretilen her .docx rapor sunucuda arşivlenir; buradan tekrar indirebilir ya da silebilirsin.",
      title: "Rapor Arşivi", report: "Rapor", size: "Boyut"
    },
    cfg: {
      rolesTitle: "AI Model Rolleri", rolesNote: "(Claude ve Gemini rolleri dinamik olarak değiştirilebilir)",
      groqNote: "⚡ Groq (Llama 3.3) aktif: tüm AI rollerini şu an Groq yürütüyor. Aşağıdaki analist/hakem seçimi yalnızca Groq anahtarı kaldırılırsa devreye girer.",
      analyst: "Analist Model", referee: "Hakem Model",
      ragParams: "RAG Parametreleri",
      chunkSize: "Chunk Boyutu (karakter, 300-1200)", chunkNote: "yeni yüklemelerde geçerli",
      topK: "Getirilecek Chunk Sayısı (top-k)", save: "Ayarları Kaydet", saved: "Kaydedildi ✓",
      aiLoading: "AI durumu sunucudan okunuyor…"
    },
    set: {
      note: "Tema ve dil tercihlerin tarayıcı hafızasına (localStorage) kaydedilir; sayfayı yenilesen de seçimin kalır. Not: dinamik hata mesajları şimdilik Türkçe.",
      appearance: "Görünüm", theme: "Tema", themeDim: "Loş", themeBlack: "Siyah", themeLight: "Beyaz",
      lang: "Dil", dataTitle: "Veri Yönetimi (Yedek)",
      dataNote: "Portföyün, izleme listen ve tercihlerin yalnızca bu tarayıcıda saklanır. Tarayıcı verisini temizlersen kaybolur — düzenli olarak dışa aktar (yedekle).",
      export: "Dışa Aktar (JSON indir)", import: "İçe Aktar (yedek yükle)"
    },
    prov: { title: "Kaynak Belge" },
    tip: {
      home: "Ana sayfaya dön (Genel Bakış)",
      share: "Bu sayfanın bağlantısını kopyala",
      shareCopied: "Bağlantı kopyalandı",
      shareBlocked: "Pano erişimi engellendi — adres çubuğundan kopyalayabilirsin",
      auth: "Üyelik ve yetkilendirme (Auth) Ay 6 sonrası yol haritasında",
      runSim: "Simülasyonu çalıştır",
      ragToggle: "Kapalıyken simülasyon belgelere hiç bakmaz (daha hızlı, daha az token)",
      close: "Kapat",
      srcDoc: "Kaynak belge",
      openInDoc: "Kaynağı belgede aç (sayfa ",
      openInDocBtn: "belgede aç →",
      deleteDoc: "Belgeyi indeksten kalıcı olarak sil",
      openSide: "Kaynağı yan panelde, tam bu sayfada göster",
      cycleWeek: "Bu hafta: ", cycleTotal: " simülasyon · Toplam: "
    },
    app: {
      errSim: "Simülasyon başarısız: ",
      btnReport: "Raporu Oluştur",
      btnAnalyze: "Analiz Et", btnAnalyzing: "Yükleniyor…",
      errAsset: "veri yok", errConn: "bağlantı yok",
      errAI: "AI durumu alınamadı: ",
      btnSave: "Kaydet", btnSaving: "Kaydediliyor…",
      errGeneric: "Hata: ", saved: "Kaydedildi ✓ (restart gerekmez)",
      errHist: "Geçmiş alınamadı: ",
      tpl: "Şablon", aiErr: "AI hatası",
      serverFail: "sunucuya ulaşılamadı",
      noDocs: "henüz doküman yok", idxLive: "indeks canlı",
      btnSearch: "Ara", btnSearching: "Aranıyor…",
      searching: "Aranıyor…", searchErr: "Arama hatası: ",
      noResults: "Sonuç yok — önce doküman yükle ya da soruyu değiştir.",
      promptText: "Varlık A (BIST-30 Endeks Fonu) vs Varlık B (Nasdaq-100 Teknoloji ETF) için dinamik Monte Carlo simülasyonu çalıştır ve karşılaştırmalı risk raporu oluştur."
    }
  },
  en: {
    views: { overview: "Overview", markets: "Markets", portfolio: "Portfolio",
             simulation: "Create Simulation",
             vectordb: "Vector Database", assets: "Asset Analysis",
             report: "Risk Report", config: "Configuration", settings: "Settings" },
    status: { system: "System Status", db: "Vector Database",
              cycle: "Weekly Simulation Cycle" },
    sys: { ready: "Ready", running: "Simulation Running",
           reporting: "Generating Report", offline: "Server Unreachable",
           dbOffline: "No connection", doc: "documents", chunk: "chunks" },
    ui: { live: "LIVE", loading: "Loading data…", loadingShort: "Loading…" },
    tbl: { symbol: "Symbol", price: "Price", change: "Change", trend7: "7-Day Trend", sharpe: "Sharpe" },
    ov: {
      note: "Every card and table on this page is backed by real data — no fake numbers.",
      totalSim: "Total Simulations", totalSimNote: "all from real history",
      week: "This Week", weekNote: "weekly cycle",
      docs: "Indexed Documents", docsNote: "in the vector database",
      watch: "Watchlist", watchNote: "symbols tracked",
      watchTitle: "Live Watchlist", watchPh: "e.g. THYAO", add: "Add",
      recentSim: "Recent Simulations", date: "Date", compare: "Comparison",
      status: "Status", histLoading: "Loading history…",
      weekLimit: "weekly limit: ", chunksIndexed: " chunks indexed"
    },
    mk: {
      note: "Rates, commodities, indices and crypto are pulled live from Yahoo Finance; refreshes every 60 seconds while the page is open.",
      title: "Live Market Board", instrument: "Instrument"
    },
    pf: {
      note: "Enter your own holdings (quantity + buy price); it computes live value and profit/loss at current market prices. Data is stored only in your browser.",
      totalValue: "Total Value", totalValueNote: "at current market price", totalValuePending: "* some prices pending",
      totalCost: "Total Cost", totalCostNote: "your purchase totals",
      pnl: "Total Profit / Loss", count: "Holdings", countNote: "rows in portfolio",
      addTitle: "Add Holding", phSym: "Symbol (e.g. THYAO, AAPL)", phQty: "Quantity", phCost: "Buy price",
      mine: "My Holdings", qty: "Qty", buy: "Buy", current: "Current", value: "Value", pnlShort: "P/L",
      empty: "No holdings added yet."
    },
    sim: {
      emptyTitle: "No simulation has been run yet",
      emptyBody: "Type the assets you want to analyze in the prompt (e.g. \"compare THYAO with Apple\") — the AI extracts the symbols, runs Monte Carlo for each, and the cards appear here.",
      ragTitle: "RAG Reference Sources", ragUse: "use in simulation",
      aiTitle: "Claude & Gemini Analysis",
      reportTitle: "Generate Risk Report", reportHint: "A RAG-sourced technical risk report in Word (.docx) format."
    },
    vdb: {
      note: "RAG pipeline active: the PDF/Word files you upload are vectorized in ChromaDB and become searchable.",
      docs: "Uploaded Documents", docsNote: "waiting for server",
      chunks: "Total Chunks", chunksNote: "vectorized pieces",
      embModel: "Embedding Model", embNote: "ChromaDB built-in (~80MB)",
      updated: "Last Update", updatedNote: "last index write",
      dropStrong: "Drag a PDF or Word file", dropRest: "or click to select",
      dzHint: "Files are validated, instantly vectorized in ChromaDB and opened to search.",
      queue: "Upload Queue", indexed: "Indexed Documents",
      searchTitle: "RAG Search Test", searchPh: "e.g. what is the policy rate? (searches indexed documents)"
    },
    as: {
      note: "Type a symbol to plot 1 year of real market data with RSI and MACD indicators. For BIST just the code is enough (THYAO); the system tries the .IS suffix itself.",
      ph: "e.g. THYAO, GARAN, XU030, AAPL, QQQ…",
      last: "Last Price", range: "52-Week Range", rangeNote: "low — high",
      vol: "Annual Volatility", volNote: "from daily returns", rsi: "RSI (14)",
      chartTitle: "Price Chart"
    },
    rep: {
      note: "Every generated .docx report is archived on the server; you can re-download or delete it here.",
      title: "Report Archive", report: "Report", size: "Size"
    },
    cfg: {
      rolesTitle: "AI Model Roles", rolesNote: "(Claude and Gemini roles can be switched dynamically)",
      groqNote: "⚡ Groq (Llama 3.3) active: all AI roles currently run on Groq. The analyst/referee choice below only applies if the Groq key is removed.",
      analyst: "Analyst Model", referee: "Referee Model",
      ragParams: "RAG Parameters",
      chunkSize: "Chunk Size (characters, 300-1200)", chunkNote: "applies to new uploads",
      topK: "Chunks to Retrieve (top-k)", save: "Save Settings", saved: "Saved ✓",
      aiLoading: "Reading AI status from server…"
    },
    set: {
      note: "Your theme and language preferences are saved to browser storage (localStorage); they persist across reloads. Note: dynamic error messages are Turkish for now.",
      appearance: "Appearance", theme: "Theme", themeDim: "Dim", themeBlack: "Black", themeLight: "White",
      lang: "Language", dataTitle: "Data Management (Backup)",
      dataNote: "Your portfolio, watchlist and preferences are stored only in this browser. If you clear browser data they are lost — export (back up) regularly.",
      export: "Export (download JSON)", import: "Import (load backup)"
    },
    prov: { title: "Source Document" },
    tip: {
      home: "Go to home (Overview)",
      share: "Copy this page's link",
      shareCopied: "Link copied",
      shareBlocked: "Clipboard access blocked — copy from the address bar",
      auth: "Membership & authorization (Auth) is on the roadmap after Month 6",
      runSim: "Run the simulation",
      ragToggle: "When off, the simulation never looks at documents (faster, fewer tokens)",
      close: "Close",
      srcDoc: "Source document",
      openInDoc: "Open the source in the document (page ",
      openInDocBtn: "open in document →",
      deleteDoc: "Permanently delete this document from the index",
      openSide: "Show the source in the side panel, at this exact page",
      cycleWeek: "This week: ", cycleTotal: " simulations · Total: "
    },
    app: {
      errSim: "Simulation failed: ",
      btnReport: "Generate Report",
      btnAnalyze: "Analyze", btnAnalyzing: "Loading…",
      errAsset: "no data", errConn: "no connection",
      errAI: "Couldn't read AI status: ",
      btnSave: "Save", btnSaving: "Saving…",
      errGeneric: "Error: ", saved: "Saved ✓ (no restart needed)",
      errHist: "Couldn't load history: ",
      tpl: "Template", aiErr: "AI error",
      serverFail: "server unreachable",
      noDocs: "no documents yet", idxLive: "index live",
      btnSearch: "Search", btnSearching: "Searching…",
      searching: "Searching…", searchErr: "Search error: ",
      noResults: "No results — upload a document or change the query.",
      promptText: "Run a dynamic Monte Carlo simulation comparing Asset A (BIST-30 Index Fund) vs Asset B (Nasdaq-100 Tech ETF) and generate a comparative risk report."
    }
  }
};
