/* WealthEffect — investment growth calculator with tracker overlay.
 * No build step. Chart.js is loaded from a CDN in index.html.
 */
(() => {
  "use strict";

  // ------------------------------------------------------------------
  // Asset-class presets. Returns are expected annual (compound) returns;
  // volatility is annual standard deviation. These are editable defaults,
  // not forecasts. See README for sources.
  // ------------------------------------------------------------------
  const PRESETS = [
    { id: "hysa",     name: "High-yield savings", rate: 4.0,  vol: 0,   compound: "365",
      note: "Variable rate set by the bank. Top online accounts paid roughly 4.2–4.4% APY in 2026; the FDIC national average savings rate is about 0.38%. FDIC-insured, no market risk." },
    { id: "cd",       name: "Certificate of deposit", rate: 4.0, vol: 0, compound: "365",
      note: "Rate locked for the term. Early withdrawal usually costs a penalty. Re-check rates at renewal." },
    { id: "tbills",   name: "Treasury bills",     rate: 3.3,  vol: 1,   compound: "12",
      note: "Short-term U.S. government debt. Long-run average ≈3.3%/yr since 1928 (NYU Stern / Damodaran). Interest is state-tax-free." },
    { id: "treasury", name: "10-yr Treasuries",   rate: 4.5,  vol: 7.5, compound: "12",
      note: "Long-run average ≈4.5–5%/yr since 1928 with meaningful price swings when rates move (NYU Stern / Damodaran)." },
    { id: "bondfund", name: "Total bond fund",    rate: 4.5,  vol: 5.5, compound: "12",
      note: "Blend of government and investment-grade corporate bonds. Approximate long-run assumption." },
    { id: "corp",     name: "Corporate bonds",    rate: 5.5,  vol: 8,   compound: "12",
      note: "Higher yield than Treasuries in exchange for default risk. Approximate long-run assumption." },
    { id: "stocks",   name: "U.S. stock index",   rate: 10,   vol: 16,  compound: "12",
      note: "S&P 500 compound return ≈10%/yr since 1928 (nominal, dividends reinvested), but with large drawdowns — see the risk range." },
    { id: "intl",     name: "International stocks", rate: 7,  vol: 17,  compound: "12",
      note: "Developed + emerging markets ex-U.S. Approximate assumption; history varies widely by period." },
    { id: "growth",   name: "Growth / tech stocks", rate: 11, vol: 24,  compound: "12",
      note: "Concentrated, higher-volatility equity. Approximate assumption — outcomes are very wide." },
    { id: "custom",   name: "Custom",             rate: null, vol: null, compound: null,
      note: "Your own return and volatility assumptions." },
  ];
  const MIX_PARTS = {
    stocks: { rate: 10, vol: 16 },
    bonds:  { rate: 4.5, vol: 6 },
    cash:   { rate: 4.0, vol: 0.5 },
  };
  const CORR_STOCK_BOND = 0.1;
  const COMPARE_COLORS = ["#7c3aed", "#0891b2", "#ca8a04", "#db2777", "#16a34a", "#9333ea", "#0d9488", "#b45309", "#64748b"];
  const MC_PATHS = 500;
  const STORE_PLAN = "wealtheffect.plan.v1";
  const STORE_TRACK = "wealtheffect.tracker.v1";

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const num = (id, fallback = 0) => {
    const v = parseFloat($(id).value);
    return Number.isFinite(v) ? v : fallback;
  };
  const money = (v, digits = 0) =>
    (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const compact = (v) => {
    const a = Math.abs(v);
    if (a >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
    return money(v);
  };
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const MS_PER_MONTH = 365.2425 / 12 * 86400000;

  // Seeded RNG so the risk band doesn't jitter on every keystroke.
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gaussian(rand) {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  let mode = "preset";          // "preset" | "mix"
  let presetId = "stocks";
  let schedMode = "year";
  let tracker = store.get(STORE_TRACK) || [];
  let chart = null;
  let last = null;              // last computed result

  // ------------------------------------------------------------------
  // Core math
  // ------------------------------------------------------------------
  /** Effective monthly growth factor for a nominal annual rate & compounding. */
  function monthlyRate(annualPct, compound) {
    const r = annualPct / 100;
    if (compound === "cont") return Math.exp(r / 12) - 1;
    const n = parseInt(compound, 10) || 12;
    return Math.pow(1 + r / n, n / 12) - 1;
  }

  function readPlan() {
    const grossRate = num("rate");
    const fee = num("fee");
    const tax = Math.min(Math.max(num("tax"), 0), 100) / 100;
    // Tax applies to growth; fee is a straight annual drag.
    const netRate = grossRate * (1 - tax) - fee;
    return {
      start: Math.max(num("startAmount"), 0),
      years: Math.min(Math.max(Math.round(num("years", 25)), 1), 60),
      contrib: Math.max(num("contrib"), 0),
      freq: $("contribFreq").value,
      timing: $("timing").value,
      growth: num("contribGrowth") / 100,
      compound: $("compound").value,
      grossRate, fee, tax, netRate,
      vol: Math.max(num("vol"), 0),
      inflation: num("inflation") / 100,
      startDate: $("startDate").value || defaultStartMonth(),
    };
  }

  /** Deterministic month-by-month projection. */
  function project(p, ratePct = p.netRate) {
    const N = p.years * 12;
    const i = monthlyRate(ratePct, p.compound);
    const bal = new Float64Array(N + 1);
    const dep = new Float64Array(N + 1);
    bal[0] = p.start; dep[0] = p.start;
    let b = p.start, d = p.start;
    for (let m = 1; m <= N; m++) {
      const c = contributionFor(p, m);
      if (p.timing === "begin") { b += c; b *= 1 + i; }
      else { b *= 1 + i; b += c; }
      d += c;
      bal[m] = b; dep[m] = d;
    }
    return { bal, dep };
  }

  function contributionFor(p, m) {
    const yearIdx = Math.floor((m - 1) / 12);
    const amt = p.contrib * Math.pow(1 + p.growth, yearIdx);
    if (p.freq === "month") return amt;
    // yearly: deposit once a year, in the first or last month of the year
    const monthInYear = (m - 1) % 12;
    if (p.timing === "begin") return monthInYear === 0 ? amt : 0;
    return monthInYear === 11 ? amt : 0;
  }

  /** Monte Carlo percentile bands (10th / 50th / 90th) using lognormal monthly returns. */
  function simulate(p) {
    const N = p.years * 12;
    if (p.vol <= 0) return null;
    const meanMonthly = Math.log(1 + monthlyRate(p.netRate, p.compound));
    const sdMonthly = (p.vol / 100) / Math.sqrt(12);
    // mean of log return set so the *median* path equals the deterministic line
    const rand = mulberry32(1234567);
    const paths = Array.from({ length: N + 1 }, () => new Float64Array(MC_PATHS));
    for (let k = 0; k < MC_PATHS; k++) {
      let b = p.start;
      paths[0][k] = b;
      for (let m = 1; m <= N; m++) {
        const g = Math.exp(meanMonthly + sdMonthly * gaussian(rand));
        const c = contributionFor(p, m);
        if (p.timing === "begin") { b += c; b *= g; } else { b *= g; b += c; }
        paths[m][k] = b;
      }
    }
    const pct = (arr, q) => {
      const s = Array.from(arr).sort((a, b) => a - b);
      const idx = (s.length - 1) * q, lo = Math.floor(idx), hi = Math.ceil(idx);
      return s[lo] + (s[hi] - s[lo]) * (idx - lo);
    };
    const p10 = new Float64Array(N + 1), p90 = new Float64Array(N + 1);
    let lossProb = 0;
    for (let m = 0; m <= N; m++) {
      p10[m] = pct(paths[m], 0.1);
      p90[m] = pct(paths[m], 0.9);
    }
    // chance of ending below total deposits
    const deposits = project(p).dep[N];
    for (let k = 0; k < MC_PATHS; k++) if (paths[N][k] < deposits) lossProb++;
    return { p10, p90, lossProb: lossProb / MC_PATHS };
  }

  function startMs(p) {
    const [y, mo] = p.startDate.split("-").map(Number);
    return new Date(y, (mo || 1) - 1, 1).getTime();
  }
  function monthToDate(p, m) {
    const [y, mo] = p.startDate.split("-").map(Number);
    return new Date(y, (mo || 1) - 1 + m, 1);
  }
  function defaultStartMonth() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  const deflator = (p, m) => Math.pow(1 + p.inflation, m / 12);

  function interp(arr, x) {
    if (x <= 0) return arr[0];
    if (x >= arr.length - 1) return arr[arr.length - 1];
    const lo = Math.floor(x), f = x - lo;
    return arr[lo] + (arr[lo + 1] - arr[lo]) * f;
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  function compute() {
    const p = readPlan();
    const base = project(p);
    const sim = $("showBands").checked ? simulate(p) : null;
    const real = $("showReal").checked;
    last = { p, base, sim, real };
    savePlan();
    renderStats();
    renderChart();
    renderSchedule();
    renderTracker();
  }

  function renderStats() {
    const { p, base, sim, real } = last;
    const N = p.years * 12;
    const end = base.bal[N], deps = base.dep[N];
    const endReal = end / deflator(p, N);
    const tiles = [
      { k: "End balance", v: compact(end), s: `${money(end)} in ${monthToDate(p, N).getFullYear()}`, hero: true },
      { k: "In today's dollars", v: compact(endReal), s: `at ${(p.inflation * 100).toFixed(1)}% inflation` },
      { k: "You put in", v: compact(deps), s: `${money(p.start)} start + ${compact(deps - p.start)} added` },
      { k: "Growth earned", v: compact(end - deps), s: `${deps > 0 ? ((end / deps - 1) * 100).toFixed(0) : 0}% on deposits` },
      { k: "Net return", v: p.netRate.toFixed(2) + "%", s: `${p.grossRate}% gross${p.fee ? ` − ${p.fee}% fee` : ""}${p.tax ? ` − ${(p.tax * 100).toFixed(0)}% tax` : ""}` },
    ];
    if (sim) {
      tiles.push({ range: true, k: "Likely range (10–90%)", v: `${compact(sim.p10[N])}–${compact(sim.p90[N])}`,
        s: `${(sim.lossProb * 100).toFixed(0)}% chance of ending below deposits` });
    }
    if (real) tiles[0].s += " (nominal)";
    $("stats").innerHTML = tiles.map((t) =>
      `<div class="stat${t.hero ? " hero" : ""}${t.range ? " range" : ""}"><div class="k">${t.k}</div><div class="v">${t.v}</div><div class="s">${t.s}</div></div>`
    ).join("");
  }

  function datasetSeries(arr, p, real) {
    const out = new Array(arr.length);
    for (let m = 0; m < arr.length; m++) out[m] = { x: m, y: real ? arr[m] / deflator(p, m) : arr[m] };
    return out;
  }

  function renderChart() {
    const { p, base, sim, real } = last;
    const N = p.years * 12;
    const accent = cssVar("--accent"), contribC = cssVar("--contrib"), actualC = cssVar("--actual");
    const accentSoft = cssVar("--accent-soft"), textMuted = cssVar("--muted"), grid = cssVar("--border");

    const datasets = [];
    if (sim) {
      datasets.push({ label: "10th percentile", data: datasetSeries(sim.p10, p, real), borderWidth: 0, pointRadius: 0, fill: false, order: 5, _band: true });
      datasets.push({ label: "90th percentile", data: datasetSeries(sim.p90, p, real), borderWidth: 0, pointRadius: 0, fill: "-1", backgroundColor: accentSoft, order: 5, _band: true });
    }
    if ($("compareAll").checked) {
      PRESETS.filter((x) => x.rate != null).forEach((pr, idx) => {
        if (mode === "preset" && pr.id === presetId) return;
        const r = pr.rate * (1 - p.tax) - p.fee;
        const cp = Object.assign({}, p, { compound: pr.compound });
        datasets.push({
          label: pr.name, data: datasetSeries(project(cp, r).bal, p, real),
          borderColor: COMPARE_COLORS[idx % COMPARE_COLORS.length], borderWidth: 1.25, pointRadius: 0, borderDash: [2, 3], order: 4, _compare: true,
        });
      });
    }
    datasets.push({ label: "Total deposits", data: datasetSeries(base.dep, p, real), borderColor: contribC, borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0, order: 3 });
    datasets.push({ label: "Projected balance", data: datasetSeries(base.bal, p, real), borderColor: accent, borderWidth: 2.5, pointRadius: 0, order: 2 });

    const actualPts = trackerPoints(p, real);
    if (actualPts.length) {
      datasets.push({
        label: "Your actual balance", data: actualPts, borderColor: actualC, backgroundColor: actualC,
        borderWidth: 2, pointRadius: 4.5, pointHoverRadius: 6, tension: 0, order: 1, _actual: true,
      });
    }

    // legend
    const leg = [
      `<span><i style="background:${accent}"></i>Projected</span>`,
      `<span><i style="background:${contribC}"></i>Deposits</span>`,
    ];
    if (sim) leg.push(`<span><i class="band" style="background:${accent}"></i>10–90% range</span>`);
    if (actualPts.length) leg.push(`<span><i class="dot" style="background:${actualC}"></i>Your tracker</span>`);
    if ($("compareAll").checked) {
      datasets.filter((d) => d._compare).forEach((d) =>
        leg.push(`<span><i style="background:repeating-linear-gradient(90deg,${d.borderColor} 0 3px,transparent 3px 5px)"></i>${d.label}</span>`));
    }
    $("legend").innerHTML = leg.join("");
    $("chartTitle").textContent = real ? "Projected growth (today's dollars)" : "Projected growth";
    $("chartFoot").textContent =
      `${describeAsset()} · ${p.netRate.toFixed(2)}% net/yr` +
      (sim ? ` · shaded band = 10th–90th percentile of ${MC_PATHS} simulated markets at ${p.vol}% volatility` : "") +
      (p.vol === 0 ? " · no market risk modeled" : "");

    const startYear = monthToDate(p, 0).getFullYear();
    const startMonth = monthToDate(p, 0).getMonth();
    const yStep = p.years <= 10 ? 1 : p.years <= 25 ? 5 : 10;

    const options = {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      interaction: { mode: "nearest", axis: "x", intersect: false },
      parsing: false, normalized: true,
      scales: {
        x: {
          type: "linear", min: 0, max: N,
          grid: { color: (ctx) => (ctx.tick && ctx.tick.value % (12 * yStep) === 0 ? grid : "transparent"), drawTicks: false },
          border: { color: grid },
          ticks: {
            color: textMuted, padding: 6, autoSkip: false, maxRotation: 0,
            stepSize: 12,
            callback: (v) => {
              if (v % 12 !== 0) return "";
              const yr = v / 12;
              if (yr !== 0 && yr % yStep !== 0 && yr !== p.years) return "";
              return startYear + yr;
            },
          },
        },
        y: {
          beginAtZero: true, grid: { color: grid, drawTicks: false }, border: { display: false },
          ticks: { color: textMuted, padding: 8, callback: (v) => compact(v) },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: (item) => !item.dataset._band,
          itemSort: (a, b) => b.parsed.y - a.parsed.y,
          callbacks: {
            title: (items) => {
              if (!items.length) return "";
              const it = items[0];
              if (it.dataset._actual) return it.raw.label;
              const d = new Date(startYear, startMonth + Math.round(it.parsed.x), 1);
              return d.toLocaleDateString("en-US", { month: "short", year: "numeric" }) + ` · year ${(it.parsed.x / 12).toFixed(1)}`;
            },
            label: (it) => {
              let s = ` ${it.dataset.label}: ${money(it.parsed.y)}`;
              if (it.dataset._actual && it.raw.diff != null) {
                s += `  (${it.raw.diff >= 0 ? "+" : ""}${money(it.raw.diff)} vs plan)`;
              }
              return s;
            },
            afterBody: (items) => {
              if (!sim || !items.length || items[0].dataset._actual) return "";
              const m = Math.round(items[0].parsed.x);
              const f = real ? deflator(p, m) : 1;
              return `10–90% range: ${compact(sim.p10[m] / f)} – ${compact(sim.p90[m] / f)}`;
            },
          },
        },
      },
    };

    if (chart) {
      chart.data.datasets = datasets;
      chart.options = options;
      chart.update();
    } else {
      chart = new Chart($("chart"), { type: "line", data: { datasets }, options });
    }
  }

  function trackerPoints(p, real) {
    const s = startMs(p);
    return tracker
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => {
        const t = new Date(e.date + "T00:00:00").getTime();
        const x = (t - s) / MS_PER_MONTH;
        const f = real ? deflator(p, Math.max(x, 0)) : 1;
        const planned = interp(last.base.bal, x);
        return {
          x, y: e.balance / f,
          diff: x >= 0 && x <= p.years * 12 ? (e.balance - planned) / f : null,
          label: new Date(e.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + (e.note ? ` · ${e.note}` : ""),
        };
      });
  }

  function describeAsset() {
    if (mode === "mix") {
      return `Mix ${$("mixStocks").value}/${$("mixBonds").value}/${$("mixCash").value} stocks/bonds/cash`;
    }
    return PRESETS.find((x) => x.id === presetId).name;
  }

  function renderSchedule() {
    const { p, base, real } = last;
    const N = p.years * 12;
    const rows = [];
    const step = schedMode === "year" ? 12 : 1;
    for (let m = step; m <= N; m += step) {
      const prev = m - step;
      const deposit = base.dep[m] - base.dep[prev];
      const growth = base.bal[m] - base.bal[prev] - deposit;
      const f = real ? deflator(p, m) : 1;
      const d = monthToDate(p, m - 1);
      rows.push({
        label: schedMode === "year" ? String(m / 12) : d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        period: schedMode === "year" ? d.getFullYear() : "",
        deposit, growth, total: base.dep[m], bal: base.bal[m] / f,
      });
    }
    last.schedRows = rows;
    const head = schedMode === "year"
      ? "<tr><th>Year</th><th>Cal. year</th><th>Deposits</th><th>Growth</th><th>Total deposited</th><th>Ending balance</th></tr>"
      : "<tr><th>Month</th><th></th><th>Deposits</th><th>Growth</th><th>Total deposited</th><th>Ending balance</th></tr>";
    $("schedTable").innerHTML = "<thead>" + head + "</thead><tbody>" + rows.map((r) =>
      `<tr><td>${r.label}</td><td>${r.period}</td><td>${money(r.deposit, 2)}</td><td>${money(r.growth, 2)}</td><td>${money(r.total, 2)}</td><td>${money(r.bal, 2)}</td></tr>`
    ).join("") + "</tbody>";
  }

  function renderTracker() {
    const { p } = last;
    const pts = trackerPoints(p, false);
    const sorted = tracker.map((e, i) => ({ e, i })).sort((a, b) => b.e.date.localeCompare(a.e.date));
    const list = $("trackList");
    if (!sorted.length) {
      list.innerHTML = `<li class="empty">No entries yet. Add your current balance to see it on the chart.</li>`;
    } else {
      // pts is ascending by date; build a lookup by date+balance
      const diffBy = new Map(pts.map((pt, k) => [k, pt.diff]));
      const asc = tracker.slice().sort((a, b) => a.date.localeCompare(b.date));
      list.innerHTML = sorted.map(({ e, i }) => {
        const k = asc.indexOf(e);
        const diff = diffBy.get(k);
        const diffHtml = diff == null ? `<span class="diff muted">outside plan</span>`
          : `<span class="diff ${diff >= 0 ? "up" : "down"}">${diff >= 0 ? "▲" : "▼"} ${compact(Math.abs(diff))}</span>`;
        return `<li><div><div class="b">${money(e.balance, 2)}</div><div class="d">${escapeHtml(e.date)}${e.note ? " · " + escapeHtml(e.note) : ""}</div></div>${diffHtml}<button class="x" data-del="${i}" aria-label="Delete entry">×</button></li>`;
      }).join("");
    }

    // Pace summary from the latest in-range entry
    const inRange = pts.filter((pt) => pt.diff != null);
    const pace = $("pace");
    if (!inRange.length) { pace.innerHTML = ""; return; }
    const latest = inRange[inRange.length - 1];
    const planned = latest.y - latest.diff;
    const pctOff = planned > 0 ? (latest.diff / planned) * 100 : 0;
    const ahead = latest.diff >= 0;
    // Simple "on pace for": scale remaining plan by current ratio applied to today's balance
    const N = p.years * 12;
    const remaining = project(Object.assign({}, p, { start: latest.y, years: Math.max(p.years - Math.floor(latest.x / 12), 1) }));
    const onPace = remaining.bal[remaining.bal.length - 1];
    pace.innerHTML =
      `<div>You're <b class="${ahead ? "up" : "down"}">${compact(Math.abs(latest.diff))} ${ahead ? "ahead of" : "behind"}</b> plan ` +
      `(${pctOff >= 0 ? "+" : ""}${pctOff.toFixed(1)}%).</div>` +
      `<div class="muted" style="margin:4px 0 0">From your latest balance, the plan's assumptions reach about <b>${compact(onPace)}</b> by ${monthToDate(p, N).getFullYear()}.</div>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ------------------------------------------------------------------
  // Asset selection UI
  // ------------------------------------------------------------------
  function renderAssetGrid() {
    $("assetGrid").innerHTML = PRESETS.map((pr) =>
      `<button type="button" class="asset-btn${pr.id === presetId ? " active" : ""}" data-preset="${pr.id}">
        <b>${pr.name}</b><em>${pr.rate == null ? "your numbers" : `${pr.rate}% · ${pr.vol ? `±${pr.vol}%` : "no risk"}`}</em>
      </button>`
    ).join("");
    $("assetNote").textContent = PRESETS.find((x) => x.id === presetId).note;
  }

  function applyPreset(id) {
    presetId = id;
    const pr = PRESETS.find((x) => x.id === id);
    if (pr.rate != null) {
      $("rate").value = pr.rate;
      $("vol").value = pr.vol;
      $("compound").value = pr.compound;
    }
    renderAssetGrid();
  }

  function applyMix() {
    const w = { stocks: +$("mixStocks").value / 100, bonds: +$("mixBonds").value / 100, cash: +$("mixCash").value / 100 };
    const r = w.stocks * MIX_PARTS.stocks.rate + w.bonds * MIX_PARTS.bonds.rate + w.cash * MIX_PARTS.cash.rate;
    const s = MIX_PARTS.stocks.vol / 100, b = MIX_PARTS.bonds.vol / 100, c = MIX_PARTS.cash.vol / 100;
    const variance = (w.stocks * s) ** 2 + (w.bonds * b) ** 2 + (w.cash * c) ** 2
      + 2 * w.stocks * w.bonds * s * b * CORR_STOCK_BOND;
    $("rate").value = r.toFixed(2);
    $("vol").value = (Math.sqrt(variance) * 100).toFixed(1);
    $("compound").value = "12";
    ["Stocks", "Bonds", "Cash"].forEach((k) => { $("mix" + k + "Val").textContent = $("mix" + k).value + "%"; });
    $("mixNote").textContent =
      `Blended from stocks ${MIX_PARTS.stocks.rate}% (±${MIX_PARTS.stocks.vol}%), bonds ${MIX_PARTS.bonds.rate}% (±${MIX_PARTS.bonds.vol}%), cash ${MIX_PARTS.cash.rate}%, ` +
      `assuming a ${CORR_STOCK_BOND} stock–bond correlation. Diversification lowers volatility below the weighted average.`;
  }

  /** Keep the three sliders summing to 100 by rebalancing the other two proportionally. */
  function rebalance(changed) {
    const keys = ["mixStocks", "mixBonds", "mixCash"];
    const others = keys.filter((k) => k !== changed);
    const target = 100 - +$(changed).value;
    const sumOthers = others.reduce((a, k) => a + +$(k).value, 0);
    if (sumOthers === 0) {
      others.forEach((k) => { $(k).value = target / 2; });
    } else {
      let acc = 0;
      others.forEach((k, idx) => {
        const v = idx === others.length - 1 ? target - acc : Math.round(+$(k).value / sumOthers * target);
        $(k).value = v; acc += v;
      });
    }
  }

  function setMode(m) {
    mode = m;
    document.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
    $("presetBox").hidden = m !== "preset";
    $("mixBox").hidden = m !== "mix";
    if (m === "mix") applyMix(); else applyPreset(presetId);
  }

  // ------------------------------------------------------------------
  // Persistence
  // ------------------------------------------------------------------
  const PLAN_FIELDS = ["startAmount", "startDate", "years", "contrib", "contribFreq", "timing", "contribGrowth",
    "rate", "vol", "compound", "fee", "tax", "inflation", "mixStocks", "mixBonds", "mixCash"];
  const TOGGLES = ["showReal", "showBands", "compareAll"];

  function savePlan() {
    const data = { mode, presetId };
    PLAN_FIELDS.forEach((f) => { data[f] = $(f).value; });
    TOGGLES.forEach((f) => { data[f] = $(f).checked; });
    store.set(STORE_PLAN, data);
  }
  function loadPlan() {
    const data = store.get(STORE_PLAN);
    $("startDate").value = defaultStartMonth();
    if (!data) return false;
    PLAN_FIELDS.forEach((f) => { if (data[f] != null && data[f] !== "") $(f).value = data[f]; });
    TOGGLES.forEach((f) => { if (typeof data[f] === "boolean") $(f).checked = data[f]; });
    if (data.presetId && PRESETS.some((x) => x.id === data.presetId)) presetId = data.presetId;
    mode = data.mode === "mix" ? "mix" : "preset";
    return true;
  }
  function saveTracker() { store.set(STORE_TRACK, tracker); }

  // ------------------------------------------------------------------
  // CSV
  // ------------------------------------------------------------------
  function download(name, text) {
    const blob = new Blob([text], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const csvCell = (v) => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);

  function parseCsv(text) {
    const rows = [];
    let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ""));
  }

  // ------------------------------------------------------------------
  // Wire up
  // ------------------------------------------------------------------
  function init() {
    const hadSaved = loadPlan();
    $("tDate").value = new Date().toISOString().slice(0, 10);
    if (!hadSaved) applyPreset(presetId);
    setMode(mode);
    if (hadSaved && mode === "preset") {
      // restore any custom rate edits made on top of the preset
      const data = store.get(STORE_PLAN);
      ["rate", "vol", "compound"].forEach((f) => { if (data[f] != null) $(f).value = data[f]; });
    }

    let timer = null;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(compute, 120); };

    document.querySelectorAll("#planPanel input, #planPanel select").forEach((el) => {
      if (el.type === "range") return;
      el.addEventListener("input", () => {
        if (["rate", "vol"].includes(el.id) && (mode === "mix" || presetId !== "custom")) {
          // Manual edit: switch to "Custom" without overwriting the typed value.
          mode = "preset"; presetId = "custom";
          document.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === "preset"));
          $("presetBox").hidden = false; $("mixBox").hidden = true;
          renderAssetGrid();
        }
        schedule();
      });
    });
    ["mixStocks", "mixBonds", "mixCash"].forEach((id) => {
      $(id).addEventListener("input", () => { rebalance(id); applyMix(); schedule(); });
    });
    TOGGLES.forEach((id) => $(id).addEventListener("change", compute));

    $("assetGrid").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-preset]");
      if (!btn) return;
      applyPreset(btn.dataset.preset);
      compute();
    });
    document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { setMode(b.dataset.mode); compute(); }));
    document.querySelectorAll("[data-sched]").forEach((b) => b.addEventListener("click", () => {
      schedMode = b.dataset.sched;
      document.querySelectorAll("[data-sched]").forEach((x) => x.classList.toggle("active", x === b));
      renderSchedule();
    }));

    $("trackForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const date = $("tDate").value, balance = parseFloat($("tBal").value);
      if (!date || !Number.isFinite(balance)) return;
      tracker.push({ date, balance, note: $("tNote").value.trim() });
      saveTracker();
      $("tBal").value = ""; $("tNote").value = "";
      compute();
    });
    $("trackList").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-del]");
      if (!btn) return;
      tracker.splice(+btn.dataset.del, 1);
      saveTracker(); compute();
    });
    $("clearTrack").addEventListener("click", () => {
      if (!tracker.length || !confirm("Delete all tracker entries?")) return;
      tracker = []; saveTracker(); compute();
    });
    $("exportTrack").addEventListener("click", () => {
      const lines = ["date,balance,note", ...tracker.slice().sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => [e.date, e.balance, e.note || ""].map(csvCell).join(","))];
      download("wealtheffect-tracker.csv", lines.join("\n"));
    });
    $("importTrack").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const rows = parseCsv(await file.text());
      let added = 0;
      rows.forEach((r) => {
        const date = (r[0] || "").trim(), balance = parseFloat(String(r[1] || "").replace(/[$,]/g, ""));
        if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(balance)) {
          tracker.push({ date, balance, note: (r[2] || "").trim().slice(0, 60) }); added++;
        }
      });
      e.target.value = "";
      saveTracker(); compute();
      alert(added ? `Imported ${added} entr${added === 1 ? "y" : "ies"}.` : "No rows found. Expected columns: date (YYYY-MM-DD), balance, note.");
    });
    $("exportSched").addEventListener("click", () => {
      const rows = last.schedRows || [];
      const lines = [[schedMode === "year" ? "year" : "month", "calendar_year", "deposits", "growth", "total_deposited", "ending_balance"].join(","),
        ...rows.map((r) => [r.label, r.period, r.deposit.toFixed(2), r.growth.toFixed(2), r.total.toFixed(2), r.bal.toFixed(2)].map(csvCell).join(","))];
      download(`wealtheffect-schedule-${schedMode}.csv`, lines.join("\n"));
    });

    // Redraw chart colors when the OS theme flips.
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { if (chart) { chart.destroy(); chart = null; } compute(); });

    compute();
  }

  // Exposed for tests.
  window.WealthEffect = { monthlyRate, project, readPlan };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
