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
    // baseUrl otomatik secilir:
    //   file://  veya gelistirme sunuculari (8080/8091/...)  -> yerel backend 127.0.0.1:8000
    //   port yok (80/443 = deploy, or. Render) veya 8000     -> ayni origin (backend siteyi de sunar)
    baseUrl: (() => {
      if (location.protocol === "file:") return "http://127.0.0.1:8000/api";
      if (location.port === "" || location.port === "8000") return location.origin + "/api";
      return "http://127.0.0.1:8000/api";
    })(),
    timeoutMs: 60000
  },

  /* surfaces + chart ayarlari emekli edildi (11 Tem): 3D yuzey sentetik
     dekordu; grafik artik simulasyonun GERCEK yuzdelik yelpazesi. */

  upload: {
    allowedExt: [".pdf", ".docx"],
    maxSizeMB: 20
  },

  // Supabase: üyelik + kalıcı veri (Render diski silindiği için hesaplar
  // burada saklanır). publishable key PUBLIC olacak şekilde tasarlanmıştır
  // (RLS korur); config.js zaten herkese açık. service_role/DB şifresi ASLA
  // burada olmaz. Boş bırakılırsa auth kapanır, uygulama localStorage moduna düşer.
  supabase: {
    url: "https://heodtnwiermclnjhqdpm.supabase.co",
    key: "sb_publishable_cz6LHt69P8VXu8LzPV2WNg_aA0ZuCem"
  },

  typing: { promptMs: 22, aiMs: 14 }
};

/* ----------------------------------------------------------
   PİYASALAR sayfası — canlı tahta enstrümanları (Yahoo sembolleri).
   Satır eklemek/çıkarmak için sadece bu listeyi düzenle.
---------------------------------------------------------- */
FDX.MARKETS = [
  { sym: "USDTRY=X", label: "Dolar / TL",     en: "USD / TRY" },
  { sym: "EURTRY=X", label: "Euro / TL",      en: "EUR / TRY" },
  { sym: "GBPTRY=X", label: "Sterlin / TL",   en: "GBP / TRY" },
  { sym: "GC=F",     label: "Altın (ons, $)", en: "Gold (oz, $)" },
  /* Hesaplı satırlar: ons altın x dolar kuru'ndan türetilir (calc=true).
     factor: ons->gram = 1/31.1035; çeyrek = gram x 1.603 (1.75g, 22 ayar).
     Not: külçe karşılığıdır; kuyumcu alış-satış makası dahil değildir. */
  { calc: true, label: "Gram Altın (TL)", en: "Gram Gold (TRY)",
    needs: ["GC=F", "USDTRY=X"], factor: 1 / 31.1035,
    note: "hesaplanan: ons × kur", noteEn: "computed: oz × rate" },
  { calc: true, label: "Çeyrek Altın (TL)", en: "Quarter Gold (TRY)",
    needs: ["GC=F", "USDTRY=X"], factor: 1.603 / 31.1035,
    note: "hesaplanan: külçe karşılığı", noteEn: "computed: bullion equiv." },
  { sym: "SI=F",     label: "Gümüş (ons, $)", en: "Silver (oz, $)" },
  { sym: "BZ=F",     label: "Brent Petrol ($)", en: "Brent Oil ($)" },
  { sym: "XU100.IS", label: "BIST 100",       en: "BIST 100" },
  { sym: "^GSPC",    label: "S&P 500",        en: "S&P 500" }
  /* Kripto satirlari kaldirildi: artik ozel "Kripto" sekmesi var
     (Binance WS, 10 coin, canli) — burada tutmak mukerrerdi ve her
     60 sn'lik poll'da Yahoo'ya 2 gereksiz sembol soruyordu. */
];

