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

  const initialState = {
    view: "simulation",
    params: {},                       // örn: { symbol: "THYAO" }

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

    history: { items: [], totalRuns: null, error: null },

    asset: { status: "idle", error: null, symbol: null, data: null },

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
      if (!res.ok) throw new Error("Sunucu hatası: HTTP " + res.status);
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
        body: { prompt }
      });
      s.set({
        simulation: {
          status: "done",
          error: null,
          prompt: prompt,
          metrics: data.metrics,
          aiText: data.aiText,
          aiMeta: data.aiMeta || null,
          dataSources: data.dataSources || {}
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
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), C.timeoutMs);
    try {
      // Binary indirme: request() JSON bekler, burada blob gerekiyor
      const res = await fetch(C.baseUrl + "/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: sim.prompt || "",
          metrics: sim.metrics,
          dataSources: sim.dataSources || {},
          aiText: sim.aiText || "",
          aiMeta: sim.aiMeta || {}
        }),
        signal: ctrl.signal
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
      clearTimeout(timer);
      const msg = err.name === "AbortError" ? "İstek zaman aşımına uğradı." : err.message;
      s.set({ report: { status: "error", error: msg } });
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
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 120000); // 120 sec timeout
      try {
        const form = new FormData();
        form.append("file", f);
        const res = await fetch(FDX.CONFIG.api.baseUrl + "/documents",
                                { method: "POST", body: form, signal: ctrl.signal });
        clearTimeout(timer);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || ("HTTP " + res.status));
        patchFile(f.name, { status: "indexed", chunks: data.chunks });
        refreshVectorStats();
      } catch (err) {
        clearTimeout(timer);
        const msg = err.name === "AbortError" ? "Zaman aşımı (dosya büyük olabilir)" : err.message;
        patchFile(f.name, { status: "error", reason: msg });
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
      s.set({ history: { items: data.items, totalRuns: data.totalRuns, error: null } });
    } catch (err) {
      s.set({ history: { items: [], totalRuns: null, error: err.message } });
    }
  }

  async function fetchAsset(symbol) {
    const s = FDX.store;
    s.set({ asset: { status: "loading", error: null, symbol, data: null } });
    try {
      const data = await request("/asset/" + encodeURIComponent(symbol));
      s.set({ asset: { status: "done", error: null, symbol, data } });
    } catch (err) {
      s.set({ asset: { status: "error", error: err.message, symbol, data: null } });
    }
  }

  FDX.api = { runSimulation, generateReport, addFiles, removeFile,
              refreshVectorStats, queryDocs, refreshHistory, fetchAsset };
})();
