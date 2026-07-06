/* ==========================================================
   FinDatalytix — app.js (UI katmanı)
   Akış tek yönlü: Etkileşim → FDX.api / FDX.router →
   FDX.store değişir → render(state) DOM'u günceller.
   DOM artık durum kaynağı DEĞİL, durumun yansımasıdır.
   ========================================================== */

"use strict";

(function () {

  /* ========================================================
     TERCIHLER (Ay 6.2) — tema + dil, localStorage kalici
  ======================================================== */
  const Prefs = {
    theme: localStorage.getItem("fdx-theme") || "dark",
    lang: localStorage.getItem("fdx-lang") || "tr",

    dict() { return FDX.I18N[this.lang] || FDX.I18N.tr; },

    setTheme(t) {
      this.theme = t;
      localStorage.setItem("fdx-theme", t);
      document.documentElement.dataset.theme = t;
      this.syncSegs();
    },

    setLang(l) {
      this.lang = l;
      localStorage.setItem("fdx-lang", l);
      this.applyLanguage();
      this.syncSegs();
    },

    applyLanguage() {
      const d = this.dict();
      document.querySelectorAll("[data-i18n]").forEach(el => {
        const path = el.dataset.i18n.split(".");
        let val = d;
        for (const k of path) val = val && val[k];
        if (val) {
          if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
            el.placeholder = val;
          } else {
            el.textContent = val;
          }
        }
      });
      document.querySelectorAll("[data-i18n-title]").forEach(el => {
        const path = el.dataset.i18nTitle.split(".");
        let val = d;
        for (const k of path) val = val && val[k];
        if (val) el.title = val;
      });
      const title = $("#viewTitle");
      const view = FDX.store.get().view;
      if (title && d.views[view]) title.textContent = d.views[view];
    },

    syncSegs() {
      $$("#themeSeg .seg-btn").forEach(b =>
        b.classList.toggle("active", b.dataset.themeOpt === this.theme));
      $$("#langSeg .seg-btn").forEach(b =>
        b.classList.toggle("active", b.dataset.langOpt === this.lang));
    },

    init() {
      document.documentElement.dataset.theme = this.theme;
      this.applyLanguage();
      this.syncSegs();
      $$("#themeSeg .seg-btn").forEach(b =>
        b.addEventListener("click", () => this.setTheme(b.dataset.themeOpt)));
      $$("#langSeg .seg-btn").forEach(b =>
        b.addEventListener("click", () => this.setLang(b.dataset.langOpt)));
    }
  };

  let introDone = false;
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  /* ========================================================
     GRAFİK MODÜLÜ — yaşam döngüsü yönetimli
  ======================================================== */
  const Charts = (function () {
    let instances = [];   // {chart}

    function volSurface({ baseVol, smile, termSlope, noise }) {
      const data = [];
      for (let m = 1; m <= 24; m++) {
        for (let k = 70; k <= 130; k += 2.5) {
          const s = smile * Math.pow((k - 100) / 30, 2);
          const t = termSlope * Math.sqrt(m);
          const w = noise * Math.sin(m * 0.9 + k * 0.11);
          data.push([m, k, +(baseVol + s * 22 - t + w).toFixed(2)]);
        }
      }
      return data;
    }

    function option(data) {
      const C = FDX.CONFIG.chart;
      const axis = name => ({
        type: "value", name,
        nameTextStyle: { color: "#9fb3d0", fontSize: 10 },
        axisLabel: { color: "#9fb3d0", fontSize: 8 },
        axisLine: { lineStyle: { color: "#3a4d6e" } }
      });
      return {
        tooltip: {},
        visualMap: {
          show: false, dimension: 2,
          min: C.volMin, max: C.volMax,
          inRange: { color: C.palette }
        },
        xAxis3D: axis("Vade (ay)"),
        yAxis3D: axis("Moneyness (%)"),
        zAxis3D: axis("Imp. Vol (%)"),
        grid3D: {
          boxWidth: 90, boxDepth: 90, boxHeight: 55,
          viewControl: {
            autoRotate: true,
            autoRotateSpeed: C.autoRotateSpeed,
            distance: C.distance, alpha: C.alpha, beta: C.beta
          },
          light: { main: { intensity: 1.3, shadow: false }, ambient: { intensity: 0.45 } },
          environment: "transparent",
          splitLine: { lineStyle: { color: "rgba(143,184,232,0.12)" } },
          axisPointer: { show: false }
        },
        series: [{
          type: "surface", shading: "color",
          wireframe: { show: true, lineStyle: { color: "rgba(10,17,32,0.35)", width: 0.5 } },
          data
        }]
      };
    }

    /* v0.9: her varligin yuzeyi kendi GERCEK volatilitesinden dogar.
       Kartlar DOM'a eklendikten SONRA cagrilir (0x0 tuzagi yok). */
    function renderFor(metrics) {
      dispose();
      Object.entries(metrics).forEach(([sym, m], i) => {
        const el = document.getElementById("chart-" + cssSafe(sym));
        if (!el || !window.echarts) return;
        const chart = echarts.init(el, null, { renderer: "canvas" });
        chart.setOption(option(volSurface({
          baseVol: (typeof m.vol === "number" && m.vol > 0) ? m.vol : 18,
          smile: 0.55 + (i % 3) * 0.15,
          termSlope: 0.8 - (i % 2) * 0.25,
          noise: 0.9 + i * 0.2
        })));
        instances.push({ chart });
      });
    }

    function setRotation(on) {
      instances.forEach(({ chart }) =>
        chart.setOption({ grid3D: { viewControl: { autoRotate: on } } }));
    }

    function resize() { instances.forEach(({ chart }) => chart.resize()); }

    function dispose() {
      instances.forEach(({ chart }) => chart.dispose());
      instances = [];
    }

    return { renderFor, setRotation, resize, dispose };
  })();

  const cssSafe = s => s.replace(/[^A-Za-z0-9]/g, "_");

  window.addEventListener("resize", Charts.resize);

  /* ========================================================
     VARLIK ANALIZI GRAFIGI — mum + RSI + MACD (2D ECharts)
  ======================================================== */
  const AssetChart = (function () {
    let chart = null;

    const AXIS_COLOR = "#3a4d6e", LABEL = "#9fb3d0";
    const UP = "#4ade80", DOWN = "#f87171", GOLDC = "#d9b36a", ICE = "#8fb8e8";

    function option(d) {
      const xAxis = i => ({
        type: "category", gridIndex: i, data: d.dates,
        axisLabel: { show: i === 2, color: LABEL, fontSize: 9 },
        axisLine: { lineStyle: { color: AXIS_COLOR } },
        axisTick: { show: false }
      });
      return {
        animation: false,
        backgroundColor: "transparent",
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "cross" },
          backgroundColor: "#111c31", borderColor: AXIS_COLOR,
          textStyle: { color: "#dbe6f5", fontSize: 11 }
        },
        axisPointer: { link: [{ xAxisIndex: "all" }] },
        grid: [
          { left: 58, right: 16, top: 14, height: "46%" },
          { left: 58, right: 16, top: "62%", height: "12%" },
          { left: 58, right: 16, top: "79%", height: "12%" }
        ],
        xAxis: [xAxis(0), xAxis(1), xAxis(2)],
        yAxis: [
          { gridIndex: 0, scale: true,
            axisLabel: { color: LABEL, fontSize: 9 },
            splitLine: { lineStyle: { color: "rgba(143,184,232,0.08)" } } },
          { gridIndex: 1, min: 0, max: 100, interval: 35,
            axisLabel: { color: LABEL, fontSize: 8 }, splitLine: { show: false } },
          { gridIndex: 2, axisLabel: { color: LABEL, fontSize: 8 },
            splitLine: { show: false } }
        ],
        dataZoom: [
          { type: "inside", xAxisIndex: [0, 1, 2], start: 55, end: 100 },
          { type: "slider", xAxisIndex: [0, 1, 2], bottom: 2, height: 15,
            borderColor: AXIS_COLOR, backgroundColor: "rgba(17,28,49,0.6)",
            fillerColor: "rgba(217,179,106,0.15)",
            handleStyle: { color: GOLDC }, textStyle: { color: LABEL, fontSize: 8 } }
        ],
        series: [
          { name: "Fiyat", type: "candlestick", data: d.ohlc,
            itemStyle: { color: UP, color0: DOWN,
                         borderColor: UP, borderColor0: DOWN } },
          { name: "RSI", type: "line", xAxisIndex: 1, yAxisIndex: 1,
            data: d.rsi, showSymbol: false,
            lineStyle: { width: 1.4, color: GOLDC },
            markLine: { silent: true, symbol: "none", label: { show: false },
              lineStyle: { color: "rgba(248,113,113,0.45)", type: "dashed" },
              data: [{ yAxis: 30 }, { yAxis: 70 }] } },
          { name: "MACD Hist", type: "bar", xAxisIndex: 2, yAxisIndex: 2,
            data: d.macd.hist,
            itemStyle: { color: p => (p.value >= 0 ? UP : DOWN) } },
          { name: "MACD", type: "line", xAxisIndex: 2, yAxisIndex: 2,
            data: d.macd.line, showSymbol: false,
            lineStyle: { width: 1.2, color: ICE } },
          { name: "Sinyal", type: "line", xAxisIndex: 2, yAxisIndex: 2,
            data: d.macd.signal, showSymbol: false,
            lineStyle: { width: 1.2, color: GOLDC } }
        ]
      };
    }

    function show(data) {
      const el = $("#assetChart");
      if (!el || !window.echarts) return;
      if (!chart) {
        chart = echarts.init(el, null, { renderer: "canvas" });
        window.addEventListener("resize", () => chart && chart.resize());
      }
      chart.setOption(option(data), { notMerge: true });
      chart.resize();
    }

    return { show };
  })();

  /* ========================================================
     ANİMASYON YARDIMCILARI
  ======================================================== */

  const trNumber = (v, decimals = 2) =>
    v.toLocaleString("tr-TR", { minimumFractionDigits: decimals,
                                maximumFractionDigits: decimals });

  function animateNumber(el, target, suffix = "", duration = 1200, decimals = 2) {
    const start = performance.now();
    (function frame(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = trNumber(target * eased, decimals) + suffix;
      if (t < 1) requestAnimationFrame(frame);
    })(performance.now());
  }

  let aiTimer = null;
  function typeInto(el, text, speed, onDone) {
    if (aiTimer) clearInterval(aiTimer);
    let i = 0;
    el.textContent = "";
    aiTimer = setInterval(() => {
      el.textContent = text.slice(0, ++i);
      if (i >= text.length) {
        clearInterval(aiTimer);
        aiTimer = null;
        if (onDone) onDone();
      }
    }, speed);
  }

  /* ========================================================
     RENDER — state'ten DOM'a tek yön
  ======================================================== */

  let prev = {};   // gereksiz DOM işlemini önlemek için önceki state
  let viewFetched = null;   // hangi view icin veri cekildi (re-entrancy dongu korumasi)

  function render(state) {

    /* ---- View geçişi ---- */
    if (state.view !== prev.view) {
      $$(".view").forEach(v =>
        v.classList.toggle("active", v.id === "view-" + state.view));
      $$(".nav-item").forEach(btn => {
        const on = btn.dataset.view === state.view;
        btn.classList.toggle("active", on);
        btn.setAttribute("aria-current", on ? "page" : "false");
      });
      $("#viewTitle").textContent = Prefs.dict().views[state.view];

      const inSim = state.view === "simulation";
      if (inSim && !introDone) {
        introDone = true;
        runSimIntro();
      }
      Charts.setRotation(inSim);
      if (inSim) Charts.resize();

      // Veri getirme yalniz view GERCEKTEN degisince TEK kez calissin.
      // refreshHistory/refreshVectorStats vb. store.set yapip render'i
      // yeniden tetikliyor; bu guard olmadan sonsuz dongu olusuyordu
      // (57 bin /api/history cagrisinin sebebi buydu).
      if (viewFetched !== state.view) {
        viewFetched = state.view;

        if (state.view === "vectordb") FDX.api.refreshVectorStats();
        if (state.view === "overview") {
          FDX.api.refreshHistory();
          FDX.api.fetchWatchlist();   // izleme listesi overview sayfasinda
          WatchPoller.start();
        } else {
          WatchPoller.stop();
        }
        if (state.view === "config") {
          FDX.api.refreshAiStatus();
          FDX.api.fetchSettings();
        }
      }

      if (state.view === "assets") {
        if (state.params && state.params.symbol) {
          const sym = state.params.symbol.toUpperCase();
          const a = state.asset;
          if (a.symbol !== sym || (a.status !== "done" && a.status !== "loading")) {
            const input = $("#assetInput");
            if (input) input.value = sym;
            FDX.api.fetchAsset(sym);
          }
        } else if (!state.asset.symbol) {
          // Varsayılan grafik
          FDX.router.navigate("assets", { symbol: "THYAO.IS" });
        }
      }
    }

    /* ---- Simülasyon durumu ---- */
    if (state.simulation !== prev.simulation) {
      const sim = state.simulation;
      const btn = $("#sendBtn");
      btn.classList.toggle("busy", sim.status === "running");
      btn.disabled = sim.status === "running";

      const errBox = $("#aiError");
      if (sim.status === "error") {
        errBox.hidden = false;
        errBox.textContent = Prefs.dict().app.errSim + sim.error +
          " — Prompt'u düzenleyip tekrar gönderebilirsin.";
      } else {
        errBox.hidden = true;
      }

      if (sim.status === "done" && prev.simulation && prev.simulation.status === "running") {
        FDX.api.refreshHistory();
        renderSimCards(sim.metrics);          // kartlar once DOM'a
        Charts.renderFor(sim.metrics);        // sonra yuzeyler
        $("#aiCursor").classList.remove("done");
        typeInto($("#aiText"), sim.aiText, FDX.CONFIG.typing.aiMs,
          () => { $("#aiCursor").classList.add("done"); renderAiMeta(sim.aiMeta); });
        $("#aiMeta").hidden = true;
      }
    }

    /* ---- Rapor durumu ---- */
    if (state.report !== prev.report) {
      const rep = state.report;
      const btn = $("#reportBtn");
      const label = btn.querySelector(".report-btn-label");
      btn.classList.toggle("loading", rep.status === "generating");
      btn.disabled = rep.status === "generating";
      label.textContent =
        rep.status === "generating" ? "Oluşturuluyor…" :
        rep.status === "ready"      ? "Rapor Hazır ✓" :
        rep.status === "error"      ? "Hata — tekrar dene" :
                                      Prefs.dict().app.btnReport;
      btn.classList.toggle("error", rep.status === "error");
      btn.title = rep.status === "error" ? rep.error : "";
    }

    /* ---- Vektör DB: dosyalar + istatistik + sorgu ---- */
    if (state.vectordb !== prev.vectordb) {
      renderFileList(state.vectordb.files);
      renderVectorStats(state.vectordb);
      renderQuery(state.vectordb);
      renderRagChips(state.vectordb);
    }

    /* ---- Simulasyon gecmisi + dongu sayaci ---- */
    if (state.history !== prev.history) {
      renderHistory(state.history);
    }

    /* ---- Varlik Analizi ---- */
    if (state.asset !== prev.asset) {
      renderAsset(state.asset);
    }

    /* ---- Konfigurasyon: AI durumu ---- */
    if (state.aiStatus !== prev.aiStatus) {
      renderAiStatus(state.aiStatus);
    }

    /* ---- Ayarlar (Konfigurasyon formu) ---- */
    if (state.settings !== prev.settings) {
      renderSettings(state.settings);
    }

    /* ---- Izleme Listesi ---- */
    if (state.watchlist !== prev.watchlist) {
      renderWatchlist(state.watchlist,
                      prev.watchlist ? prev.watchlist.quotes : {});
    }

    renderStatusBar(state);   // ucuz islem, her degisimde tazelenir

    prev = state;
  }

  function renderAsset(a) {
    const btn = $("#assetBtn");
    const err = $("#assetError");
    const summary = $("#assetSummary");
    const wrap = $("#assetChartWrap");
    if (!btn) return;

    btn.disabled = a.status === "loading";
    btn.querySelector(".report-btn-label").textContent =
      a.status === "loading" ? Prefs.dict().app.btnAnalyzing : Prefs.dict().app.btnAnalyze;
    btn.classList.toggle("loading", a.status === "loading");

    if (a.status === "error") {
      err.hidden = false;
      err.textContent = a.error;
      summary.hidden = true;
      wrap.hidden = true;
      return;
    }
    err.hidden = true;

    if (a.status !== "done" || !a.data) return;

    const d = a.data, s = d.summary;
    $("#asLast").textContent = trNumber(s.last);
    const ch = $("#asChange");
    ch.textContent = (s.changePct >= 0 ? "+" : "") + trNumber(s.changePct) + "% gunluk";
    ch.className = "ov-delta " + (s.changePct >= 0 ? "up" : "down");
    $("#asRange").textContent = trNumber(s.low52) + " \u2014 " + trNumber(s.high52);
    $("#asVol").textContent = "%" + trNumber(s.volAnnual);
    const rsiEl = $("#asRsi"), rsiNote = $("#asRsiNote");
    if (s.rsiNow !== null) {
      rsiEl.textContent = trNumber(s.rsiNow, 1);
      rsiNote.textContent = s.rsiNow >= 70 ? "asiri alim bolgesi"
                          : s.rsiNow <= 30 ? "asiri satim bolgesi" : "notr bolge";
      rsiNote.className = "ov-delta " +
        (s.rsiNow >= 70 ? "down" : s.rsiNow <= 30 ? "up" : "");
    }

    $("#assetChartTitle").textContent =
      d.resolved + " \u00b7 son 1 yil \u00b7 " + s.observations + " islem gunu";
    summary.hidden = false;
    wrap.hidden = false;
    AssetChart.show(d);   // panel gorunur olduktan SONRA ciz (0x0 tuzagi)
  }

  /* ========================================================
     IZLEME LISTESI (v0.9.x)
  ======================================================== */

  /* Polling motoru: 60 sn periyot, sekme gizliyken atlar.
     (yfinance resmi API degil; daha sik sormak ban riski,
     backend onbellegi 55 sn oldugundan ayrica anlamsiz.) */
  const WatchPoller = (function () {
    let timer = null;
    function tick() {
      if (document.visibilityState === "visible") FDX.api.fetchWatchlist();
    }
    function start() {
      if (timer) return;
      timer = setInterval(tick, 60000);
    }
    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
    }
    document.addEventListener("visibilitychange", () => {
      // Sekme geri gelince beklemeden tazele
      if (document.visibilityState === "visible" && timer) tick();
    });
    return { start, stop };
  })();

  /* El yapimi SVG sparkline: N adet ECharts örnegi yerine sifir
     maliyetli polyline — dispose derdi yok, 15 satirda bile tüy gibi. */
  function sparklineSVG(points, up) {
    const W = 110, H = 30, PAD = 2;
    const min = Math.min(...points), max = Math.max(...points);
    const span = (max - min) || 1;
    const step = (W - PAD * 2) / (points.length - 1 || 1);
    const coords = points.map((v, i) => {
      const x = (PAD + i * step).toFixed(1);
      const y = (H - PAD - ((v - min) / span) * (H - PAD * 2)).toFixed(1);
      return x + "," + y;
    }).join(" ");
    const color = up ? "#4ade80" : "#f87171";
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" ' +
           'preserveAspectRatio="none" aria-hidden="true">' +
           '<polyline points="' + coords + '" fill="none" stroke="' + color +
           '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }

  function renderWatchlist(w, prevQuotes) {
    const body = $("#watchlistBody");
    const err = $("#watchError");
    if (!body) return;

    if (w.error) {
      err.hidden = false;
      err.textContent = w.error;
    } else {
      err.hidden = true;
    }

    body.innerHTML = "";

    if (!w.symbols.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = '<td colspan="5" class="table-empty">Liste bos - yukaridan sembol ekle (orn: THYAO, NVDA, BTC-USD).</td>';
      body.appendChild(tr);
      return;
    }

    w.symbols.forEach(sym => {
      const q = w.quotes[sym];
      const tr = document.createElement("tr");

      // Fiyat degistiyse flas (yesil/kirmizi)
      const prevQ = prevQuotes[sym];
      if (q && prevQ && typeof q.last === "number" &&
          typeof prevQ.last === "number" && q.last !== prevQ.last) {
        tr.className = q.last > prevQ.last ? "flash-up" : "flash-down";
      }

      const tdSym = document.createElement("td");
      tdSym.className = "mono";
      tdSym.textContent = q && q.resolved ? q.resolved : sym;

      const tdPrice = document.createElement("td");
      tdPrice.className = "mono";
      const tdChange = document.createElement("td");
      const tdSpark = document.createElement("td");

      if (!q) {
        if (w.status === "loading") {
          tdPrice.textContent = "\u2026";
          tdChange.textContent = "";
        } else {
          // yukleme bitti ama kotasyon yok: sonsuz "..." yerine rozet
          tdPrice.textContent = "\u2014";
          const tag = document.createElement("span");
          tag.className = "tag wait";
          tag.textContent = w.error ? Prefs.dict().app.errConn : Prefs.dict().app.errAsset;
          tdChange.appendChild(tag);
        }
        tdSpark.textContent = "";
      } else if (q.error) {
        tdPrice.textContent = "\u2014";
        tdChange.innerHTML = "";
        const tag = document.createElement("span");
        tag.className = "tag wait";
        tag.textContent = q.error;
        tdChange.appendChild(tag);
        tdSpark.textContent = "";
      } else {
        tdPrice.textContent = trNumber(q.last);
        const up = (q.changePct === null ? 0 : q.changePct) >= 0;
        const chip = document.createElement("span");
        chip.className = "watch-change " + (up ? "up" : "down");
        chip.textContent = q.changePct === null ? "\u2014"
          : (up ? "\u25b2 +" : "\u25bc ") + trNumber(q.changePct) + "%";
        tdChange.appendChild(chip);
        tdSpark.innerHTML = sparklineSVG(q.spark, up);
      }

      const tdDel = document.createElement("td");
      const del = document.createElement("button");
      del.className = "file-del";
      del.setAttribute("aria-label", sym + " sembolunu listeden cikar");
      del.textContent = "\u2715";
      del.addEventListener("click", () => FDX.api.removeWatchSymbol(sym));
      tdDel.appendChild(del);

      tr.append(tdSym, tdPrice, tdChange, tdSpark, tdDel);
      body.appendChild(tr);
    });
  }

  /* Konfigurasyon sayfasi: .env'den algilanan gercek AI durumu */
  function renderAiStatus(st) {
    const line = $("#aiStatusLine");
    if (!line || !st) return;
    if (st.error) {
      line.textContent = Prefs.dict().app.errAI + st.error;
      return;
    }
    const mark = ok => ok ? "\u2713" : "\u2717 (anahtar yok)";
    line.textContent =
      "Algilanan anahtarlar - Claude: " + mark(st.claude) +
      " \u00b7 Gemini: " + mark(st.gemini) +
      " \u00b7 Roller: analist=" + st.analyst + ", hakem=" + st.referee;

    // Form kontrolu renderSettings'te; burasi yalnizca durum satiri.
  }

  function renderSettings(st) {
    const fb = $("#configSaveMsg");
    const saveBtn = $("#saveConfigBtn");
    if (!fb || !saveBtn) return;

    saveBtn.disabled = st.status === "saving";
    saveBtn.querySelector(".report-btn-label").textContent =
      st.status === "saving" ? Prefs.dict().app.btnSaving : Prefs.dict().app.btnSave;

    if (st.status === "error") {
      fb.textContent = Prefs.dict().app.errGeneric + st.error;
      fb.className = "cfg-feedback err";
    } else if (st.status === "saved") {
      fb.textContent = st.warning || Prefs.dict().app.saved;
      fb.className = "cfg-feedback " + (st.warning ? "warn" : "ok");
    } else if (st.warning) {
      fb.textContent = st.warning;
      fb.className = "cfg-feedback warn";
    } else {
      fb.textContent = "";
      fb.className = "cfg-feedback";
    }

    const d = st.data;
    if (!d) return;
    const analystSel = $("#cfgAnalyst"), refereeSel = $("#cfgReferee");
    const chunk = $("#cfgChunk"), topk = $("#cfgTopK");
    // Kullanici tam yazarken uzerine yazmayalim: yalniz fetch/save sonrasi
    if (st.status === "done" || st.status === "saved") {
      analystSel.value = d.analyst;
      refereeSel.value = d.referee;
      chunk.value = d.chunkTarget;
      topk.value = d.topK;
    }
  }

  /* Status bar artik makyaj degil: gercek sistem durumunun aynasi */
  function renderStatusBar(state) {
    const sys = $("#statusSystem");
    const db = $("#statusDb");
    if (!sys || !db) return;

    const offline = !!(state.history.error || state.vectordb.statsError);

    const d = Prefs.dict().sys;

    if (state.simulation.status === "running") {
      sys.textContent = d.running;
      sys.className = "status-value green pulse";
    } else if (state.report.status === "generating") {
      sys.textContent = d.reporting;
      sys.className = "status-value green pulse";
    } else if (offline) {
      sys.textContent = d.offline;
      sys.className = "status-value red";
    } else {
      sys.textContent = d.ready;
      sys.className = "status-value green";
    }

    const st = state.vectordb.stats;
    if (state.vectordb.statsError) {
      db.textContent = d.dbOffline;
      db.className = "status-value red";
    } else if (st) {
      db.textContent = st.documentCount + " " + d.doc + " \u00b7 " + st.totalChunks + " " + d.chunk;
      db.className = "status-value";
    }
  }

  function renderHistory(h) {
    const cycle = $("#cycleText");
    if (h.weeklyRuns !== null) {
      cycle.textContent = h.weeklyRuns + "/" + h.weeklyLimit;
      cycle.title = "Bu hafta: " + h.weeklyRuns + " simulasyon \u00b7 Toplam: " + h.totalRuns;
    } else {
      cycle.textContent = "\u2014";
    }

    const body = $("#historyBody");
    if (!body) return;
    body.innerHTML = "";

    if (h.error) {
      const tr = document.createElement("tr");
      tr.innerHTML = '<td colspan="4" class="table-empty"></td>';
      tr.firstChild.textContent = Prefs.dict().app.errHist + h.error;
      body.appendChild(tr);
      return;
    }
    if (!h.items.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = '<td colspan="4" class="table-empty">Henuz simulasyon calistirilmadi - Simulasyon Olustur sayfasindan basla.</td>';
      body.appendChild(tr);
      return;
    }

    h.items.slice(0, 8).forEach(item => {
      const tr = document.createElement("tr");

      const tdDate = document.createElement("td");
      tdDate.textContent = new Date(item.ts * 1000)
        .toLocaleString("tr-TR", { day: "2-digit", month: "2-digit",
                                   hour: "2-digit", minute: "2-digit" });

      const tdPrompt = document.createElement("td");
      tdPrompt.textContent = item.prompt.length > 60
        ? item.prompt.slice(0, 60) + "…" : item.prompt;
      tdPrompt.title = item.prompt;

      const tdSharpe = document.createElement("td");
      tdSharpe.className = "mono";
      if (item.assets && item.assets.length) {
        tdSharpe.textContent = item.assets.map(a => trNumber(a.sharpe)).join(" / ");
        tdSharpe.title = item.assets.map(a => a.sym + ": " + trNumber(a.sharpe)).join("  \u00b7  ");
      } else {
        // v0.8 kayitlariyla geriye donuk uyumluluk
        tdSharpe.textContent = trNumber(item.sharpeA || 0) + " / " + trNumber(item.sharpeB || 0);
      }

      const tdStatus = document.createElement("td");
      const tag = document.createElement("span");
      if (item.mode === "live-ai") {
        tag.className = "tag ok";
        tag.textContent = item.confidence !== null && item.confidence !== undefined
          ? "AI \u2713 " + item.confidence + "/100" : "AI \u2713";
      } else {
        tag.className = "tag wait";
        tag.textContent = item.mode === "template" ? Prefs.dict().app.tpl : Prefs.dict().app.aiErr;
      }
      tdStatus.appendChild(tag);

      tr.append(tdDate, tdPrompt, tdSharpe, tdStatus);
      body.appendChild(tr);
    });
  }

  /* v0.9: N varlik icin dinamik kart uretimi */
  function renderSimCards(metrics) {
    const grid = $("#simResultsGrid");
    if (!grid) return;
    grid.innerHTML = "";

    const rows = [
      ["Yillik Getiri (CAGR, %)", "cagr", " %"],
      ["Volatilite (\u03c3, %)", "vol", " %"],
      ["Sharpe Orani", "sharpe", ""],
      ["Maks. Dusus (MDD)", "mdd", " %"]
    ];

    Object.entries(metrics).forEach(([sym, m]) => {
      const card = document.createElement("article");
      card.className = "asset-card glass";

      const title = document.createElement("h2");
      title.className = "asset-title";
      title.textContent = sym;
      card.appendChild(title);

      const body = document.createElement("div");
      body.className = "asset-body";

      const table = document.createElement("table");
      table.className = "metrics";
      rows.forEach(([label, key, suffix]) => {
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.textContent = label;
        const td = document.createElement("td");
        const pill = document.createElement("span");
        pill.className = "pill num";
        const val = m[key];
        if (typeof val === "number") {
          pill.classList.toggle("neg", val < 0);
          animateNumber(pill, val, suffix);
        } else {
          pill.textContent = String(val);
        }
        td.appendChild(pill);
        tr.append(th, td);
        table.appendChild(tr);
      });

      const chartDiv = document.createElement("div");
      chartDiv.className = "chart";
      chartDiv.id = "chart-" + cssSafe(sym);

      body.append(table, chartDiv);
      card.appendChild(body);
      grid.appendChild(card);
    });
  }

  function renderFileList(files) {
    const wrap = $("#fileListWrap");
    const list = $("#fileList");
    wrap.hidden = files.length === 0;
    list.innerHTML = "";
    files.forEach(f => {
      const li = document.createElement("li");
      li.className = "file-row" +
        (f.status === "rejected" || f.status === "error" ? " rejected" : "");

      const name = document.createElement("span");
      name.className = "file-name";
      name.textContent = f.name;

      const meta = document.createElement("span");
      meta.className = "file-meta";
      meta.textContent =
        f.status === "uploading" ? f.sizeKB + " KB — yükleniyor…" :
        f.status === "indexed"   ? f.sizeKB + " KB — indekslendi (" + f.chunks + " chunk)" :
        f.status === "error"     ? "hata: " + f.reason :
                                   "reddedildi: " + f.reason;

      const del = document.createElement("button");
      del.className = "file-del";
      del.setAttribute("aria-label", f.name + " dosyasını listeden çıkar");
      del.textContent = "✕";
      del.addEventListener("click", () => FDX.api.removeFile(f.name));

      li.append(name, meta, del);
      list.appendChild(li);
    });
  }

  function renderAiMeta(meta) {
    const box = $("#aiMeta");
    if (!meta) { box.hidden = true; return; }
    const bits = [];
    if (meta.mode === "live-ai") {
      bits.push("Analist: " + meta.analyst);
      if (meta.confidence !== null && meta.confidence !== undefined)
        bits.push("Hakem (" + meta.referee + "): " + meta.confidence + "/100" +
                  (meta.refereeNote ? " — " + meta.refereeNote : ""));
      if (meta.ragMode === "off")
        bits.push("RAG: kapali (kullanici tercihi)");
      if (meta.rounds > 1) {
        const scores = (meta.roundLog || []).map(r => r.score).join(" \u2192 ");
        bits.push("\u267b Oz-duzeltme: " + meta.rounds + " tur (" + scores + ")");
      }
      bits.push("Token: " + meta.tokensIn + "\u2192" + meta.tokensOut);
    } else {
      bits.push(meta.mode === "template"
        ? "Şablon mod — .env'e API anahtarı eklenince gerçek AI devreye girer"
        : "AI hatası — ham sonuçlar gösterildi");
    }
    if (meta.ragSources && meta.ragSources.length)
      bits.push("RAG kaynakları: " + meta.ragSources.join(", "));
    box.textContent = bits.join("  ·  ");
    box.hidden = false;
  }

  function renderVectorStats(v) {
    const docs = $("#statDocs"), chunks = $("#statChunks"),
          updated = $("#statUpdated"), note = $("#statDocsNote");
    if (v.statsError) {
      docs.textContent = "—"; chunks.textContent = "—"; updated.textContent = "—";
      note.textContent = Prefs.dict().app.serverFail;
      return;
    }
    if (!v.stats) return;
    docs.textContent = v.stats.documentCount;
    chunks.textContent = v.stats.totalChunks;
    note.textContent = v.stats.documentCount === 0 ? Prefs.dict().app.noDocs : Prefs.dict().app.idxLive;
    updated.textContent = v.stats.lastUpdated
      ? new Date(v.stats.lastUpdated * 1000).toLocaleTimeString("tr-TR",
          { hour: "2-digit", minute: "2-digit" })
      : "—";
  }

  /* Simulasyon sayfasindaki "RAG Referans Kaynaklari" chip'leri artik
     gercek yuklu belgelerden dolar (eski sabit "SPK 2024..." yalani gitti).
     Chip'ler yalniz gosterimlik: hangi belgeler indeksli, onu durustce soyler. */
  function renderRagChips(v) {
    const wrap = $("#ragChips");
    if (!wrap) return;
    wrap.innerHTML = "";

    const note = text => {
      const span = document.createElement("span");
      span.className = "rag-empty";
      span.textContent = text;
      wrap.appendChild(span);
    };

    if (v.statsError) { note("Belge listesi alınamadı (sunucu çalışıyor mu?)"); return; }
    if (!v.stats) { note("Belgeler yükleniyor…"); return; }

    const docs = v.stats.documents || [];
    if (!docs.length) {
      note("Henüz belge yüklenmedi — Vektör Veri Tabanı sayfasından PDF/Word ekle.");
      return;
    }

    docs.forEach(d => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = d.name;
      chip.title = (d.chunks || 0) + " chunk indeksli";
      wrap.appendChild(chip);
    });
  }

  function renderQuery(v) {
    const box = $("#queryResults");
    const btn = $("#queryBtn");
    btn.disabled = v.queryStatus === "running";
    btn.querySelector(".report-btn-label").textContent =
      v.queryStatus === "running" ? Prefs.dict().app.btnSearching : Prefs.dict().app.btnSearch;

    if (v.queryStatus === "running") {
      box.innerHTML = "";
      const p = document.createElement("div");
      p.className = "query-loading";
      p.textContent = Prefs.dict().app.searching;
      box.appendChild(p);
      return;
    }
    if (v.queryStatus === "error") {
      box.innerHTML = "";
      const p = document.createElement("p");
      p.className = "ai-error";
      p.textContent = Prefs.dict().app.searchErr + v.queryError;
      box.appendChild(p);
      return;
    }
    if (v.queryStatus !== "done") return;

    box.innerHTML = "";
    if (!v.queryResults || v.queryResults.length === 0) {
      const p = document.createElement("p");
      p.className = "query-empty";
      p.textContent = Prefs.dict().app.noResults;
      box.appendChild(p);
      return;
    }
    v.queryResults.forEach(r => {
      const div = document.createElement("div");
      div.className = "query-hit";
      const head = document.createElement("div");
      head.className = "query-hit-head";
      head.textContent = r.source + " · sayfa " + r.page + " · benzerlik " + r.score;
      const body = document.createElement("p");
      body.textContent = r.text.length > 300 ? r.text.slice(0, 300) + "…" : r.text;
      div.append(head, body);
      box.appendChild(div);
    });
  }

  /* ========================================================
     ETKİLEŞİMLER — sadece api/router'a haber verir
  ======================================================== */

  function bindEvents() {

    $$(".nav-item").forEach(btn =>
      btn.addEventListener("click", () => FDX.router.navigate(btn.dataset.view)));

    /* Logo -> ana sayfa (fare + klavye).
       SAVUNMACI: HTML tarafinda logo <a href="#overview"> yapildiysa
       (Antigravity yaklasimi) #brandHome bulunmaz - o durumda link
       zaten hash router uzerinden calisir, biz sessizce atlariz.
       Null kontrolu olmazsa bindEvents burada patlar ve TUM
       butonlar olur; o yuzden bu guard kritik. */
    const brand = $("#brandHome");
    if (brand) {
      const goHome = () => FDX.router.navigate("overview");
      brand.addEventListener("click", goHome);
      brand.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goHome(); }
      });
    }

    /* Paylas -> o anki sayfanin linkini panoya kopyala */
    const shareBtn = $("#shareBtn");
    if (shareBtn) shareBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        shareBtn.classList.add("ok");
        shareBtn.title = "Baglanti kopyalandi";
        setTimeout(() => {
          shareBtn.classList.remove("ok");
          shareBtn.title = "Bu sayfanin baglantisini kopyala";
        }, 1600);
      } catch (err) {
        shareBtn.title = "Pano erisimi engellendi - adres cubugundan kopyalayabilirsin";
      }
    });

    /* Prompt kutusu icerige gore buyur (tavan 170px) */
    const promptEl = $("#promptInput");
    const autoGrow = () => {
      promptEl.style.height = "auto";
      promptEl.style.height = Math.min(promptEl.scrollHeight, 170) + "px";
    };
    promptEl.addEventListener("input", autoGrow);

    $("#sendBtn").addEventListener("click", () => {
      const prompt = $("#promptInput").value.trim();
      if (!prompt) return;
      FDX.api.runSimulation(prompt);
    });

    $("#reportBtn").addEventListener("click", () => FDX.api.generateReport());

    /* ---- Dropzone: fare + klavye + gerçek dosya yakalama ---- */
    const dz = $("#dropzone");
    const fileInput = $("#fileInput");

    ["dragenter", "dragover"].forEach(ev =>
      dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("over"); }));
    ["dragleave"].forEach(ev =>
      dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove("over"); }));

    dz.addEventListener("drop", e => {
      e.preventDefault();
      dz.classList.remove("over");
      if (e.dataTransfer && e.dataTransfer.files.length) {
        FDX.api.addFiles(e.dataTransfer.files);
      }
    });

    dz.addEventListener("click", () => fileInput.click());
    dz.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput.click();
      }
    });

    fileInput.addEventListener("change", () => {
      if (fileInput.files.length) FDX.api.addFiles(fileInput.files);
      fileInput.value = "";   // aynı dosya tekrar seçilebilsin
    });

    /* ---- RAG toggle (topbar) ---- */
    const ragToggle = $("#ragToggle");
    if (ragToggle) {
      ragToggle.checked = FDX.store.get().useRag;
      ragToggle.addEventListener("change", () => FDX.api.setUseRag(ragToggle.checked));
    }

    /* ---- Konfigurasyon ---- */
    const cfgAnalyst = $("#cfgAnalyst");
    cfgAnalyst.addEventListener("change", () => {
      // Hakem her zaman digeridir - ayna aninda guncellensin
      $("#cfgReferee").value = cfgAnalyst.value === "claude" ? "gemini" : "claude";
    });
    $("#saveConfigBtn").addEventListener("click", () => {
      FDX.api.saveSettings({
        analyst: cfgAnalyst.value,
        chunkTarget: parseInt($("#cfgChunk").value, 10),
        topK: parseInt($("#cfgTopK").value, 10)
      });
    });

    /* ---- Izleme Listesi: sembol ekleme ---- */
    const watchInput = $("#watchInput");
    const addWatch = () => {
      const errBox = $("#watchError");
      const msg = FDX.api.addWatchSymbol(watchInput.value);
      if (msg) {
        errBox.hidden = false;
        errBox.textContent = msg;
      } else {
        errBox.hidden = true;
        watchInput.value = "";
      }
    };
    $("#watchAddBtn").addEventListener("click", addWatch);
    watchInput.addEventListener("keydown", e => { if (e.key === "Enter") addWatch(); });

    /* ---- Varlik Analizi arama ---- */
    const assetInput = $("#assetInput");
    const runAsset = () => {
      const sym = assetInput.value.trim().toUpperCase();
      if (sym.length < 2) return;
      FDX.router.navigate("assets", { symbol: sym });   // hash: paylasabilir link
      FDX.api.fetchAsset(sym);
    };
    $("#assetBtn").addEventListener("click", runAsset);
    assetInput.addEventListener("keydown", e => { if (e.key === "Enter") runAsset(); });

    /* ---- RAG arama testi ---- */
    const qInput = $("#queryInput");
    const runQuery = () => {
      const q = qInput.value.trim();
      if (q.length >= 3) FDX.api.queryDocs(q);
    };
    $("#queryBtn").addEventListener("click", runQuery);
    qInput.addEventListener("keydown", e => { if (e.key === "Enter") runQuery(); });
  }

  /* ========================================================
     BAŞLAT
  ======================================================== */

  document.addEventListener("DOMContentLoaded", () => {
    Prefs.init();     // tema + dil, ilk boyamadan once
    bindEvents();

    // Acilista: dongu sayaci + vektor DB durumu (status bar icin)
    FDX.api.refreshHistory();
    FDX.api.refreshVectorStats();

    FDX.store.subscribe(render);
    FDX.router.start();   // hash'i okur → store'u günceller → render tetiklenir
    // İlk view "simulation" ise render() içindeki introDone bloğu
    // runSimIntro'yu zaten çalıştırır; kartlar ilk simülasyonla doğar.
  });

  /* İlk giriş animasyonları — introDone bayrağıyla hayatta
     yalnızca bir kez çalışır (çakışma imkânsız). */
  function runSimIntro() {
    // textarea daktilo (value'ya yazar, textContent'e değil)
    const input = $("#promptInput");
    const text = Prefs.dict().app.promptText;
    let i = 0;
    input.value = "";
    const t = setInterval(() => {
      input.value = text.slice(0, ++i);
      if (i >= text.length) clearInterval(t);
    }, FDX.CONFIG.typing.promptMs);

    $("#aiCursor").classList.remove("done");
    typeInto($("#aiText"), FDX.SEED.aiIntro, FDX.CONFIG.typing.aiMs,
      () => $("#aiCursor").classList.add("done"));
  }

})();