/* İlk açılış görünümü — ilk /simulate cevabıyla ezilir */
FDX.SEED = {
  promptText:
    "Varlık A (BIST-30 Endeks Fonu) vs Varlık B (Nasdaq-100 Teknoloji ETF) için " +
    "dinamik Monte Carlo simülasyonu çalıştır ve karşılaştırmalı risk raporu oluştur.",

  aiIntro:
    "Motor hazır. Bir karşılaştırma isteği gönder — sonuç kartları, " +
    "yelpaze grafikleri ve analist + hakem yorumu bu panele düşer.",

  metrics: {}   // v0.9: kartlar ilk simülasyonla dinamik doğar
};


/* ----------------------------------------------------------
   AY 6.2 — Dil sözlüğü (TR/EN)
   Kapsam: statik arayüz metinleri. JS'in ürettiği dinamik
   mesajlar (hata detayları vb.) bilinçli olarak TR kaldı;
   tam i18n, çeviri dosyası büyüyünce ayrı modüle taşınır.
---------------------------------------------------------- */
/* Kripto tahtasi: fiyatlar Binance WebSocket'ten (sembol = Binance pariteleri).
   Liste buradan yonetilir; yeni coin eklemek = yeni satir. */
FDX.CRYPTO = [
  { sym: "BTCUSDT",  label: "Bitcoin",   code: "BTC" },
  { sym: "ETHUSDT",  label: "Ethereum",  code: "ETH" },
  { sym: "BNBUSDT",  label: "BNB",       code: "BNB" },
  { sym: "SOLUSDT",  label: "Solana",    code: "SOL" },
  { sym: "XRPUSDT",  label: "XRP",       code: "XRP" },
  { sym: "DOGEUSDT", label: "Dogecoin",  code: "DOGE" },
  { sym: "ADAUSDT",  label: "Cardano",   code: "ADA" },
  { sym: "AVAXUSDT", label: "Avalanche", code: "AVAX" },
  { sym: "LINKUSDT", label: "Chainlink", code: "LINK" },
  { sym: "TRXUSDT",  label: "Tron",      code: "TRX" }
];

/* Haberler ust seridi (ticker): watchlist endpointi uzerinden cekilir.
   BTC kodu backend'de BTC-USD paritesine cozulur. */
FDX.NEWS_TICKER = [
  { sym: "XU100.IS", tr: "BIST 100", en: "BIST 100" },
  { sym: "USDTRY=X", tr: "Dolar",    en: "USD/TRY" },
  { sym: "EURTRY=X", tr: "Euro",     en: "EUR/TRY" },
  { sym: "GC=F",     tr: "Altın",    en: "Gold" },
  { sym: "BTC",      tr: "Bitcoin",  en: "Bitcoin" }
];

