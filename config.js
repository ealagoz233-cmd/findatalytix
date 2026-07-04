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
    timeoutMs: 8000
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

/* İlk açılış görünümü — ilk /simulate cevabıyla ezilir */
FDX.SEED = {
  promptText:
    "Varlık A (BIST-30 Endeks Fonu) vs Varlık B (Nasdaq-100 Teknoloji ETF) için " +
    "dinamik Monte Carlo simülasyonu çalıştır ve karşılaştırmalı risk raporu oluştur.",

  aiIntro:
    "Simülasyon motoru hazır. Prompt'u düzenleyip gönder butonuna bastığında " +
    "FastAPI üzerinde 2.000 yollu Monte Carlo (GBM) çalışacak ve sonuçlar " +
    "bu panele düşecek.",

  metrics: {
    A: { model: "PortA-Core7", cagr: 0, vol: 0, sharpe: 0, mdd: 0 },
    B: { model: "SimB-Alpha4", cagr: 0, vol: 0, sharpe: 0, mdd: 0 }
  }
};


/* ----------------------------------------------------------
   AY 6.2 — Dil sözlüğü (TR/EN)
   Kapsam: statik arayüz metinleri. JS'in ürettiği dinamik
   mesajlar (hata detayları vb.) bilinçli olarak TR kaldı;
   tam i18n, çeviri dosyası büyüyünce ayrı modüle taşınır.
---------------------------------------------------------- */
FDX.I18N = {
  tr: {
    views: { overview: "Genel Bakış", simulation: "Simülasyon Oluştur",
             vectordb: "Vektör Veri Tabanı", assets: "Varlık Analizi",
             report: "Risk Raporu", config: "Konfigürasyon", settings: "Ayarlar" },
    status: { system: "Sistem Durumu", db: "Vektör Veri Tabanı",
              cycle: "Haftalık Simülasyon Döngüsü" },
    sys: { ready: "Hazır", running: "Simülasyon Çalışıyor",
           reporting: "Rapor Üretiliyor", offline: "Sunucuya Ulaşılamıyor",
           dbOffline: "Bağlantı yok", doc: "doküman" }
  },
  en: {
    views: { overview: "Overview", simulation: "Create Simulation",
             vectordb: "Vector Database", assets: "Asset Analysis",
             report: "Risk Report", config: "Configuration", settings: "Settings" },
    status: { system: "System Status", db: "Vector Database",
              cycle: "Weekly Simulation Cycle" },
    sys: { ready: "Ready", running: "Simulation Running",
           reporting: "Generating Report", offline: "Server Unreachable",
           dbOffline: "No connection", doc: "documents" }
  }
};
