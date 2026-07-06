/* ==========================================================
   FinDatalytix — core.js
   FDX.store  → Single Source of Truth (durum artık DOM'da değil)
   FDX.router → parametre destekli hash router (#assets?symbol=THYAO)
   FDX.api    → fetch + timeout + try/catch; mock adaptörlü
   Hepsi IIFE içinde: global scope'a yalnızca FDX sızar.
   ========================================================== */

"use strict";

/* ----------------------------------------------------------
   STORE — küçük ama gerçek bir state yönetimi
---------------------------------------------------------- */
(function () {

  const WATCH_KEY = "fdx-watchlist";
  const WATCH_DEFAULTS = ["XU100.IS", "THYAO.IS", "AAPL", "BTC-USD"];
  const WATCH_MAX = 15;

  function _loadWatchSymbols() {
    try {
      const raw = JSON.parse(localStorage.getItem(WATCH_KEY));
      if (Array.isArray(raw) && raw.length) return raw.slice(0, WATCH_MAX);
    } catch (e) { /* bozuk kayıt → varsayılan */ }
    return WATCH_DEFAULTS.slice();
  }

  function _loadUseRag() {
    try { return localStorage.getItem("fdx-userag") !== "0"; }
    catch (e) { return true; }
  }

  const initialState = {
    view: "simulation",
    params: {},                       // örn: { symbol: "THYAO" }
    useRag: _loadUseRag(),            // simülasyonda doküman bağlamı kullanılsın mı

    simulation: {
      status: "idle",                 // idle | running | done | error
      error: null,
      metrics: FDX.SEED.metrics,
      aiText: ""
    },

    report: {
      status: "idle",                 // idle | generating | ready | error
      error: null
    },

    history: { items: [], totalRuns: null, weeklyRuns: null, weeklyLimit: 600, error: null },

    asset: { status: "idle", symbol: null, data: null, error: null },

    aiStatus: null,   // GET /api/ai/status cevabı (Konfigürasyon sayfası)
    settings: { data: null, status: "idle", error: null, warning: null },

    watchlist: {
      symbols: _loadWatchSymbols(),
      quotes: {},          // sembol -> kotasyon
      status: "idle",
      error: null
    },

    vectordb: {
      files: [],        // { name, sizeKB, ext, status, reason, chunks }
      stats: null,      // GET /api/documents cevabı
      statsError: null,
      queryStatus: "idle",
      queryResults: null,
      queryError: null
    }
  };

  let state = structuredClone(initialState);
  const subscribers = new Set();

  function get() { return state; }

  /* Sığ birleştirme; iç objeler çağıran tarafından yeni obje
     olarak verilir: set({ report: { ...get().report, status:"ready" } }) */
  function set(patch) {
    state = Object.assign({}, state, patch);
    subscribers.forEach(fn => fn(state));
  }

  function subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }

  FDX.store = { get, set, subscribe };
})();