FDX.I18N = {
  tr: {
    views: { overview: "Genel Bakış", markets: "Piyasalar", crypto: "Kripto", news: "Haberler", portfolio: "Portföy",
             simulation: "Simülasyon Oluştur",
             vectordb: "Vektör Veri Tabanı", assets: "Varlık Analizi",
             report: "Risk Raporu", config: "Konfigürasyon", settings: "Ayarlar" },
    status: { system: "Sistem Durumu", db: "Vektör Veri Tabanı",
              cycle: "Haftalık Simülasyon Döngüsü" },
    sys: { ready: "Hazır", running: "Simülasyon Çalışıyor",
           reporting: "Rapor Üretiliyor", offline: "Sunucuya Ulaşılamıyor",
           dbOffline: "Bağlantı yok", doc: "doküman", chunk: "chunk" },
    ui: { live: "CANLI", loading: "Veriler yükleniyor…", loadingShort: "Yükleniyor…",
          serverDown: "Veri alınamadı — backend çalışıyor mu?",
          wlEmpty: "Liste boş — yukarıdan sembol ekle (örn: THYAO, NVDA, BTC-USD).",
          rpEmpty: "Henüz rapor üretilmedi — Simülasyon sayfasında bir simülasyon çalıştırıp \"Raporu Oluştur\"a bas.",
          histEmpty: "Henüz simülasyon çalıştırılmadı — Simülasyon Oluştur sayfasından başla." },
    dyn: {
      simErrSuffix: " — Prompt'u düzenleyip tekrar gönderebilirsin.",
      simRunning: "Monte Carlo çalışıyor ve AI analiz ediyor… birkaç saniye sürebilir.",
      calcTitle: "Hesaplanıyor…", calcBody: "2.000 yollu Monte Carlo koşuyor, AI yorumu hazırlanıyor.",
      btnGenerating: "Oluşturuluyor…", btnReady: "Rapor Hazır ✓", btnRetry: "Hata — tekrar dene",
      aiTemplate: "Şablon mod — .env'e API anahtarı (örn. ücretsiz GROQ_API_KEY) eklenince gerçek AI devreye girer",
      aiErrShown: "AI hatası — ham sonuçlar gösterildi",
      crMetaErr: "Endeks verileri alınamadı: ",
      metaAnalyst: "Analist: ", metaRefPre: "Hakem (", metaRagOff: "RAG: kapalı (kullanıcı tercihi)",
      metaSelfCorrect: "♻ Öz-düzeltme: ", metaRounds: " tur (",
      upUploading: " KB — yükleniyor…", upIndexedA: " KB — indekslendi (", upChunkSuffix: " chunk)",
      upError: "hata: ", upRejected: "reddedildi: ",
      removeFileAria: " dosyasını listeden çıkar", removeHoldingAria: " varlığını çıkar",
      archiveDelConfirm: " arşivden kalıcı olarak silinecek. Emin misin?",
      wordNoPreview: "Word belgeleri tarayıcıda önizlenemez. ", wordDownload: "Belgeyi indir",
      bkDownloaded: "Yedek indirildi ✓ (güvenli bir yerde sakla).",
      bkNotJson: "Dosya okunamadı — geçerli bir JSON değil.",
      bkNotBackup: "Bu bir FinDatalytix yedeği değil.",
      bkNoData: "Yedekte tanınan veri yok.",
      bkOverwrite: "Bu yedek, mevcut portföy/izleme listesi/tercihlerinin ÜZERİNE yazacak. Devam edilsin mi?",
      bkWriteFail: "Yazılamadı (tarayıcı izni?).",
      bkImported: "İçe aktarıldı ✓ — sayfa yenileniyor…",
      bkReadFail: "Dosya okunamadı."
    },
    auth: {
      login: "Giriş yap", signup: "Kayıt ol", logout: "Çıkış",
      email: "E-posta", password: "Şifre (en az 6 karakter)",
      loginTitle: "Giriş yap", signupTitle: "Hesap oluştur",
      noAccount: "Hesabın yok mu?", haveAccount: "Zaten üye misin?",
      wait: "Bekle…", confirmLogout: "Çıkış yapılsın mı?",
      err: "Olmadı: ", signupOk: "Hesap oluşturuldu, giriş yapıldı ✓",
      checkEmail: "E-postana doğrulama linki gönderildi — onayla, sonra giriş yap."
    },
    tbl: { symbol: "Sembol", price: "Fiyat", change: "Değişim", trend7: "7 Günlük Trend", sharpe: "Sharpe" },
    ov: {
      note: "Bu sayfadaki her kart ve tablo gerçek veriden beslenir.",
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
      note: "Kurlar, emtia ve endeksler Yahoo Finance'ten canlı çekilir; sayfa açıkken 60 saniyede bir tazelenir.",
      title: "Canlı Piyasa Tahtası", instrument: "Enstrüman"
    },
    pf: {
      note: "Kendi varlıklarını gir (adet + alış fiyatı); güncel piyasa fiyatıyla anlık değer ve kâr/zararını hesaplar. Veriler yalnızca senin tarayıcında saklanır.",
      totalValue: "Toplam Değer", totalValueNote: "güncel piyasa fiyatıyla", totalValuePending: "* bazı fiyatlar bekleniyor",
      totalCost: "Toplam Maliyet", totalCostNote: "alış tutarların",
      pnl: "Toplam Kâr / Zarar", count: "Varlık Sayısı", countNote: "portföydeki satır",
      addTitle: "Varlık Ekle", phSym: "Sembol (örn: THYAO, AAPL)", phQty: "Adet", phCost: "Alış fiyatı",
      mine: "Varlıklarım", qty: "Adet", buy: "Alış", current: "Güncel", value: "Değer", pnlShort: "K/Z",
      empty: "Henüz varlık eklenmedi — yukarıdan sembol, adet ve alış fiyatı ekle."
    },
    sim: {
      emptyTitle: "Henüz simülasyon çalıştırılmadı",
      emptyBody: "Örn: \"THYAO ile AAPL'ı karşılaştır\" yaz ve gönder — her varlık için 2.000 yollu Monte Carlo koşulur, sonuçlar burada belirir.",
      fanAy: "Ay", fanMedian: "Medyan",
      fanInner: "%50 bant", fanOuter: "%80 bant",
      fanNa: "Grafik için simülasyonu yeniden çalıştır.",
      metricRows: { cagr: "Yıllık Getiri (CAGR, %)", vol: "Volatilite (σ, %)", sharpe: "Sharpe Oranı", mdd: "Maks. Düşüş (MDD)" },
      ragTitle: "RAG Referans Kaynakları", ragUse: "simülasyonda kullan",
      aiTitle: "AI Analiz Yorumu — analist + hakem",
      aiIntro: "Motor hazır. Bir karşılaştırma isteği gönder — sonuç kartları, yelpaze grafikleri ve analist + hakem yorumu bu panele düşer.",
      ragEmpty: "Henüz belge yüklenmedi — Vektör Veri Tabanı sayfasından PDF/Word ekle.",
      ragErr: "Belge listesi alınamadı (sunucu çalışıyor mu?)",
      ragLoading: "Belgeler yükleniyor…",
      ragSrcLabel: "RAG kaynakları: ",
      reportTitle: "Risk Raporu Üret", reportHint: "Word (.docx) formatında, RAG kaynaklı teknik risk raporu."
    },
    vdb: {
      note: "RAG boru hattı aktif: yüklediğin PDF/Word dosyaları ChromaDB'de vektörlenir ve aranabilir hale gelir.",
      lowSim: "düşük benzerlik",
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
      ph: "Örn: THYAO, XU030, AAPL, BTC, ETH…",
      last: "Son Fiyat", range: "52 Hafta Aralığı", rangeNote: "düşük — yüksek",
      vol: "Yıllık Volatilite", volNote: "günlük getirilerden", rsi: "RSI (14)",
      chartTitle: "Fiyat Grafiği", liveTag: "canlı", noLive: "anlık fiyat yok",
      dailyPct: "% günlük", noData: "yetersiz veri",
      rsiOver: "aşırı alım bölgesi", rsiUnder: "aşırı satım bölgesi", rsiNeutral: "nötr bölge",
      lastYear: "son 1 yıl", tradingDays: "işlem günü"
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
      note: "Tema ve dil tercihlerin tarayıcı hafızasına (localStorage) kaydedilir; sayfayı yenilesen de seçimin kalır.",
      appearance: "Görünüm", theme: "Tema", themeDim: "Loş", themeBlack: "Siyah", themeLight: "Beyaz",
      lang: "Dil", dataTitle: "Veri Yönetimi (Yedek)",
      dataNote: "Portföyün, izleme listen ve tercihlerin yalnızca bu tarayıcıda saklanır. Tarayıcı verisini temizlersen kaybolur — düzenli olarak dışa aktar (yedekle).",
      export: "Dışa Aktar (JSON indir)", import: "İçe Aktar (yedek yükle)"
    },
    nw: {
      note: "Başlıklar Google News RSS'ten gelir (10 dk önbellek); üst şerit canlı piyasa verisidir. Habere tıklayınca kaynağında açılır.",
      cats: { piyasalar: "Piyasalar", kripto: "Kripto", sirketler: "Şirketler",
              makro: "Makro", dunya: "Dünya" },
      empty: "Haber yüklenemedi — birazdan tekrar dene.",
      loading: "Haberler yükleniyor…",
      now: "az önce", minAgo: " dk önce", hrAgo: " sa önce", yesterday: "dün",
      srcTip: "Haberi kaynağında aç"
    },
    prov: { title: "Kaynak Belge",
      missing: "Belge dosyası sunucuda yok — bu belge önizleme özelliğinden ÖNCE yüklenmiş. Vektör Veri Tabanı'ndan silip yeniden yüklersen kaynak önizlemesi çalışır." },
    cr: {
      note: "Fiyatlar Binance'ten WebSocket ile saniyelik akar — veri sunucuya uğramadan doğrudan tarayıcına gelir. Endeks kartları dakikalık tazelenir.",
      board: "Canlı Kripto Tahtası",
      fng: "Korku & Açgözlülük", fngNote: "alternative.me endeksi",
      dom: "BTC Hakimiyeti", domNote: "toplam piyasadaki payı",
      mcap: "Toplam Piyasa", mcapNote: "tüm kripto (CoinGecko)",
      conn: "Veri Akışı", connLive: "Canlı", connOff: "Koptu", connWait: "Bağlanıyor…",
      connNote: "Binance WebSocket",
      coin: "Coin", price: "Fiyat (USDT)", chg: "24s Değişim", vol: "24s Hacim",
      empty: "Bağlantı bekleniyor…",
      tipRow: "Teknik analize git — RSI + MACD grafiği",
      fngClass: { "Extreme Fear": "Aşırı Korku", "Fear": "Korku", "Neutral": "Nötr",
                  "Greed": "Açgözlülük", "Extreme Greed": "Aşırı Açgözlülük" }
    },
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
      errNoData: "veri bulunamadı", noPrice: "fiyat yok",
      symLen: "Sembol 2-12 karakter olmalı", symDup: "Bu sembol zaten listede",
      wlFull: "Liste dolu (en fazla 15 sembol)",
      qtyPos: "Adet pozitif bir sayı olmalı", costPos: "Alış fiyatı pozitif bir sayı olmalı",
      pfFull: "Portföy dolu (en fazla 50 satır)",
      fmtBad: "veri biçimi tanınmadı (backend sürümünü güncelle)",
      httpErr: "Sunucu hatası: HTTP ", timeout: "İstek zaman aşımına uğradı", secUnit: " sn",
      noServer: "Sunucuya ulaşılamadı. Backend çalışıyor mu? ",
      upBadType: "desteklenmeyen tür", upTooBig: " MB sınırı aşıldı",
      upDupName: "aynı isimde dosya zaten listede", errFetch: "veri alınamadı",
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
    views: { overview: "Overview", markets: "Markets", crypto: "Crypto", news: "News", portfolio: "Portfolio",
             simulation: "Create Simulation",
             vectordb: "Vector Database", assets: "Asset Analysis",
             report: "Risk Report", config: "Configuration", settings: "Settings" },
    status: { system: "System Status", db: "Vector Database",
              cycle: "Weekly Simulation Cycle" },
    sys: { ready: "Ready", running: "Simulation Running",
           reporting: "Generating Report", offline: "Server Unreachable",
           dbOffline: "No connection", doc: "documents", chunk: "chunks" },
    ui: { live: "LIVE", loading: "Loading data…", loadingShort: "Loading…",
          serverDown: "Couldn't load data — is the backend running?",
          wlEmpty: "List is empty — add a symbol above (e.g. THYAO, NVDA, BTC-USD).",
          rpEmpty: "No reports yet — run a simulation, then hit \"Generate Report\".",
          histEmpty: "No simulations yet — start from the Create Simulation page." },
    dyn: {
      simErrSuffix: " — you can edit the prompt and resend.",
      simRunning: "Monte Carlo is running and the AI is analyzing… this may take a few seconds.",
      calcTitle: "Calculating…", calcBody: "Running 2,000-path Monte Carlo, preparing the AI commentary.",
      btnGenerating: "Generating…", btnReady: "Report Ready ✓", btnRetry: "Error — try again",
      aiTemplate: "Template mode — real AI activates once an API key (e.g. a free GROQ_API_KEY) is added to .env",
      aiErrShown: "AI error — raw results shown",
      crMetaErr: "Couldn't load index data: ",
      metaAnalyst: "Analyst: ", metaRefPre: "Referee (", metaRagOff: "RAG: off (user preference)",
      metaSelfCorrect: "♻ Self-correction: ", metaRounds: " rounds (",
      upUploading: " KB — uploading…", upIndexedA: " KB — indexed (", upChunkSuffix: " chunks)",
      upError: "error: ", upRejected: "rejected: ",
      removeFileAria: " — remove from list", removeHoldingAria: " — remove holding",
      archiveDelConfirm: " will be permanently deleted from the archive. Are you sure?",
      wordNoPreview: "Word documents can't be previewed in the browser. ", wordDownload: "Download the document",
      bkDownloaded: "Backup downloaded ✓ (keep it somewhere safe).",
      bkNotJson: "Couldn't read the file — not valid JSON.",
      bkNotBackup: "This isn't a FinDatalytix backup.",
      bkNoData: "No recognized data in the backup.",
      bkOverwrite: "This backup will OVERWRITE your current portfolio/watchlist/preferences. Continue?",
      bkWriteFail: "Couldn't write (browser permission?).",
      bkImported: "Imported ✓ — reloading…",
      bkReadFail: "Couldn't read the file."
    },
    auth: {
      login: "Sign in", signup: "Sign up", logout: "Sign out",
      email: "Email", password: "Password (min 6 chars)",
      loginTitle: "Sign in", signupTitle: "Create account",
      noAccount: "No account yet?", haveAccount: "Already a member?",
      wait: "Please wait…", confirmLogout: "Sign out?",
      err: "Failed: ", signupOk: "Account created, signed in ✓",
      checkEmail: "A confirmation link was sent to your email — confirm, then sign in."
    },
    tbl: { symbol: "Symbol", price: "Price", change: "Change", trend7: "7-Day Trend", sharpe: "Sharpe" },
    ov: {
      note: "Every card and table on this page is backed by real data.",
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
      note: "Rates, commodities and indices are pulled live from Yahoo Finance; refreshes every 60 seconds while the page is open.",
      title: "Live Market Board", instrument: "Instrument"
    },
    pf: {
      note: "Enter your own holdings (quantity + buy price); it computes live value and profit/loss at current market prices. Data is stored only in your browser.",
      totalValue: "Total Value", totalValueNote: "at current market price", totalValuePending: "* some prices pending",
      totalCost: "Total Cost", totalCostNote: "your purchase totals",
      pnl: "Total Profit / Loss", count: "Holdings", countNote: "rows in portfolio",
      addTitle: "Add Holding", phSym: "Symbol (e.g. THYAO, AAPL)", phQty: "Quantity", phCost: "Buy price",
      mine: "My Holdings", qty: "Qty", buy: "Buy", current: "Current", value: "Value", pnlShort: "P/L",
      empty: "No holdings yet — add a symbol, quantity and buy price above."
    },
    sim: {
      emptyTitle: "No simulation has been run yet",
      emptyBody: "Try \"compare THYAO with AAPL\" — a 2,000-path Monte Carlo runs per asset and the results appear here.",
      fanAy: "Month", fanMedian: "Median",
      fanInner: "50% band", fanOuter: "80% band",
      fanNa: "Re-run the simulation to draw the chart.",
      metricRows: { cagr: "Annual Return (CAGR, %)", vol: "Volatility (σ, %)", sharpe: "Sharpe Ratio", mdd: "Max Drawdown (MDD)" },
      ragTitle: "RAG Reference Sources", ragUse: "use in simulation",
      aiTitle: "AI Commentary — analyst + referee",
      aiIntro: "Engine ready. Send a comparison request — result cards, fan charts and the analyst + referee commentary appear in this panel.",
      ragEmpty: "No documents yet — add a PDF/Word from the Vector Database page.",
      ragErr: "Couldn't load the document list (is the server running?)",
      ragLoading: "Loading documents…",
      ragSrcLabel: "RAG sources: ",
      reportTitle: "Generate Risk Report", reportHint: "A RAG-sourced technical risk report in Word (.docx) format."
    },
    vdb: {
      note: "RAG pipeline active: the PDF/Word files you upload are vectorized in ChromaDB and become searchable.",
      lowSim: "low similarity",
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
      ph: "e.g. THYAO, XU030, AAPL, BTC, ETH…",
      last: "Last Price", range: "52-Week Range", rangeNote: "low — high",
      vol: "Annual Volatility", volNote: "from daily returns", rsi: "RSI (14)",
      chartTitle: "Price Chart", liveTag: "live", noLive: "no live price",
      dailyPct: "% daily", noData: "insufficient data",
      rsiOver: "overbought zone", rsiUnder: "oversold zone", rsiNeutral: "neutral zone",
      lastYear: "last 1 year", tradingDays: "trading days"
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
      note: "Your theme and language preferences are saved to browser storage (localStorage); they persist across reloads.",
      appearance: "Appearance", theme: "Theme", themeDim: "Dim", themeBlack: "Black", themeLight: "White",
      lang: "Language", dataTitle: "Data Management (Backup)",
      dataNote: "Your portfolio, watchlist and preferences are stored only in this browser. If you clear browser data they are lost — export (back up) regularly.",
      export: "Export (download JSON)", import: "Import (load backup)"
    },
    nw: {
      note: "Headlines come from Google News RSS (10-min cache); the top strip is live market data. Clicking a story opens the source site.",
      cats: { piyasalar: "Markets", kripto: "Crypto", sirketler: "Companies",
              makro: "Macro", dunya: "World" },
      empty: "Couldn't load news — try again shortly.",
      loading: "Loading news…",
      now: "just now", minAgo: "m ago", hrAgo: "h ago", yesterday: "yesterday",
      srcTip: "Open at the source"
    },
    prov: { title: "Source Document",
      missing: "The document file isn't on the server — it was uploaded BEFORE the preview feature. Delete it from the Vector Database and re-upload to enable source preview." },
    cr: {
      note: "Prices stream from Binance via WebSocket every second — data flows straight to your browser, no server hop. Index cards refresh every minute.",
      board: "Live Crypto Board",
      fng: "Fear & Greed", fngNote: "alternative.me index",
      dom: "BTC Dominance", domNote: "share of total market",
      mcap: "Total Market Cap", mcapNote: "all crypto (CoinGecko)",
      conn: "Data Feed", connLive: "Live", connOff: "Disconnected", connWait: "Connecting…",
      connNote: "Binance WebSocket",
      coin: "Coin", price: "Price (USDT)", chg: "24h Change", vol: "24h Volume",
      empty: "Waiting for connection…",
      tipRow: "Open technical analysis — RSI + MACD chart",
      fngClass: { "Extreme Fear": "Extreme Fear", "Fear": "Fear", "Neutral": "Neutral",
                  "Greed": "Greed", "Extreme Greed": "Extreme Greed" }
    },
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
      errNoData: "no data", noPrice: "no price",
      symLen: "Symbol must be 2-12 characters", symDup: "This symbol is already in the list",
      wlFull: "List is full (max 15 symbols)",
      qtyPos: "Quantity must be a positive number", costPos: "Buy price must be a positive number",
      pfFull: "Portfolio is full (max 50 rows)",
      fmtBad: "unrecognized data format (update the backend)",
      httpErr: "Server error: HTTP ", timeout: "Request timed out", secUnit: " s",
      noServer: "Couldn't reach the server. Is the backend running? ",
      upBadType: "unsupported type", upTooBig: " MB limit exceeded",
      upDupName: "a file with the same name is already listed", errFetch: "couldn't fetch data",
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
