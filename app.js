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
      document.documentElement.lang = this.lang;  // ekran okuyucu/tarayici dogru dili bilsin
      const d = this.dict();
      document.documentElement.lang = this.lang;
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

    /* MONTE CARLO YELPAZESI (fan chart) — 2.000 yolun GERCEK yuzdelik
       bantlari, backend'in dondurdugu m.fan'dan cizilir (S0 = 100).
       Eski 3D yuzey sentetik dekordu ("dogru seyi gostermiyor"
       sikayeti, 11 Tem); echarts-gl bagimliligi onunla emekli oldu. */
    function fanOption(fan, d) {
      const ay = fan.days.map(v => +(v / 21).toFixed(1));
      const delta = (hi, lo) => hi.map((v, i) => +(v - lo[i]).toFixed(2));
      const AXIS = {
        axisLabel: { color: "#9fb3d0", fontSize: 9 },
        axisLine: { lineStyle: { color: "#3a4d6e" } },
        splitLine: { lineStyle: { color: "rgba(143,184,232,0.08)" } }
      };
      return {
        animationDuration: 500,
        grid: { left: 46, right: 14, top: 30, bottom: 26 },
        legend: {
          top: 0, right: 6, itemWidth: 14, itemHeight: 8,
          textStyle: { color: "#9fb3d0", fontSize: 9 },
          data: [d.fanOuter, d.fanInner, d.fanMedian]
        },
        tooltip: {
          trigger: "axis",
          backgroundColor: "rgba(17,28,49,0.95)",
          borderColor: "rgba(143,184,232,0.25)",
          textStyle: { color: "#dbe6f5", fontSize: 11 },
          formatter: ps => {
            const i = ps[0].dataIndex;
            return d.fanAy + " " + ay[i] +
              "<br/>" + d.fanMedian + ": <b>" + fan.p50[i] + "</b>" +
              "<br/>" + d.fanInner + ": " + fan.p25[i] + " – " + fan.p75[i] +
              "<br/>" + d.fanOuter + ": " + fan.p10[i] + " – " + fan.p90[i];
          }
        },
        xAxis: { type: "category", data: ay, boundaryGap: false,
                 name: d.fanAy,
                 nameTextStyle: { color: "#9fb3d0", fontSize: 9 }, ...AXIS },
        yAxis: { type: "value", scale: true, ...AXIS },
        series: [
          // dis bant (%80): p10 gorunmez taban + (p90-p10) dolgu
          { name: "_taban1", type: "line", data: fan.p10, stack: "dis",
            lineStyle: { opacity: 0 }, symbol: "none", silent: true },
          { name: d.fanOuter, type: "line", data: delta(fan.p90, fan.p10),
            stack: "dis", lineStyle: { opacity: 0 }, symbol: "none",
            areaStyle: { color: "rgba(143,184,232,0.16)" },
            itemStyle: { color: "rgba(143,184,232,0.55)" }, silent: true },
          // ic bant (%50): p25 gorunmez taban + (p75-p25) dolgu
          { name: "_taban2", type: "line", data: fan.p25, stack: "ic",
            lineStyle: { opacity: 0 }, symbol: "none", silent: true },
          { name: d.fanInner, type: "line", data: delta(fan.p75, fan.p25),
            stack: "ic", lineStyle: { opacity: 0 }, symbol: "none",
            areaStyle: { color: "rgba(217,179,106,0.22)" },
            itemStyle: { color: "rgba(217,179,106,0.75)" }, silent: true },
          // medyan yolu
          { name: d.fanMedian, type: "line", data: fan.p50, symbol: "none",
            lineStyle: { color: "#d9b36a", width: 2.5 },
            itemStyle: { color: "#d9b36a" } }
        ]
      };
    }

    /* Kartlar DOM'a eklendikten SONRA cagrilir (0x0 tuzagi yok). */
    function renderFor(metrics) {
      dispose();
      const d = Prefs.dict().sim;
      Object.entries(metrics).forEach(([sym, m]) => {
        const el = document.getElementById("chart-" + cssSafe(sym));
        if (!el || !window.echarts) return;
        if (!m.fan) {
          // eski kayit / bayat yedek: grafiksiz ama durust
          el.innerHTML = '<p class="chart-na">' + d.fanNa + '</p>';
          return;
        }
        try {
          const chart = echarts.init(el, null, { renderer: "canvas" });
          chart.setOption(fanOption(m.fan, d));
          instances.push({ chart });
        } catch (err) {
          console.warn("Yelpaze cizilemedi (" + sym + "):", err.message);
          el.innerHTML = '<p class="chart-na">' + d.fanNa + '</p>';
        }
      });
    }

    function setRotation(_on) { /* 3D emekli — cagiran kod icin no-op */ }

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
        if (state.view === "markets") {
          FDX.api.fetchMarkets();
          MarketsPoller.start();
        } else {
          MarketsPoller.stop();
        }
        if (state.view === "crypto") {
          CryptoLive.start();
        } else {
          CryptoLive.stop();
        }
        if (state.view === "news") {
          NewsLive.start();
        } else {
          NewsLive.stop();
        }
        if (state.view === "portfolio") {
          FDX.api.fetchPortfolio();
          PortfolioPoller.start();
        } else {
          PortfolioPoller.stop();
        }
        if (state.view === "config") {
          FDX.api.refreshAiStatus();
          FDX.api.fetchSettings();
        }
        if (state.view === "report") FDX.api.fetchReports();
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

      // Calisirken NET geri bildirim: Groq 5-15sn surer; demo donmus gorunmesin.
      if (sim.status === "running") {
        if (aiTimer) { clearInterval(aiTimer); aiTimer = null; }
        const t = $("#aiText");
        if (t) t.textContent =
          "Monte Carlo çalışıyor ve AI analiz ediyor… birkaç saniye sürebilir.";
        $("#aiCursor").classList.remove("done");
        $("#aiMeta").hidden = true;
        const grid = $("#simResultsGrid");
        if (grid) {
          grid.innerHTML = "";
          const box = document.createElement("div");
          box.className = "empty-state glass";
          box.innerHTML = '<div class="fdx-spinner"></div>' +
            '<h3>Hesaplanıyor…</h3>' +
            '<p>2.000 yollu Monte Carlo koşuyor, AI yorumu hazırlanıyor.</p>';
          grid.appendChild(box);
        }
      }

      if (sim.status === "done" && prev.simulation && prev.simulation.status === "running") {
        FDX.api.refreshHistory();
        renderSimCards(sim.metrics, sim.quotes);   // kartlar once DOM'a (+ canli fiyat)
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

    /* ---- Piyasalar tahtasi ---- */
    if (state.markets !== prev.markets) {
      renderMarkets(state.markets);
    }

    /* ---- Kripto tahtasi ---- */
    if (state.crypto !== prev.crypto) {
      renderCrypto(state.crypto);
    }

    /* ---- Haberler ---- */
    if (state.news !== prev.news) {
      renderNews(state.news);
    }

    /* ---- Rapor arsivi ---- */
    if (state.reports !== prev.reports) {
      renderReports(state.reports);
    }

    /* ---- Portfoy ---- */
    if (state.portfolio !== prev.portfolio) {
      renderPortfolio(state.portfolio);
    }

    renderStatusBar(state);      // ucuz islem, her degisimde tazelenir
    renderOverviewCards(state);  // genel bakis kartlari da gercek veriyle

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
    if (s.rsiNow != null) {
      rsiEl.textContent = trNumber(s.rsiNow, 1);
      rsiNote.textContent = s.rsiNow >= 70 ? "asiri alim bolgesi"
                          : s.rsiNow <= 30 ? "asiri satim bolgesi" : "notr bolge";
      rsiNote.className = "ov-delta " +
        (s.rsiNow >= 70 ? "down" : s.rsiNow <= 30 ? "up" : "");
    } else {
      // onceki sembolun RSI'i ekranda KALMASIN (bayat veri yalani)
      rsiEl.textContent = "—";
      rsiNote.textContent = "yetersiz veri";
      rsiNote.className = "ov-delta";
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

  /* Piyasalar tahtasi polling motoru — WatchPoller ile ayni desen:
     60 sn periyot, sekme gizliyken atlar, sayfadan cikinca durur. */
  const MarketsPoller = (function () {
    let timer = null;
    function tick() {
      if (document.visibilityState === "visible") FDX.api.fetchMarkets();
    }
    function start() { if (!timer) timer = setInterval(tick, 60000); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && timer) tick();
    });
    return { start, stop };
  })();

  /* Portfoy polling — Markets ile ayni desen (60 sn, gizli sekmede atlar). */
  const PortfolioPoller = (function () {
    let timer = null;
    function tick() {
      if (document.visibilityState === "visible") FDX.api.fetchPortfolio();
    }
    function start() { if (!timer) timer = setInterval(tick, 60000); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    document.addEventListener("visibilitychange", () => {
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
      tr.innerHTML = '<td colspan="5" class="table-empty">' + Prefs.dict().ui.wlEmpty + '</td>';
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

  /* Hesapli satir (orn. Gram Altin TL = ons x kur x faktor).
     Degisim: iki bilesenin gunluk degisiminin bileskesi.
     Sparkline: iki serinin eleman-eleman carpimi (kuyruklar hizalanir). */
  function computedQuote(item, quotes) {
    const a = quotes[(item.needs || [])[0]];
    const b = quotes[(item.needs || [])[1]];
    if (!a || !b || a.error || b.error ||
        typeof a.last !== "number" || typeof b.last !== "number") return null;
    const last = a.last * b.last * item.factor;
    const chA = (typeof a.changePct === "number") ? a.changePct : 0;
    const chB = (typeof b.changePct === "number") ? b.changePct : 0;
    const changePct = ((1 + chA / 100) * (1 + chB / 100) - 1) * 100;
    let spark = [];
    const n = Math.min((a.spark || []).length, (b.spark || []).length);
    if (n > 1) {
      const as = a.spark.slice(-n), bs = b.spark.slice(-n);
      spark = as.map((v, i) => v * bs[i] * item.factor);
    }
    return { last: last, changePct: changePct, spark: spark };
  }

  /* ========================================================
     KRIPTO — Binance WebSocket canli akis (tamamen istemci tarafi)
     Mimari karar: canli akis SUNUCUDAN gecirilmez — ucretsiz Render
     uyur ve RAM'i dar. Binance/CoinGecko/alternative.me CORS acik,
     veri dogrudan tarayiciya gelir; sunucu maliyeti sifir.
  ======================================================== */
  const CryptoLive = (() => {
    let ws = null, buf = {}, flushT = null, retryT = null, metaAt = 0;

    function setWs(v) {
      const s = FDX.store;
      if (s.get().crypto.ws !== v) s.set({ crypto: { ...s.get().crypto, ws: v } });
    }

    function start() {
      fetchMeta();
      bootstrap();   // REST ile aninda ilk boyama (WS isinana kadar bos ekran olmasin)
      open();
      if (!flushT) flushT = setInterval(flush, 1000);  // saniyede 1 toplu boyama
    }

    /* Tahtanin ilk dolumu: tek REST cagrisi. WS 1-2 sn icinde
       devralir ve uzerine yazar; REST verisi sadece acilis konforu. */
    async function bootstrap() {
      try {
        const syms = JSON.stringify((FDX.CRYPTO || []).map(c => c.sym));
        const r = await fetch("https://data-api.binance.vision/api/v3/ticker/24hr?symbols="
                              + encodeURIComponent(syms));
        const arr = await r.json();
        arr.forEach(t => {
          if (!buf[t.symbol]) buf[t.symbol] = {
            last: +t.lastPrice,
            changePct: +t.priceChangePercent,
            vol: +t.quoteVolume
          };
        });
        flush();
      } catch (_) { /* REST dusmusse WS zaten deneyecek */ }
    }

    function stop() {
      if (retryT) { clearTimeout(retryT); retryT = null; }
      if (flushT) { clearInterval(flushT); flushT = null; }
      if (ws) { ws.onclose = null; try { ws.close(); } catch (_) {} ws = null; }
      setWs("off");
    }

    function open() {
      if (ws) return;
      const streams = (FDX.CRYPTO || [])
        .map(c => c.sym.toLowerCase() + "@miniTicker").join("/");
      setWs("wait");
      try {
        ws = new WebSocket("wss://data-stream.binance.vision/stream?streams=" + streams);
      } catch (_) { setWs("off"); return; }
      ws.onopen = () => setWs("live");
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(ev.data).data;
          if (m && m.s) buf[m.s] = {
            last: +m.c,
            changePct: +m.o ? (+m.c - +m.o) / +m.o * 100 : 0,
            vol: +m.q
          };
        } catch (_) { /* bozuk tek mesaj akisi durdurmasin */ }
      };
      ws.onclose = () => {
        ws = null;
        setWs("off");
        // sekme hala aciksa 3 sn sonra sessizce yeniden dene
        if (FDX.store.get().view === "crypto") retryT = setTimeout(open, 3000);
      };
    }

    /* WS mesajlari buf'ta birikir; DOM'a saniyede 1 kez yansir
       (her tick'te render = telefonda pil/performans katili) */
    function flush() {
      fetchMeta();  // icinde 60 sn'lik fren var
      if (!Object.keys(buf).length) return;
      const s = FDX.store, cr = s.get().crypto;
      s.set({ crypto: { ...cr, quotes: { ...cr.quotes, ...buf } } });
      buf = {};
    }

    async function fetchMeta() {
      if (Date.now() - metaAt < 60 * 1000) return;
      metaAt = Date.now();
      const s = FDX.store;
      try {
        const [fngR, glR] = await Promise.all([
          fetch("https://api.alternative.me/fng/?limit=1"),
          fetch("https://api.coingecko.com/api/v3/global")
        ]);
        const fng = (await fngR.json()).data[0];
        const gl = (await glR.json()).data;
        s.set({ crypto: { ...s.get().crypto,
          fng: { value: +fng.value, label: fng.value_classification },
          global: { dom: gl.market_cap_percentage.btc,
                    mcap: gl.total_market_cap.usd },
          error: null } });
      } catch (err) {
        s.set({ crypto: { ...s.get().crypto,
          error: "Endeks verileri alınamadı: " + err.message } });
      }
    }

    return { start, stop };
  })();

  /* Kripto tahtasi: satirlar ILK veride kurulur, sonrasi yerinde
     guncelleme — innerHTML'i her saniye yeniden kurmak yok. */
  const crRows = {};
  function renderCrypto(cr) {
    const err = $("#cryptoError");
    if (err) { err.hidden = !cr.error; if (cr.error) err.textContent = cr.error; }

    const d = Prefs.dict().cr;

    if (cr.fng) {
      $("#crFngVal").textContent = cr.fng.value;
      $("#crFngClass").textContent = d.fngClass[cr.fng.label] || cr.fng.label;
      const bar = $("#crFngBar");
      if (bar) bar.style.left = Math.max(0, Math.min(100, cr.fng.value)) + "%";
    }
    if (cr.global) {
      $("#crDom").textContent = cr.global.dom.toFixed(1) + "%";
      $("#crMcap").textContent = "$" + (cr.global.mcap / 1e12).toFixed(2) + "T";
    }
    const conn = $("#crConn");
    if (conn) {
      const txt = cr.ws === "live" ? d.connLive
                : cr.ws === "wait" ? d.connWait : d.connOff;
      conn.innerHTML = '<span class="cr-dot ' + cr.ws + '"></span>' + txt;
    }

    const body = $("#cryptoBody");
    if (!body || !Object.keys(cr.quotes).length) return;

    (FDX.CRYPTO || []).forEach(c => {
      const q = cr.quotes[c.sym];
      let r = crRows[c.sym];
      if (!r) {
        // Satirlar ILK veride FDX.CRYPTO sirasiyla topluca kurulur —
        // gelis sirasina kurmak BTC'yi listenin ortasina atiyordu.
        if (body.querySelector(".table-empty")) body.innerHTML = "";
        const tr = document.createElement("tr");
        // satir tiklaninca teknik analiz (izleme listesiyle ayni davranis)
        tr.style.cursor = "pointer";
        tr.title = d.tipRow;
        tr.addEventListener("click", () =>
          FDX.router.navigate("assets", { symbol: c.code + "-USD" }));
        const tdName = document.createElement("td");
        const label = document.createElement("span");
        label.textContent = c.label;
        const sym = document.createElement("span");
        sym.className = "mk-sym mono";
        sym.textContent = c.code;
        tdName.append(label, sym);
        const tdPrice = document.createElement("td");
        tdPrice.className = "mono";
        tdPrice.style.textAlign = "right";
        const tdChg = document.createElement("td");
        tdChg.style.textAlign = "right";
        const tdVol = document.createElement("td");
        tdVol.className = "mono";
        tdVol.style.textAlign = "right";
        tr.append(tdName, tdPrice, tdChg, tdVol);
        body.appendChild(tr);
        r = crRows[c.sym] = { tdPrice, tdChg, tdVol, lastVal: null };
        r.tdPrice.textContent = "…";
      }
      if (!q) return;   // verisi henuz gelmeyen coin "…" ile bekler
      r.tdPrice.textContent = fmtUsd(q.last);
      // terminal gelenegi: son tik yonu fiyatin rengi
      if (r.lastVal !== null && q.last !== r.lastVal) {
        r.tdPrice.classList.toggle("tick-up", q.last > r.lastVal);
        r.tdPrice.classList.toggle("tick-down", q.last < r.lastVal);
      }
      r.lastVal = q.last;
      const up = q.changePct >= 0;
      r.tdChg.innerHTML = '<span class="watch-change ' + (up ? "up" : "down") + '">' +
        (up ? "▲ " : "▼ ") + Math.abs(q.changePct).toFixed(2) + "%</span>";
      r.tdVol.textContent = fmtVol(q.vol);
    });
  }

  /* Kripto ABD dolari sergisi: buyuk fiyat tam sayi, kucuk coin 4 hane */
  function fmtUsd(v) {
    if (v >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (v >= 1)    return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
    return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
  }
  function fmtVol(v) {
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
    return "$" + Math.round(v).toLocaleString("en-US");
  }

  /* ========================================================
     HABERLER — Google News RSS (backend proxy, 10 dk onbellek)
     + kayan piyasa seridi (watchlist endpointi; BTC -> BTC-USD
     cozumu backend'de). Baslik/kaynak metinleri DIS VERI oldugu
     icin hep textContent ile yazilir (XSS standardimiz).
  ======================================================== */
  const NewsLive = (() => {
    let newsT = null, tickT = null;

    function start() {
      fetchNews();
      fetchTicker();
      if (!newsT) newsT = setInterval(fetchNews, 5 * 60 * 1000);
      if (!tickT) tickT = setInterval(fetchTicker, 60 * 1000);
    }

    function stop() {
      if (newsT) { clearInterval(newsT); newsT = null; }
      if (tickT) { clearInterval(tickT); tickT = null; }
    }

    function setCat(cat) {
      const s = FDX.store;
      if (s.get().news.cat === cat) return;
      s.set({ news: { ...s.get().news, cat: cat, status: "loading" } });
      fetchNews();
    }

    async function fetchNews() {
      const s = FDX.store;
      try {
        const r = await fetch(FDX.CONFIG.api.baseUrl + "/news?cat=" +
          encodeURIComponent(s.get().news.cat) + "&lang=" + Prefs.lang);
        if (!r.ok) {
          let msg = "HTTP " + r.status;
          try { msg = (await r.json()).detail || msg; } catch (_) {}
          throw new Error(msg);
        }
        const data = await r.json();
        s.set({ news: { ...s.get().news,
                        items: data.items, status: "done", error: null } });
      } catch (err) {
        s.set({ news: { ...s.get().news, status: "error", error: err.message } });
      }
    }

    async function fetchTicker() {
      const syms = (FDX.NEWS_TICKER || []).map(t => t.sym).join(",");
      try {
        const r = await fetch(FDX.CONFIG.api.baseUrl + "/watchlist?symbols=" +
                              encodeURIComponent(syms));
        if (!r.ok) return;                  // serit kozmetik: susar, haber yasar
        const data = await r.json();
        FDX.store.set({ news: { ...FDX.store.get().news,
                                ticker: data.quotes || [] } });
      } catch (_) { /* sessiz */ }
    }

    return { start: start, stop: stop, setCat: setCat, fetchNews: fetchNews };
  })();

  // Dil degisince haber AKISI da dil degistirmeli (RSS feed dili farkli)
  $$("#langSeg .seg-btn").forEach(b => b.addEventListener("click", () => {
    if (FDX.store.get().view === "news") NewsLive.fetchNews();
  }));

  function nwTimeAgo(ts, d) {
    if (!ts) return "";
    const dk = Math.round((Date.now() / 1000 - ts) / 60);
    if (dk < 2) return d.now;
    if (dk < 60) return dk + d.minAgo;
    const sa = Math.round(dk / 60);
    if (sa < 24) return sa + d.hrAgo;
    if (sa < 48) return d.yesterday;
    return new Date(ts * 1000).toLocaleDateString();
  }

  function nwCard(it, d, cls) {
    const a = document.createElement("a");
    a.className = cls;
    a.href = it.link;
    a.target = "_blank";
    a.rel = "noopener";
    a.title = d.srcTip;
    const t = document.createElement("h4");
    t.textContent = it.title;
    const m = document.createElement("span");
    m.className = "nw-meta mono";
    m.textContent = it.source + " · " + nwTimeAgo(it.ts, d);
    a.append(t, m);
    return a;
  }

  function renderNews(nw) {
    const d = Prefs.dict().nw;

    // Kategori cipleri: az dugme — her cizimde tazelemek ucuz, dili de takip eder
    const cats = $("#nwCats");
    if (cats) {
      cats.innerHTML = "";
      Object.keys(d.cats).forEach(c => {
        const b = document.createElement("button");
        b.className = "seg-btn" + (c === nw.cat ? " active" : "");
        b.textContent = d.cats[c];
        b.addEventListener("click", () => NewsLive.setCat(c));
        cats.appendChild(b);
      });
    }

    const err = $("#nwError");
    if (err) {
      err.hidden = nw.status !== "error";
      if (nw.error) err.textContent = d.empty + " (" + nw.error + ")";
    }

    // Kayan serit: icerik 2 kez yazilir -> %50 kaydirma kesintisiz dongu olur
    const tick = $("#nwTicker"), track = $("#nwTickerTrack");
    if (tick && track) {
      const qs = nw.ticker || [];
      tick.hidden = !qs.length;
      if (qs.length) {
        track.innerHTML = "";
        for (let tur = 0; tur < 2; tur++) {
          qs.forEach(q => {
            const cfg = (FDX.NEWS_TICKER || []).find(t => t.sym === q.symbol) || {};
            const span = document.createElement("span");
            span.className = "nw-tick";
            const b = document.createElement("b");
            b.textContent = cfg[Prefs.lang] || q.symbol;
            const fiyat = document.createTextNode(" " +
              ((typeof q.last === "number") ? trNumber(q.last) : "—") + " ");
            const ch = document.createElement("span");
            const up = (q.changePct || 0) >= 0;
            ch.className = up ? "nw-up" : "nw-down";
            ch.textContent = (up ? "▲" : "▼") + Math.abs(q.changePct || 0).toFixed(2) + "%";
            span.append(b, fiyat, ch);
            track.appendChild(span);
          });
        }
      }
    }

    // Manset + one cikanlar + izgara
    const heroRow = $("#nwHeroRow"), hero = $("#nwHero"),
          feat = $("#nwFeatured"), grid = $("#nwGrid");
    if (!grid) return;
    const items = nw.items || [];

    if (!items.length) {
      if (heroRow) heroRow.hidden = true;
      grid.innerHTML = "";
      const p = document.createElement("div");
      p.className = "table-empty";
      p.textContent = nw.status === "error" ? d.empty : d.loading;
      grid.appendChild(p);
      return;
    }

    heroRow.hidden = false;
    hero.href = items[0].link;
    hero.title = d.srcTip;
    hero.innerHTML = "";
    const hTag = document.createElement("span");
    hTag.className = "nw-tag";
    hTag.textContent = d.cats[nw.cat] || nw.cat;
    const hTitle = document.createElement("h2");
    hTitle.textContent = items[0].title;
    const hMeta = document.createElement("span");
    hMeta.className = "nw-meta mono";
    hMeta.textContent = items[0].source + " · " + nwTimeAgo(items[0].ts, d);
    hero.append(hTag, hTitle, hMeta);

    feat.innerHTML = "";
    items.slice(1, 4).forEach(it => feat.appendChild(nwCard(it, d, "nw-mini glass")));

    grid.innerHTML = "";
    items.slice(4).forEach(it => grid.appendChild(nwCard(it, d, "nw-card glass")));
  }

  /* Piyasalar tahtasi: FDX.MARKETS sirasiyla sabit satirlar,
     hucre mantigi izleme listesiyle ayni (fiyat + degisim + sparkline). */
  function renderMarkets(mk) {
    const body = $("#marketsBody");
    if (!body) return;
    const err = $("#marketsError");
    if (err) {
      err.hidden = !mk.error;
      if (mk.error) err.textContent = mk.error;
    }

    // Ilk yukleme: henuz hic veri yoksa placeholder'i birak
    if (!Object.keys(mk.quotes).length) {
      if (mk.status === "error") body.innerHTML =
        '<tr><td colspan="4" class="table-empty">' + Prefs.dict().ui.serverDown + '</td></tr>';
      return;
    }

    body.innerHTML = "";
    (FDX.MARKETS || []).forEach(item => {
      const q = item.calc ? computedQuote(item, mk.quotes) : mk.quotes[item.sym];
      const tr = document.createElement("tr");

      const tdName = document.createElement("td");
      const label = document.createElement("span");
      label.textContent = item.label;
      const sym = document.createElement("span");
      sym.className = "mk-sym mono";
      sym.textContent = item.calc ? (item.note || "hesaplanan") : item.sym;
      tdName.append(label, sym);

      const tdPrice = document.createElement("td");
      tdPrice.className = "mono";
      tdPrice.style.textAlign = "right";
      const tdChange = document.createElement("td");
      tdChange.style.textAlign = "right";
      const tdSpark = document.createElement("td");
      tdSpark.style.textAlign = "right";

      if (!q) {
        tdPrice.textContent = "…";
      } else if (q.error) {
        tdPrice.textContent = "—";
        const tag = document.createElement("span");
        tag.className = "tag wait";
        tag.textContent = q.error;
        tdChange.appendChild(tag);
      } else {
        tdPrice.textContent = trNumber(q.last);
        const ch = (typeof q.changePct === "number") ? q.changePct : 0;
        const up = ch >= 0;
        const chip = document.createElement("span");
        chip.className = "watch-change " + (up ? "up" : "down");
        chip.textContent = (up ? "▲ +" : "▼ ") + trNumber(ch) + "%";
        tdChange.appendChild(chip);
        if (q.spark && q.spark.length > 1) {
          tdSpark.innerHTML = sparklineSVG(q.spark, up);
        }
      }

      tr.append(tdName, tdPrice, tdChange, tdSpark);
      body.appendChild(tr);
    });
  }

  /* Rapor arsivi: uretilen .docx'ler — indir + sil (Risk Raporu sayfasi) */
  function renderReports(rp) {
    const body = $("#reportsBody");
    if (!body) return;
    const err = $("#reportsError");
    if (err) {
      err.hidden = !rp.error;
      if (rp.error) err.textContent = rp.error;
    }

    body.innerHTML = "";
    if (!rp.items.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = '<td colspan="4" class="table-empty">' + Prefs.dict().ui.rpEmpty + '</td>';
      body.appendChild(tr);
      return;
    }

    rp.items.forEach(r => {
      const tr = document.createElement("tr");

      const tdName = document.createElement("td");
      tdName.className = "mono";
      tdName.textContent = r.name;

      const tdSize = document.createElement("td");
      tdSize.className = "mono";
      tdSize.style.textAlign = "right";
      tdSize.textContent = r.sizeKB + " KB";

      const tdDate = document.createElement("td");
      tdDate.style.textAlign = "right";
      tdDate.textContent = new Date(r.ts * 1000).toLocaleString("tr-TR",
        { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

      const tdAct = document.createElement("td");
      tdAct.style.textAlign = "right";
      const dl = document.createElement("a");
      dl.className = "hit-open";
      dl.textContent = "indir ↓";
      dl.href = FDX.CONFIG.api.baseUrl + "/reports/" + encodeURIComponent(r.name);
      dl.download = r.name;
      const del = document.createElement("button");
      del.className = "file-del";
      del.setAttribute("aria-label", r.name + " raporunu sil");
      del.textContent = "✕";
      del.style.marginLeft = "10px";
      del.addEventListener("click", () => {
        if (confirm("'" + r.name + "' arşivden kalıcı olarak silinecek. Emin misin?")) {
          FDX.api.deleteReport(r.name);
        }
      });
      tdAct.append(dl, del);

      tr.append(tdName, tdSize, tdDate, tdAct);
      body.appendChild(tr);
    });
  }

  /* Portföy: gerçek varlıklar + canlı değer/K-Z. Fiyat watchlist'ten gelir. */
  function renderPortfolio(pf) {
    const body = $("#portfolioBody");
    if (!body) return;
    const err = $("#pfError");

    let totVal = 0, totCost = 0, priced = true;
    body.innerHTML = "";

    if (!pf.holdings.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = '<td colspan="7" class="table-empty">' + Prefs.dict().pf.empty + '</td>';
      body.appendChild(tr);
    }

    pf.holdings.forEach((h, i) => {
      const q = pf.quotes[h.sym];
      const costTot = h.cost * h.qty;
      totCost += costTot;
      const last = (q && !q.error && typeof q.last === "number") ? q.last : null;
      const valTot = last !== null ? last * h.qty : null;
      if (last !== null) totVal += valTot; else priced = false;

      const tr = document.createElement("tr");
      const td = (txt, cls) => { const c = document.createElement("td");
        if (cls) c.className = cls; c.style.textAlign = "right"; c.textContent = txt; return c; };

      const tdSym = document.createElement("td");
      tdSym.className = "mono"; tdSym.textContent = h.sym;

      const tdVal = document.createElement("td");
      tdVal.className = "mono"; tdVal.style.textAlign = "right";
      const tdPnl = document.createElement("td");
      tdPnl.style.textAlign = "right";

      if (last === null) {
        tdVal.textContent = "—";
        const tag = document.createElement("span");
        tag.className = "tag wait";
        tag.textContent = q && q.error ? q.error : "fiyat yok";
        tdPnl.appendChild(tag);
      } else {
        tdVal.textContent = trNumber(valTot);
        const pnl = valTot - costTot;
        const pnlPct = costTot > 0 ? (valTot / costTot - 1) * 100 : 0;
        const up = pnl >= 0;
        const chip = document.createElement("span");
        chip.className = "watch-change " + (up ? "up" : "down");
        chip.textContent = (up ? "+" : "") + trNumber(pnl) + " (" +
                           (up ? "+" : "") + trNumber(pnlPct) + "%)";
        tdPnl.appendChild(chip);
      }

      const tdDel = document.createElement("td");
      const del = document.createElement("button");
      del.className = "file-del";
      del.setAttribute("aria-label", h.sym + " varlığını çıkar");
      del.textContent = "✕";
      del.addEventListener("click", () => FDX.api.removeHolding(i));
      tdDel.appendChild(del);

      tr.append(tdSym, td(trNumber(h.qty), "mono"), td(trNumber(h.cost), "mono"),
                td(last !== null ? trNumber(last) : "…", "mono"), tdVal, tdPnl, tdDel);
      body.appendChild(tr);
    });

    // Özet kartları
    const pnl = totVal - totCost;
    const pnlPct = totCost > 0 ? (totVal / totCost - 1) * 100 : 0;
    const setTxt = (id, t) => { const e = $("#" + id); if (e) e.textContent = t; };
    setTxt("pfValue", pf.holdings.length ? "₺" + trNumber(totVal) + (priced ? "" : " *") : "—");
    setTxt("pfValueNote", priced ? Prefs.dict().pf.totalValueNote : Prefs.dict().pf.totalValuePending);
    setTxt("pfCost", pf.holdings.length ? "₺" + trNumber(totCost) : "—");
    setTxt("pfCount", pf.holdings.length);
    const pnlEl = $("#pfPnl"), pctEl = $("#pfPnlPct");
    if (pnlEl) {
      pnlEl.textContent = pf.holdings.length ? (pnl >= 0 ? "+" : "") + "₺" + trNumber(pnl) : "—";
      pnlEl.className = "ov-value mono " + (pf.holdings.length ? (pnl >= 0 ? "up" : "down") : "");
    }
    if (pctEl) {
      pctEl.textContent = pf.holdings.length ? (pnl >= 0 ? "+" : "") + trNumber(pnlPct) + "%" : "—";
      pctEl.className = "ov-delta " + (pf.holdings.length ? (pnl >= 0 ? "up" : "down") : "");
    }
    if (err) { err.hidden = !pf.error; if (pf.error) err.textContent = pf.error; }
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
    // Groq da listelenir: sistem fiilen Groq'la kosarken satirin onu
    // gizlemesi "Claude/Gemini yok, AI nasil calisiyor?" kafasi yaratiyordu.
    line.textContent =
      "Algilanan anahtarlar - Groq: " + mark(st.groq) +
      " \u00b7 Claude: " + mark(st.claude) +
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
      st.status === "saving" ? Prefs.dict().app.btnSaving : Prefs.dict().cfg.save;

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

    // DURUSTLUK: Groq aktifken analist/hakem secimi ETKISIZ — kullaniciyi
    // "Gemini analiz ediyor" saniyor durumuna dusurme; kilitle ve soyle.
    const groqOn = !!(d.available && d.available.groq);
    const note = $("#groqNote");
    if (note) note.hidden = !groqOn;
    analystSel.disabled = groqOn;
    refereeSel.disabled = groqOn;
  }

  /* Genel Bakis kartlari: sahte portfoy rakamlari yerine GERCEK sayilar.
     history + vectordb + watchlist state'lerinden beslenir. */
  function renderOverviewCards(state) {
    const runs = $("#ovRuns"), weekly = $("#ovWeekly"),
          wNote = $("#ovWeeklyNote"), docs = $("#ovDocs"),
          dNote = $("#ovDocsNote"), watch = $("#ovWatch");
    if (!runs) return;

    const h = state.history;
    if (h.totalRuns !== null && h.totalRuns !== undefined)
      runs.textContent = h.totalRuns;
    if (h.weeklyRuns !== null && h.weeklyRuns !== undefined) {
      weekly.textContent = h.weeklyRuns;
      wNote.textContent = Prefs.dict().ov.weekLimit + (h.weeklyLimit || 600);
    }

    const st = state.vectordb.stats;
    if (st) {
      docs.textContent = st.documentCount;
      dNote.textContent = st.totalChunks + Prefs.dict().ov.chunksIndexed;
    }

    watch.textContent = state.watchlist.symbols.length;
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
    // != null: hem null hem undefined'i yakalar (eksik alan = "undefined/undefined" kazasi)
    if (h.weeklyRuns != null) {
      cycle.textContent = h.weeklyRuns + "/" + h.weeklyLimit;
      cycle.title = Prefs.dict().tip.cycleWeek + h.weeklyRuns + Prefs.dict().tip.cycleTotal + h.totalRuns;
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

  /* v0.9: N varlik icin dinamik kart uretimi (+ canli anlik fiyat) */
  function renderSimCards(metrics, quotes) {
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

      // Canli anlik fiyat + gunluk degisim (Uzmanpara gibi) — baslik altinda
      const q = quotes ? quotes[sym] : null;
      const live = document.createElement("div");
      live.className = "asset-live";
      if (q && !q.error && typeof q.last === "number") {
        const ch = (typeof q.changePct === "number") ? q.changePct : 0;
        const up = ch >= 0;
        const price = document.createElement("span");
        price.className = "live-price mono";
        price.textContent = trNumber(q.last);
        const change = document.createElement("span");
        change.className = "live-change " + (up ? "up" : "down");
        change.textContent = (up ? "▲ +" : "▼ ") + trNumber(ch) + "%";
        const tag = document.createElement("span");
        tag.className = "live-tag";
        tag.textContent = "canlı";
        live.append(price, change, tag);
      } else {
        const na = document.createElement("span");
        na.className = "live-na";
        na.textContent = "anlık fiyat yok";
        live.appendChild(na);
      }
      card.appendChild(live);

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
        ? "Şablon mod — .env'e API anahtarı (örn. ücretsiz GROQ_API_KEY) eklenince gerçek AI devreye girer"
        : "AI hatası — ham sonuçlar gösterildi");
    }
    box.textContent = bits.join("  ·  ");

    // RAG kaynaklari TIKLANABILIR: tikla -> belge o sayfada acilir (provenance)
    if (meta.ragSources && meta.ragSources.length) {
      box.appendChild(document.createTextNode("  ·  "));
      const lbl = document.createElement("span");
      lbl.textContent = "RAG kaynakları: ";
      box.appendChild(lbl);
      meta.ragSources.forEach((src, i) => {
        if (i) box.appendChild(document.createTextNode(", "));
        const { name, page } = parseSource(src);
        const link = document.createElement("button");
        link.className = "src-link";
        link.textContent = src;
        link.title = Prefs.dict().tip.openInDoc + page + ")";
        link.addEventListener("click", () => openDocViewer(name, page));
        box.appendChild(link);
      });
    }
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

    renderIndexedDocs(v.stats);
  }

  /* Eski oturumlar dahil TUM indeksli belgeler + sil dugmesi.
     Silme kalicidir (chunk'lar ChromaDB'den gider) -> onay istenir. */
  function renderIndexedDocs(stats) {
    const wrap = $("#indexedDocsWrap"), list = $("#indexedDocs");
    if (!wrap || !list) return;
    const docs = (stats && stats.documents) || [];
    wrap.hidden = docs.length === 0;
    list.innerHTML = "";
    docs.forEach(d => {
      const li = document.createElement("li");
      li.className = "file-row";

      const name = document.createElement("span");
      name.className = "file-name";
      name.textContent = d.name;

      const meta = document.createElement("span");
      meta.className = "file-meta";
      meta.textContent = d.chunks + " chunk indeksli";

      const del = document.createElement("button");
      del.className = "file-del";
      del.setAttribute("aria-label", d.name + " belgesini indeksten sil");
      del.title = Prefs.dict().tip.deleteDoc;
      del.textContent = "✕";
      del.addEventListener("click", () => {
        if (confirm("'" + d.name + "' indeksten KALICI olarak silinecek (" +
                    d.chunks + " chunk). Emin misin?")) {
          FDX.api.deleteDocument(d.name);
        }
      });

      li.append(name, meta, del);
      list.appendChild(li);
    });
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
      chip.title = (d.chunks || 0) + Prefs.dict().ov.chunksIndexed;
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
      const info = document.createElement("span");
      info.textContent = r.source + " · sayfa " + r.page + " · benzerlik " + r.score;
      // Dusuk benzerlik (< 0.5) durustce isaretlensin: sonuclar gosteriliyor
      // ama "kesin eslesme" izlenimi verilmiyor.
      if (typeof r.score === "number" && r.score < 0.5) {
        const lo = document.createElement("span");
        lo.className = "tag wait";
        lo.textContent = "düşük benzerlik";
        lo.style.marginLeft = "8px";
        info.appendChild(lo);
      }
      const open = document.createElement("button");
      open.className = "hit-open";
      open.textContent = Prefs.dict().tip.openInDocBtn;
      open.title = Prefs.dict().tip.openSide;
      open.addEventListener("click", () => openDocViewer(r.source, r.page));
      head.append(info, open);
      const body = document.createElement("p");
      body.textContent = r.text.length > 300 ? r.text.slice(0, 300) + "…" : r.text;
      div.append(head, body);
      box.appendChild(div);
    });
  }

  /* ========================================================
     KAYNAK ATIF ÇEKMECESİ (provenance) — her sayfadan açılır.
     RAG arama sonucundan VE AI yorumundaki kaynak adından çağrılır;
     belge sağ çekmecede tam ilgili sayfada gösterilir (PDF #page=N).
     .docx tarayıcıda açılamaz -> indirme önerilir.
  ======================================================== */

  async function openDocViewer(name, page) {
    const drawer = $("#provDrawer"), overlay = $("#drawerOverlay");
    const frame = $("#provDrawerFrame"), nameEl = $("#provDrawerName");
    const note = $("#provDrawerNote");
    if (!drawer) return;

    overlay.hidden = false;
    drawer.hidden = false;
    // Senkron reflow ile geçiş tetiklenir. requestAnimationFrame KULLANILMAZ:
    // tarayıcı gizli/odaksız sekmede rAF'ı durdurur -> çekmece ekran dışında kalırdı.
    void drawer.offsetWidth;
    drawer.classList.add("open");
    overlay.classList.add("open");
    nameEl.textContent = name + (page ? " · sayfa " + page : "");
    note.hidden = true;
    frame.hidden = true;
    frame.removeAttribute("src");

    const url = FDX.CONFIG.api.baseUrl + "/documents/" +
                encodeURIComponent(name) + "/file";

    if (name.toLowerCase().endsWith(".docx")) {
      note.hidden = false;
      note.innerHTML = "";
      note.appendChild(document.createTextNode(
        "Word belgeleri tarayıcıda önizlenemez. "));
      const a = document.createElement("a");
      a.href = url; a.textContent = "Belgeyi indir"; a.download = name;
      note.appendChild(a);
      return;
    }

    try {
      const head = await fetch(url, { method: "HEAD" });
      if (!head.ok) throw new Error("HTTP " + head.status);
      frame.hidden = false;
      frame.src = url + "#page=" + (page || 1);
    } catch (err) {
      note.hidden = false;
      note.textContent = "Belge dosyası sunucuda yok — bu belge önizleme " +
        "özelliğinden ÖNCE yüklenmiş. Vektör Veri Tabanı'ndan silip yeniden " +
        "yüklersen kaynak önizlemesi çalışır.";
    }
  }

  function closeDocViewer() {
    const drawer = $("#provDrawer"), overlay = $("#drawerOverlay");
    const frame = $("#provDrawerFrame");
    if (!drawer) return;
    drawer.classList.remove("open");
    overlay.classList.remove("open");
    setTimeout(() => {
      drawer.hidden = true; overlay.hidden = true;
      frame.removeAttribute("src");   // PDF belleğini bırak
    }, 260);
  }

  /* "dosya.pdf (s.3)" veya "dosya.pdf (sayfa 3)" -> {name, page} */
  function parseSource(src) {
    const m = src.match(/^(.*?)\s*\((?:s\.|sayfa)\s*(\d+)\)\s*$/i);
    if (m) return { name: m[1].trim(), page: parseInt(m[2], 10) };
    return { name: src.trim(), page: 1 };
  }

  /* ========================================================
     VERİ YEDEKLEME — portföy + izleme listesi + tercihler
     localStorage'da yaşar; tarayıcı temizliğine karşı dışa/içe aktarma.
  ======================================================== */

  const DATA_KEYS = ["fdx-portfolio", "fdx-watchlist", "fdx-theme",
                     "fdx-lang", "fdx-userag"];

  function _dataMsg(text, isErr) {
    const el = $("#dataMsg");
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.style.color = isErr ? "" : "var(--green, #4ade80)";
  }

  function exportData() {
    const payload = { app: "FinDatalytix", kind: "backup", version: 1,
                      exportedAt: new Date().toISOString(), data: {} };
    DATA_KEYS.forEach(k => {
      const v = localStorage.getItem(k);
      if (v !== null) payload.data[k] = v;
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "findatalytix-yedek-" +
      new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    _dataMsg("Yedek indirildi ✓ (güvenli bir yerde sakla).", false);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try { parsed = JSON.parse(reader.result); }
      catch (e) { _dataMsg("Dosya okunamadı — geçerli bir JSON değil.", true); return; }
      if (!parsed || parsed.app !== "FinDatalytix" || !parsed.data) {
        _dataMsg("Bu bir FinDatalytix yedeği değil.", true); return;
      }
      const keys = Object.keys(parsed.data).filter(k => DATA_KEYS.includes(k));
      if (!keys.length) { _dataMsg("Yedekte tanınan veri yok.", true); return; }
      if (!confirm("Bu yedek, mevcut portföy/izleme listesi/tercihlerinin " +
                   "ÜZERİNE yazacak. Devam edilsin mi?")) return;
      try {
        keys.forEach(k => localStorage.setItem(k, parsed.data[k]));
      } catch (e) { _dataMsg("Yazılamadı (tarayıcı izni?).", true); return; }
      _dataMsg("İçe aktarıldı ✓ — sayfa yenileniyor…", false);
      setTimeout(() => location.reload(), 900);
    };
    reader.onerror = () => _dataMsg("Dosya okunamadı.", true);
    reader.readAsText(file);
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
        shareBtn.title = Prefs.dict().tip.shareCopied;
        setTimeout(() => {
          shareBtn.classList.remove("ok");
          shareBtn.title = Prefs.dict().tip.share;
        }, 1600);
      } catch (err) {
        shareBtn.title = Prefs.dict().tip.shareBlocked;
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

    /* ---- Portfoy: varlik ekle ---- */
    const pfAddBtn = $("#pfAddBtn");
    if (pfAddBtn) {
      const addPf = () => {
        const errBox = $("#pfError");
        const msg = FDX.api.addHolding($("#pfSym").value, $("#pfQty").value, $("#pfCostIn").value);
        if (msg) {
          if (errBox) { errBox.hidden = false; errBox.textContent = msg; }
        } else {
          if (errBox) errBox.hidden = true;
          $("#pfSym").value = ""; $("#pfQty").value = ""; $("#pfCostIn").value = "";
          $("#pfSym").focus();
        }
      };
      pfAddBtn.addEventListener("click", addPf);
      ["pfSym", "pfQty", "pfCostIn"].forEach(id => {
        const el = $("#" + id);
        if (el) el.addEventListener("keydown", e => { if (e.key === "Enter") addPf(); });
      });
    }

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

    /* ---- Veri yedekleme (Ayarlar) ---- */
    const expBtn = $("#exportBtn"), impBtn = $("#importBtn"), impFile = $("#importFile");
    if (expBtn) expBtn.addEventListener("click", exportData);
    if (impBtn && impFile) {
      impBtn.addEventListener("click", () => impFile.click());
      impFile.addEventListener("change", () => {
        if (impFile.files.length) importData(impFile.files[0]);
        impFile.value = "";
      });
    }

    /* ---- Kaynak atif cekmecesi: kapatma (buton + overlay + Esc) ---- */
    const dvClose = $("#provDrawerClose");
    if (dvClose) dvClose.addEventListener("click", closeDocViewer);
    const ovl = $("#drawerOverlay");
    if (ovl) ovl.addEventListener("click", closeDocViewer);
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        const d = $("#provDrawer");
        if (d && !d.hidden) closeDocViewer();
      }
    });

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