/* ----------------------------------------------------------
   ROUTER — "#view?key=val&key2=val2" biçimini anlar
---------------------------------------------------------- */
(function () {

  // "watchlist" ayri bir sayfa DEGIL (izleme listesi overview icinde yasar);
  // KNOWN'da tutmak #watchlist'te bos sayfa + "undefined" baslik uretiyordu.
  const KNOWN = ["overview", "simulation", "vectordb", "assets", "report", "config", "settings"];
  const DEFAULT = "simulation";

  function parse(hash) {
    const raw = (hash || "").replace(/^#/, "");
    const [viewPart, queryPart] = raw.split("?");
    const view = KNOWN.includes(viewPart) ? viewPart : DEFAULT;
    const params = {};
    if (queryPart) {
      new URLSearchParams(queryPart).forEach((v, k) => { params[k] = v; });
    }
    return { view, params };
  }

  function navigate(view, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const hash = "#" + view + (qs ? "?" + qs : "");
    if (location.hash !== hash) {
      // hashchange dinleyicisi store'u güncelleyecek
      location.hash = hash;
    } else {
      FDX.store.set(parse(hash));
    }
  }

  function start() {
    window.addEventListener("hashchange", () => {
      FDX.store.set(parse(location.hash));
    });
    FDX.store.set(parse(location.hash)); // ilk yükleme
  }

  FDX.router = { navigate, start, parse };
})();

/* ----------------------------------------------------------
   API — asenkron altyapı bugünden hazır
   useMock=true iken sahte veri döner ama akış (loading,
   hata, timeout) birebir gerçek fetch gibi işler.
---------------------------------------------------------- */
(function () {

  const C = FDX.CONFIG.api;

  async function request(path, { method = "GET", body = null } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), C.timeoutMs);
    try {
      const res = await fetch(C.baseUrl + path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : null,
        signal: ctrl.signal
      });
      if (!res.ok) {
        let detail = "";
        try { detail = (await res.json()).detail || ""; } catch (e) {}
        throw new Error(detail || ("Sunucu hatası: HTTP " + res.status));
      }
      return await res.json();
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error("İstek zaman aşımına uğradı (" + C.timeoutMs / 1000 + " sn).");
      }
      if (err instanceof TypeError) {
        // fetch ağ hatası: sunucu kapalı / CORS / bağlantı yok
        throw new Error("Sunucuya ulaşılamadı. Backend çalışıyor mu? " +
          "(uvicorn main:app --port 8000)");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---- Uygulama eylemleri: state'i değiştiren tek yer ---- */

  async function runSimulation(prompt) {
    const s = FDX.store;
    s.set({ simulation: { ...s.get().simulation, status: "running", error: null } });
    try {
      const data = await request("/simulate", {
        method: "POST",
        body: { prompt, useRag: s.get().useRag }
      });
      s.set({
        simulation: {
          status: "done",
          error: null,
          prompt: prompt,
          metrics: data.metrics,
          aiText: data.aiText,
          aiMeta: data.aiMeta || null,
          dataSources: data.dataSources || {},
          quotes: data.quotes || {}          // canlı anlık fiyat (Uzmanpara gibi)
        }
      });
    } catch (err) {
      s.set({
        simulation: { ...s.get().simulation, status: "error", error: err.message }
      });
    }
  }

  async function generateReport() {
    const s = FDX.store;
    const sim = s.get().simulation;

    if (sim.status !== "done") {
      s.set({ report: { status: "error",
        error: "Once bir simulasyon calistir - rapor, ekrandaki sonuclardan uretilir." } });
      return;
    }

    s.set({ report: { status: "generating", error: null } });
    try {
      // Binary indirme: request() JSON bekler, burada blob gerekiyor.
      // AbortController: timeout aninda baglanti GERCEKTEN kesilir.
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), C.timeoutMs);
      const res = await fetch(C.baseUrl + "/report", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: sim.prompt || "",
          metrics: sim.metrics,
          dataSources: sim.dataSources || {},
          aiText: sim.aiText || "",
          aiMeta: sim.aiMeta || {}
        })
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error("Sunucu hatasi: HTTP " + res.status);

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : "risk-raporu.docx";

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      s.set({ report: { status: "ready", error: null } });
      setTimeout(() => {
        if (s.get().report.status === "ready") {
          s.set({ report: { status: "idle", error: null } });
        }
      }, 2400);
    } catch (err) {
      s.set({ report: { status: "error", error: err.message } });
    }
  }

  /* Dosya yükleme — doğrulama + GERÇEK backend indekslemesi */
  async function addFiles(fileList) {
    const { allowedExt, maxSizeMB } = FDX.CONFIG.upload;
    const s = FDX.store;

    for (const f of Array.from(fileList)) {
      const ext = "." + f.name.split(".").pop().toLowerCase();
      const existing = s.get().vectordb.files;

      let entry = { name: f.name, sizeKB: Math.round(f.size / 1024), ext,
                    status: "uploading", reason: "", chunks: 0 };

      if (!allowedExt.includes(ext)) {
        entry.status = "rejected"; entry.reason = "desteklenmeyen tür (" + ext + ")";
      } else if (f.size > maxSizeMB * 1024 * 1024) {
        entry.status = "rejected"; entry.reason = maxSizeMB + " MB sınırı aşıldı";
      } else if (existing.some(e => e.name === f.name)) {
        entry.status = "rejected"; entry.reason = "aynı isimde dosya zaten listede";
      }

      s.set({ vectordb: { ...s.get().vectordb, files: existing.concat([entry]) } });
      if (entry.status === "rejected") continue;

      // Gerçek yükleme: multipart/form-data (Content-Type'ı tarayıcı koyar)
      try {
        const form = new FormData();
        form.append("file", f);
        // Buyuk PDF indekslemesi uzun surebilir: cömert ama sonlu timeout
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 120000);
        const res = await fetch(FDX.CONFIG.api.baseUrl + "/documents",
                                { method: "POST", body: form, signal: ctrl.signal });
        clearTimeout(timer);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || ("HTTP " + res.status));
        patchFile(f.name, { status: "indexed", chunks: data.chunks });
        refreshVectorStats();
      } catch (err) {
        patchFile(f.name, { status: "error", reason: err.message });
      }
    }
  }

  function patchFile(name, patch) {
    const s = FDX.store;
    const files = s.get().vectordb.files.map(f =>
      f.name === name ? { ...f, ...patch } : f);
    s.set({ vectordb: { ...s.get().vectordb, files } });
  }

  async function removeFile(name) {
    const s = FDX.store;
    const file = s.get().vectordb.files.find(f => f.name === name);
    // İndekslenmişse backend'den de sil
    if (file && file.status === "indexed") {
      try {
        await request("/documents/" + encodeURIComponent(name), { method: "DELETE" });
      } catch (err) { /* liste yine de temizlensin */ }
    }
    s.set({ vectordb: { ...s.get().vectordb,
      files: s.get().vectordb.files.filter(f => f.name !== name) } });
    refreshVectorStats();
  }

  /* Vektör DB istatistikleri */
  async function refreshVectorStats() {
    const s = FDX.store;
    try {
      const stats = await request("/documents");
      s.set({ vectordb: { ...s.get().vectordb, stats, statsError: null } });
    } catch (err) {
      s.set({ vectordb: { ...s.get().vectordb, statsError: err.message } });
    }
  }

  /* RAG arama testi */
  async function queryDocs(question) {
    const s = FDX.store;
    s.set({ vectordb: { ...s.get().vectordb, queryStatus: "running", queryResults: null } });
    try {
      const data = await request("/query", { method: "POST", body: { question, top_k: 5 } });
      s.set({ vectordb: { ...s.get().vectordb,
        queryStatus: "done", queryResults: data.results } });
    } catch (err) {
      s.set({ vectordb: { ...s.get().vectordb,
        queryStatus: "error", queryResults: null, queryError: err.message } });
    }
  }

  /* Simulasyon gecmisi (Genel Bakis tablosu + dongu sayaci) */
  async function refreshHistory() {
    const s = FDX.store;
    try {
      const data = await request("/history");
      s.set({ history: { items: data.items, totalRuns: data.totalRuns,
                         weeklyRuns: data.weeklyRuns || 0,
                         weeklyLimit: data.weeklyLimit || 600, error: null } });
    } catch (err) {
      s.set({ history: { items: [], totalRuns: null, error: err.message } });
    }
  }

  /* Varlik Analizi (Ay 6) */
  async function fetchAsset(symbol) {
    const s = FDX.store;
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    s.set({ asset: { status: "loading", symbol: sym, data: null, error: null } });
    try {
      const data = await request("/asset/" + encodeURIComponent(sym));
      s.set({ asset: { status: "done", symbol: sym, data, error: null } });
    } catch (err) {
      s.set({ asset: { status: "error", symbol: sym, data: null, error: err.message } });
    }
  }

  /* ---- İzleme Listesi ---- */

  function _saveWatch(symbols) {
    try { localStorage.setItem("fdx-watchlist", JSON.stringify(symbols)); }
    catch (e) { /* private mod vb. — liste yine bellekte yaşar */ }
  }

  function addWatchSymbol(symbol) {
    const s = FDX.store;
    const sym = symbol.trim().toUpperCase();
    const w = s.get().watchlist;
    if (sym.length < 2 || sym.length > 12) return "Sembol 2-12 karakter olmali";
    if (w.symbols.includes(sym)) return "Bu sembol zaten listede";
    if (w.symbols.length >= 15) return "Liste dolu (en fazla 15 sembol)";
    const symbols = w.symbols.concat([sym]);
    _saveWatch(symbols);
    s.set({ watchlist: { ...w, symbols } });
    fetchWatchlist();
    return null;   // hata yok
  }

  function removeWatchSymbol(sym) {
    const s = FDX.store;
    const w = s.get().watchlist;
    const symbols = w.symbols.filter(x => x !== sym);
    const quotes = { ...w.quotes };
    delete quotes[sym];
    _saveWatch(symbols);
    s.set({ watchlist: { ...w, symbols, quotes } });
  }

  async function fetchWatchlist() {
    const s = FDX.store;
    const w = s.get().watchlist;
    if (!w.symbols.length) {
      s.set({ watchlist: { ...w, quotes: {}, status: "done", error: null } });
      return;
    }
    s.set({ watchlist: { ...s.get().watchlist, status: "loading" } });
    try {
      const data = await request("/watchlist?symbols=" +
                                 encodeURIComponent(w.symbols.join(",")));
      const quotes = {};
      // TOLERANSLI OKUYUCU: backend surumu ne dondururse dondursun
      // (last/price, spark/sparkline, changePct/change) tek bicime
      // normalize edilir; taninmayan bicim COKERTMEZ, rozetlenir.
      (data.quotes || []).forEach(raw => {
        const num = v => (typeof v === "number" && isFinite(v)) ? v : null;
        const q = {
          symbol: raw.symbol,
          resolved: raw.resolved || raw.symbol,
          error: raw.error || null,
          last: num(raw.last) !== null ? num(raw.last) : num(raw.price),
          changePct: num(raw.changePct) !== null ? num(raw.changePct) : num(raw.change),
          spark: Array.isArray(raw.spark) ? raw.spark
               : Array.isArray(raw.sparkline) ? raw.sparkline : []
        };
        if (!q.error && (q.last === null || q.spark.length < 2)) {
          q.error = "veri bicimi taninmadi (backend surumunu guncelle)";
        }
        quotes[q.symbol] = q;
      });
      s.set({ watchlist: { ...s.get().watchlist,
                           quotes, status: "done", error: null } });
    } catch (err) {
      s.set({ watchlist: { ...s.get().watchlist,
                           status: "error", error: err.message } });
    }
  }

  /* ---- Çalışma zamanı ayarları (Konfigürasyon) ---- */
  async function fetchSettings() {
    const s = FDX.store;
    try {
      const data = await request("/settings");
      s.set({ settings: { data, status: "done", error: null,
                          warning: data.warning || null } });
    } catch (err) {
      s.set({ settings: { data: null, status: "error", error: err.message, warning: null } });
    }
  }

  async function saveSettings(patch) {
    const s = FDX.store;
    s.set({ settings: { ...s.get().settings, status: "saving", error: null } });
    try {
      const data = await request("/settings", { method: "POST", body: patch });
      s.set({ settings: { data, status: "saved", error: null,
                          warning: data.warning || null } });
      refreshAiStatus();   // durum satırı da yeni rolleri göstersin
    } catch (err) {
      s.set({ settings: { ...s.get().settings, status: "error", error: err.message } });
    }
  }

  function setUseRag(on) {
    try { localStorage.setItem("fdx-userag", on ? "1" : "0"); } catch (e) {}
    FDX.store.set({ useRag: !!on });
  }

  async function refreshAiStatus() {
    const s = FDX.store;
    try {
      const data = await request("/ai/status");
      s.set({ aiStatus: data });
    } catch (err) {
      s.set({ aiStatus: { error: err.message } });
    }
  }

  FDX.api = { runSimulation, generateReport, addFiles, removeFile,
              refreshVectorStats, queryDocs, refreshHistory, fetchAsset,
              refreshAiStatus, fetchWatchlist, addWatchSymbol, removeWatchSymbol,
              fetchSettings, saveSettings, setUseRag };
})();
