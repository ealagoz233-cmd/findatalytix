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

  typing: { promptMs: 22, aiMs: 14 },

  cycle: { done: 452, total: 600 }
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
    views: { overview: "Genel Bakış", markets: "Piyasalar",
             simulation: "Simülasyon Oluştur",
             vectordb: "Vektör Veri Tabanı", assets: "Varlık Analizi",
             report: "Risk Raporu", config: "Konfigürasyon", settings: "Ayarlar" },
    status: { system: "Sistem Durumu", db: "Vektör Veri Tabanı",
              cycle: "Haftalık Simülasyon Döngüsü" },
    sys: { ready: "Hazır", running: "Simülasyon Çalışıyor",
           reporting: "Rapor Üretiliyor", offline: "Sunucuya Ulaşılamıyor",
           dbOffline: "Bağlantı yok", doc: "doküman", chunk: "chunk" },
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
    views: { overview: "Overview", markets: "Markets",
             simulation: "Create Simulation",
             vectordb: "Vector Database", assets: "Asset Analysis",
             report: "Risk Report", config: "Configuration", settings: "Settings" },
    status: { system: "System Status", db: "Vector Database",
              cycle: "Weekly Simulation Cycle" },
    sys: { ready: "Ready", running: "Simulation Running",
           reporting: "Generating Report", offline: "Server Unreachable",
           dbOffline: "No connection", doc: "documents", chunk: "chunks" },
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
