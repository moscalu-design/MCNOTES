const COLORS = {
  AFS: "#376996",
  GNG: "#2a9d8f",
  OTHER: "#c1666b",
  PIN: "#b88a2c",
  Manual: "#c1666b",
  Automated: "#2a9d8f",
  neutral: "#607080",
  grid: "#dce3eb",
  ink: "#17212b",
};

const DEPARTMENTS = [
  "OPS",
  "GLO",
  "PJ",
  "RM",
  "OCCO",
  "JU",
  "ECON",
  "CFC",
  "EIF",
  "FI",
  "IG",
  "PMM",
  "SG",
  "GIS",
  "HR",
  "OTHER",
];

const state = {
  raw: null,
  records: [],
  filtered: [],
  selectedTemplates: new Set(),
  selectedExtractions: new Set(),
  batch: "All",
  ged: "All",
  dateFrom: "",
  dateTo: "",
  search: "",
  hideFutureDates: false,
  onlyQualityIssues: false,
  serviceFocus: "",
  view: "overview",
  distributionMetric: "Text Before Opinions",
  batchSort: "documents",
  recordSort: "words-desc",
  testDetail: "all-warnings",
  serviceWindow: "all",
  serviceMomentumMetric: "coverage",
  authorMinDocs: 10,
  page: 1,
  pageSize: 40,
};

const $ = (id) => document.getElementById(id);
const fmtInt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const fmtOne = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const fmtPct = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function n(value) {
  const out = Number(value);
  return Number.isFinite(out) ? out : 0;
}

function mean(values) {
  const clean = values.map(Number).filter(Number.isFinite);
  return clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : 0;
}

function quantile(values, q) {
  const clean = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const pos = (clean.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (clean[base + 1] === undefined) return clean[base];
  return clean[base] + rest * (clean[base + 1] - clean[base]);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function formatDate(value) {
  return value || "No date";
}

function shortLabel(value, max = 28) {
  const text = String(value ?? "Missing");
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function templateColor(template) {
  return COLORS[template] || COLORS.neutral;
}

function hasQualityIssue(row) {
  return Boolean(
    row["Has Missing Date"] ||
      row["Is Future Date"] ||
      row["Has Missing GED"] ||
      row["Annex Page Count"] === null ||
      row["Annex Page Count"] === undefined
  );
}

function qualityFlags(row) {
  const flags = [];
  if (row["Has Missing Date"]) flags.push("Missing date");
  if (row["Is Future Date"]) flags.push("Future date");
  if (row["Has Missing GED"]) flags.push("Missing GED");
  if (row["Annex Page Count"] === null || row["Annex Page Count"] === undefined) {
    flags.push("Missing annex");
  }
  return flags;
}

function makeSvg(container, width = 900, height = 320) {
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img"></svg>`;
  return container.querySelector("svg");
}

function empty(container, text = "No records match the current filters.") {
  container.innerHTML = `<div class="empty-state">${escapeHtml(text)}</div>`;
}

function tooltip(html, event) {
  const tip = $("tooltip");
  tip.innerHTML = html;
  tip.style.left = `${event.clientX}px`;
  tip.style.top = `${event.clientY}px`;
  tip.classList.add("visible");
}

function hideTooltip() {
  $("tooltip").classList.remove("visible");
}

function groupBy(rows, keyFn) {
  const map = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return map;
}

function summarize(rows) {
  const docs = rows.length;
  const words = rows.reduce((sum, row) => sum + n(row["Text Before Opinions"]), 0);
  const pages = rows.reduce((sum, row) => sum + n(row["Document Page Count"]), 0);
  const manual = rows.filter((row) => row.Extraction === "Manual").length;
  const future = rows.filter((row) => row["Is Future Date"]).length;
  const quality = rows.filter(hasQualityIssue).length;
  const dates = rows.map((row) => row["Validation Date"]).filter(Boolean).sort();
  return {
    docs,
    words,
    pages,
    manual,
    future,
    quality,
    meanWords: mean(rows.map((row) => row["Text Before Opinions"])),
    medianWords: quantile(rows.map((row) => row["Text Before Opinions"]), 0.5),
    meanPages: mean(rows.map((row) => row["Document Page Count"])),
    dateMin: dates[0] || "",
    dateMax: dates[dates.length - 1] || "",
  };
}

function templateSummaries(rows) {
  return Array.from(groupBy(rows, (row) => row["Template Type"]).entries())
    .map(([template, items]) => {
      const s = summarize(items);
      return {
        template,
        rows: items,
        documents: s.docs,
        words: s.words,
        manual: s.manual,
        manualRate: s.docs ? (s.manual / s.docs) * 100 : 0,
        meanWords: s.meanWords,
        medianWords: s.medianWords,
        meanPages: s.meanPages,
      };
    })
    .sort((a, b) => b.documents - a.documents);
}

function getDateBounds(records) {
  const dates = records.map((row) => row["Validation Date"]).filter(Boolean).sort();
  return { min: dates[0] || "", max: dates[dates.length - 1] || "" };
}

function populateFilters() {
  const templates = state.raw.meta.templates;
  const extractions = state.raw.meta.extractions;
  state.selectedTemplates = new Set(templates);
  state.selectedExtractions = new Set(extractions);

  $("templateFilters").innerHTML = templates
    .map((name) => `<button class="chip active" type="button" data-template="${escapeAttr(name)}">${escapeHtml(name)}</button>`)
    .join("");
  $("extractionFilters").innerHTML = extractions
    .map((name) => `<button class="chip active" type="button" data-extraction="${escapeAttr(name)}">${escapeHtml(name)}</button>`)
    .join("");

  const batches = ["All", ...state.raw.meta.batchFolders];
  $("batchFilter").innerHTML = batches
    .map((batch) => `<option value="${escapeAttr(batch)}">${escapeHtml(batch)}</option>`)
    .join("");

  const gedValues = Array.from(
    new Set(state.records.map((row) => row["GED Match Status"] || "Missing GED status"))
  ).sort();
  $("gedFilter").innerHTML = ["All", ...gedValues]
    .map((value) => `<option value="${escapeAttr(value)}">${escapeHtml(shortLabel(value, 48))}</option>`)
    .join("");

  const bounds = getDateBounds(state.records);
  $("dateFrom").min = bounds.min;
  $("dateFrom").max = bounds.max;
  $("dateTo").min = bounds.min;
  $("dateTo").max = bounds.max;
  $("dateFrom").value = "";
  $("dateTo").value = "";
  state.dateFrom = "";
  state.dateTo = "";
}

function bindEvents() {
  $("templateFilters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-template]");
    if (!button) return;
    const value = button.dataset.template;
    if (state.selectedTemplates.size === 1 && state.selectedTemplates.has(value)) {
      state.selectedTemplates = new Set(state.raw.meta.templates);
    } else {
      state.selectedTemplates = new Set([value]);
    }
    document.querySelectorAll("[data-template]").forEach((node) => {
      node.classList.toggle("active", state.selectedTemplates.has(node.dataset.template));
    });
    state.page = 1;
    update();
  });

  $("extractionFilters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-extraction]");
    if (!button) return;
    const value = button.dataset.extraction;
    if (state.selectedExtractions.size === 1 && state.selectedExtractions.has(value)) {
      state.selectedExtractions = new Set(state.raw.meta.extractions);
    } else {
      state.selectedExtractions = new Set([value]);
    }
    document.querySelectorAll("[data-extraction]").forEach((node) => {
      node.classList.toggle("active", state.selectedExtractions.has(node.dataset.extraction));
    });
    state.page = 1;
    update();
  });

  $("batchFilter").addEventListener("change", (event) => {
    state.batch = event.target.value;
    state.page = 1;
    update();
  });

  $("gedFilter").addEventListener("change", (event) => {
    state.ged = event.target.value;
    state.page = 1;
    update();
  });

  $("dateFrom").addEventListener("change", (event) => {
    state.dateFrom = event.target.value;
    state.page = 1;
    update();
  });

  $("dateTo").addEventListener("change", (event) => {
    state.dateTo = event.target.value;
    state.page = 1;
    update();
  });

  $("searchInput").addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    state.page = 1;
    update();
  });

  $("hideFutureDates").addEventListener("change", (event) => {
    state.hideFutureDates = event.target.checked;
    state.page = 1;
    update();
  });

  $("onlyQualityIssues").addEventListener("change", (event) => {
    state.onlyQualityIssues = event.target.checked;
    state.page = 1;
    update();
  });

  $("resetFilters").addEventListener("click", resetFilters);
  $("clearAllFilters").addEventListener("click", resetFilters);
  $("collapseSlicers").addEventListener("click", () => {
    document.querySelector(".sidebar").classList.toggle("compact");
  });
  $("focusServices").addEventListener("click", () => switchView("services"));
  $("focusTests").addEventListener("click", () => switchView("tests"));
  $("downloadFiltered").addEventListener("click", downloadFilteredCsv);
  $("distributionMetric").addEventListener("change", (event) => {
    state.distributionMetric = event.target.value;
    updateCharts();
  });
  $("batchSort").addEventListener("change", (event) => {
    state.batchSort = event.target.value;
    renderBatchView();
  });
  $("recordSort").addEventListener("change", (event) => {
    state.recordSort = event.target.value;
    state.page = 1;
    renderRecordTable();
  });
  $("serviceWindow").addEventListener("change", (event) => {
    state.serviceWindow = event.target.value;
    renderServicesView();
  });
  $("serviceMomentumMetric").addEventListener("change", (event) => {
    state.serviceMomentumMetric = event.target.value;
    renderServiceMomentumChart();
    renderServiceTable();
  });
  $("authorMinDocs").addEventListener("change", (event) => {
    state.authorMinDocs = Number(event.target.value);
    renderAuthorsView();
  });
  $("testDetailFilter").addEventListener("change", (event) => {
    state.testDetail = event.target.value;
    renderTestDetailTable();
  });
  $("prevPage").addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    renderRecordTable();
  });
  $("nextPage").addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    state.page = Math.min(totalPages, state.page + 1);
    renderRecordTable();
  });

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      switchView(button.dataset.view);
    });
  });

  window.addEventListener("resize", debounce(updateCharts, 120));
  document.body.addEventListener("mouseleave", hideTooltip);
}

function resetFilters() {
  state.selectedTemplates = new Set(state.raw.meta.templates);
  state.selectedExtractions = new Set(state.raw.meta.extractions);
  document.querySelectorAll("[data-template], [data-extraction]").forEach((button) => {
    button.classList.add("active");
  });
  state.batch = "All";
  state.ged = "All";
  $("batchFilter").value = "All";
  $("gedFilter").value = "All";
  const bounds = getDateBounds(state.records);
  state.dateFrom = "";
  state.dateTo = "";
  $("dateFrom").value = "";
  $("dateTo").value = "";
  state.search = "";
  $("searchInput").value = "";
  state.hideFutureDates = false;
  state.onlyQualityIssues = false;
  state.serviceFocus = "";
  $("hideFutureDates").checked = false;
  $("onlyQualityIssues").checked = false;
  state.page = 1;
  update();
}

function switchView(view) {
  state.view = view;
  document.querySelectorAll(".tab-button").forEach((node) => {
    node.classList.toggle("active", node.dataset.view === view);
  });
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.viewPanel === view);
  });
  updateCharts();
}

function applyFilters() {
  const search = state.search;
  state.filtered = state.records.filter((row) => {
    if (!state.selectedTemplates.has(row["Template Type"])) return false;
    if (!state.selectedExtractions.has(row.Extraction)) return false;
    if (state.batch !== "All" && row["Batch Folder"] !== state.batch) return false;
    const ged = row["GED Match Status"] || "Missing GED status";
    if (state.ged !== "All" && ged !== state.ged) return false;
    const date = row["Validation Date"];
    if (state.dateFrom && date && date < state.dateFrom) return false;
    if (state.dateTo && date && date > state.dateTo) return false;
    if (state.dateFrom && !date) return false;
    if (state.hideFutureDates && row["Is Future Date"]) return false;
    if (state.onlyQualityIssues && !hasQualityIssue(row)) return false;
    if (state.serviceFocus && n(row[state.serviceFocus]) <= 0) return false;
    if (search) {
      const haystack = [
        row["File Name"],
        row["Operation Number"],
        row["MC_Note_Type"],
        row["Batch Folder"],
        row["Template Type"],
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function update() {
  applyFilters();
  renderKpis();
  updateCharts();
  $("recordStatus").textContent = `${fmtInt.format(state.filtered.length)} of ${fmtInt.format(
    state.records.length
  )} records`;
  const s = summarize(state.filtered);
  $("dateStatus").textContent = s.dateMin && s.dateMax ? `${s.dateMin} to ${s.dateMax}` : "No dated rows";
  $("activeFilterStatus").textContent = activeFilterSummary();
}

function activeFilterSummary() {
  const parts = [];
  if (state.selectedTemplates.size !== state.raw.meta.templates.length) {
    parts.push(`Template: ${Array.from(state.selectedTemplates).join(", ")}`);
  }
  if (state.selectedExtractions.size !== state.raw.meta.extractions.length) {
    parts.push(`Extraction: ${Array.from(state.selectedExtractions).join(", ")}`);
  }
  if (state.batch !== "All") parts.push(`Batch: ${state.batch}`);
  if (state.ged !== "All") parts.push(`GED: ${shortLabel(state.ged, 26)}`);
  if (state.dateFrom || state.dateTo) parts.push(`Date: ${state.dateFrom || "..."} to ${state.dateTo || "..."}`);
  if (state.search) parts.push(`Search: ${state.search}`);
  if (state.hideFutureDates) parts.push("Future dates hidden");
  if (state.onlyQualityIssues) parts.push("Quality rows only");
  if (state.serviceFocus) parts.push(`Service: ${state.serviceFocus}`);
  return parts.length ? parts.join(" | ") : "All records";
}

function updateCharts() {
  if (state.view === "overview") {
    renderBoxChart();
    renderTemplateDonut();
    renderManualRateChart();
    renderDepartmentChart();
    renderScatterChart();
  }
  if (state.view === "time") {
    renderTimeVolumeChart();
    renderTimeWordsChart();
    renderTimeManualChart();
    renderTimeCumulativeChart();
    renderCalendarHeatmap();
  }
  if (state.view === "services") renderServicesView();
  if (state.view === "authors") renderAuthorsView();
  if (state.view === "batches") renderBatchView();
  if (state.view === "tests") renderTestsView();
  if (state.view === "quality") renderQualityView();
  if (state.view === "records") renderRecordTable();
}

function renderKpis() {
  const s = summarize(state.filtered);
  const manualRate = s.docs ? (s.manual / s.docs) * 100 : 0;
  const qualityRate = s.docs ? (s.quality / s.docs) * 100 : 0;
  const kpis = [
    ["Documents", fmtInt.format(s.docs), `${fmtInt.format(s.future)} future-dated`],
    ["Total Words", fmtInt.format(s.words), `${fmtOne.format(s.meanWords)} mean`],
    ["Median Words", fmtInt.format(s.medianWords), "Text before opinions"],
    ["Pages", fmtInt.format(s.pages), `${fmtOne.format(s.meanPages)} mean pages`],
    ["Manual Rate", `${fmtPct.format(manualRate)}%`, `${fmtInt.format(s.manual)} manual`],
    ["Quality Flags", `${fmtPct.format(qualityRate)}%`, `${fmtInt.format(s.quality)} rows`],
  ];
  $("kpiGrid").innerHTML = kpis
    .map(
      ([label, value, sub]) => `
      <article class="kpi">
        <div class="label">${escapeHtml(label)}</div>
        <div class="value">${escapeHtml(value)}</div>
        <div class="sub">${escapeHtml(sub)}</div>
      </article>`
    )
    .join("");
}

function renderTemplateDonut() {
  const container = $("templateDonut");
  const data = templateSummaries(state.filtered);
  if (!data.length) return empty(container);
  const svg = makeSvg(container, 420, 320);
  const total = data.reduce((sum, d) => sum + d.documents, 0);
  const cx = 160;
  const cy = 150;
  const r = 98;
  const inner = 58;
  let angle = -Math.PI / 2;
  const paths = data
    .map((d) => {
      const slice = (d.documents / total) * Math.PI * 2;
      const path = donutPath(cx, cy, r, inner, angle, angle + slice);
      angle += slice;
      return `<path d="${path}" fill="${templateColor(d.template)}" data-template-click="${escapeAttr(
        d.template
      )}" data-tip="${escapeAttr(`${d.template}: ${fmtInt.format(d.documents)} docs`)}"></path>`;
    })
    .join("");
  const legend = data
    .map((d, index) => {
      const y = 90 + index * 28;
      const pct = total ? (d.documents / total) * 100 : 0;
      return `<g class="legend-item" data-template-click="${escapeAttr(d.template)}">
        <rect x="292" y="${y - 10}" width="12" height="12" rx="2" fill="${templateColor(d.template)}"></rect>
        <text x="312" y="${y}" class="legend-label">${escapeHtml(d.template)} ${fmtPct.format(pct)}%</text>
      </g>`;
    })
    .join("");
  svg.innerHTML = `${paths}<circle cx="${cx}" cy="${cy}" r="${inner - 3}" fill="#fff"></circle>
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="${COLORS.ink}" font-size="24" font-weight="800">${fmtInt.format(total)}</text>
    <text x="${cx}" y="${cy + 17}" text-anchor="middle" fill="${COLORS.neutral}" font-size="12">documents</text>${legend}`;
  bindSvgTips(svg);
  bindTemplateClicks(svg);
}

function donutPath(cx, cy, r, inner, start, end) {
  const large = end - start > Math.PI ? 1 : 0;
  const p1 = polar(cx, cy, r, end);
  const p2 = polar(cx, cy, r, start);
  const p3 = polar(cx, cy, inner, start);
  const p4 = polar(cx, cy, inner, end);
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 0 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${inner} ${inner} 0 ${large} 1 ${p4.x} ${p4.y} Z`;
}

function polar(cx, cy, r, angle) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function renderManualRateChart() {
  const container = $("manualRateChart");
  const data = templateSummaries(state.filtered).sort((a, b) => b.manualRate - a.manualRate);
  renderHorizontalBars(container, data, {
    label: (d) => d.template,
    value: (d) => d.manualRate,
    color: (d) => templateColor(d.template),
    suffix: "%",
    max: Math.max(10, ...data.map((d) => d.manualRate)),
    onClick: (d) => lockTemplate(d.template),
    tip: (d) => `${d.template}<br>${fmtPct.format(d.manualRate)}% manual<br>${fmtInt.format(d.manual)} manual rows`,
  });
}

function renderDepartmentChart() {
  const container = $("departmentChart");
  const templates = Array.from(new Set(state.filtered.map((row) => row["Template Type"]))).sort();
  const byDept = DEPARTMENTS.map((dept) => ({
    dept,
    total: state.filtered.reduce((sum, row) => sum + n(row[dept]), 0),
  }))
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map((d) => d.dept);
  if (!templates.length || !byDept.length) return empty(container);
  const data = [];
  templates.forEach((template) => {
    byDept.forEach((dept) => {
      const rows = state.filtered.filter((row) => row["Template Type"] === template);
      data.push({
        template,
        dept,
        words: rows.reduce((sum, row) => sum + n(row[dept]), 0),
        docs: rows.filter((row) => n(row[dept]) > 0).length,
      });
    });
  });
  renderHeatMatrix(container, data, templates, byDept);
}

function renderBoxChart() {
  const container = $("boxChart");
  const data = templateSummaries(state.filtered)
    .map((d) => {
      const values = d.rows.map((row) => row[state.distributionMetric]).filter((value) => Number.isFinite(Number(value)));
      return {
        template: d.template,
        min: quantile(values, 0.05),
        q1: quantile(values, 0.25),
        median: quantile(values, 0.5),
        q3: quantile(values, 0.75),
        max: quantile(values, 0.95),
        count: values.length,
      };
    })
    .filter((d) => d.count > 0);
  if (!data.length) return empty(container);
  const svg = makeSvg(container, 920, 370);
  const margin = { top: 25, right: 22, bottom: 48, left: 78 };
  const width = 920 - margin.left - margin.right;
  const height = 370 - margin.top - margin.bottom;
  const max = Math.max(...data.map((d) => d.max), 1);
  const y = (value) => margin.top + height - (value / max) * height;
  const step = width / data.length;
  svg.innerHTML = gridY(max, margin, width, height, 5)
    .concat(
      data
        .map((d, i) => {
          const cx = margin.left + step * i + step / 2;
          const boxW = Math.min(82, step * 0.48);
          return `<g data-tip="${escapeAttr(
            `${d.template}<br>Median: ${fmtInt.format(d.median)}<br>IQR: ${fmtInt.format(d.q1)}-${fmtInt.format(d.q3)}`
          )}">
            <line x1="${cx}" x2="${cx}" y1="${y(d.min)}" y2="${y(d.max)}" stroke="${templateColor(d.template)}" stroke-width="3"></line>
            <line x1="${cx - boxW / 3}" x2="${cx + boxW / 3}" y1="${y(d.min)}" y2="${y(d.min)}" stroke="${templateColor(d.template)}" stroke-width="3"></line>
            <line x1="${cx - boxW / 3}" x2="${cx + boxW / 3}" y1="${y(d.max)}" y2="${y(d.max)}" stroke="${templateColor(d.template)}" stroke-width="3"></line>
            <rect x="${cx - boxW / 2}" y="${y(d.q3)}" width="${boxW}" height="${Math.max(4, y(d.q1) - y(d.q3))}" rx="5" fill="${templateColor(d.template)}" opacity="0.78"></rect>
            <line x1="${cx - boxW / 2}" x2="${cx + boxW / 2}" y1="${y(d.median)}" y2="${y(d.median)}" stroke="#fff" stroke-width="3"></line>
            <text x="${cx}" y="${margin.top + height + 25}" text-anchor="middle" fill="${COLORS.ink}" font-size="12" font-weight="700">${escapeHtml(d.template)}</text>
          </g>`;
        })
        .join("")
    )
    .join("");
  bindSvgTips(svg);
}

function renderScatterChart() {
  const container = $("scatterChart");
  const rows = state.filtered.filter((row) => n(row["Document Page Count"]) > 0 && n(row["Text Before Opinions"]) > 0);
  if (!rows.length) return empty(container);
  const svg = makeSvg(container, 920, 390);
  const margin = { top: 25, right: 25, bottom: 52, left: 72 };
  const width = 920 - margin.left - margin.right;
  const height = 390 - margin.top - margin.bottom;
  const xMax = quantile(rows.map((row) => row["Document Page Count"]), 0.98) || 1;
  const yMax = quantile(rows.map((row) => row["Text Before Opinions"]), 0.98) || 1;
  const x = (value) => margin.left + Math.min(value, xMax) / xMax * width;
  const y = (value) => margin.top + height - Math.min(value, yMax) / yMax * height;
  const sample = rows.length > 1600 ? rows.filter((_, index) => index % Math.ceil(rows.length / 1600) === 0) : rows;
  svg.innerHTML =
    gridXY(xMax, yMax, margin, width, height) +
    sample
      .map((row) => {
        const clipped = n(row["Document Page Count"]) > xMax || n(row["Text Before Opinions"]) > yMax;
        return `<circle class="point" cx="${x(n(row["Document Page Count"]))}" cy="${y(n(row["Text Before Opinions"]))}" r="${
          clipped ? 4.2 : 3.2
        }" fill="${templateColor(row["Template Type"])}" opacity="0.62" data-tip="${escapeAttr(
          `${row["Template Type"]} ${row.Extraction}<br>${fmtInt.format(row["Text Before Opinions"])} words<br>${fmtInt.format(
            row["Document Page Count"]
          )} pages<br>${shortLabel(row["File Name"], 80)}`
        )}"></circle>`;
      })
      .join("") +
    `<text x="${margin.left + width / 2}" y="377" text-anchor="middle" fill="${COLORS.neutral}" font-size="12">Document Page Count</text>
     <text x="18" y="${margin.top + height / 2}" transform="rotate(-90 18 ${margin.top + height / 2})" text-anchor="middle" fill="${COLORS.neutral}" font-size="12">Text Before Opinions</text>`;
  bindSvgTips(svg);
}

function monthlyGroups(rows) {
  const map = new Map();
  rows
    .filter((row) => row["Validation Month"])
    .forEach((row) => {
      const key = `${row["Validation Month"]}|${row["Template Type"]}`;
      if (!map.has(key)) {
        map.set(key, { month: row["Validation Month"], template: row["Template Type"], rows: [] });
      }
      map.get(key).rows.push(row);
    });
  return Array.from(map.values())
    .map((item) => ({
      ...item,
      documents: item.rows.length,
      meanWords: mean(item.rows.map((row) => row["Text Before Opinions"])),
      words: item.rows.reduce((sum, row) => sum + n(row["Text Before Opinions"]), 0),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function serviceOpinionRows(rows) {
  const out = [];
  rows.forEach((row) => {
    if (!row["Validation Month"]) return;
    DEPARTMENTS.forEach((service) => {
      const words = n(row[service]);
      if (words > 0) {
        out.push({
          template: row["Template Type"],
          service,
          month: row["Validation Month"],
          words,
          file: row["File Name"],
          extraction: row.Extraction,
          batch: row["Batch Folder"],
        });
      }
    });
  });
  return out;
}

function serviceOpinionSummary(rows) {
  const opinions = serviceOpinionRows(rows);
  const historicalMonths = Array.from(
    new Set(
      rows
        .filter((row) => row["Validation Month"] && !row["Is Future Date"])
      .map((row) => row["Validation Month"])
    )
  ).sort();
  const templateMonthDocs = new Map();
  rows
    .filter((row) => row["Validation Month"] && !row["Is Future Date"])
    .forEach((row) => {
      const template = row["Template Type"];
      const month = row["Validation Month"];
      if (!templateMonthDocs.has(template)) templateMonthDocs.set(template, new Map());
      const monthMap = templateMonthDocs.get(template);
      monthMap.set(month, (monthMap.get(month) || 0) + 1);
    });
  const byKey = new Map();
  opinions.forEach((item) => {
    const key = `${item.template}|${item.service}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        template: item.template,
        service: item.service,
        opinionCount: 0,
        totalWords: 0,
        documents: new Set(),
        months: new Map(),
        monthWords: new Map(),
        monthWordValues: new Map(),
      });
    }
    const bucket = byKey.get(key);
    bucket.opinionCount += 1;
    bucket.totalWords += item.words;
    bucket.documents.add(item.file);
    bucket.months.set(item.month, (bucket.months.get(item.month) || 0) + 1);
    bucket.monthWords.set(item.month, (bucket.monthWords.get(item.month) || 0) + item.words);
    if (!bucket.monthWordValues.has(item.month)) bucket.monthWordValues.set(item.month, []);
    bucket.monthWordValues.get(item.month).push(item.words);
  });
  return Array.from(byKey.values()).map((item) => {
    const momentum = serviceMomentum(item.months, item.monthWords, item.monthWordValues, historicalMonths, templateMonthDocs.get(item.template) || new Map());
    return {
      template: item.template,
      service: item.service,
      opinionCount: item.opinionCount,
      totalWords: item.totalWords,
      documentCount: item.documents.size,
      meanWordsPerOpinion: item.opinionCount ? item.totalWords / item.opinionCount : 0,
      recentOpinions: momentum.recent,
      previousOpinions: momentum.previous,
      recentWords: momentum.recentWords,
      previousWords: momentum.previousWords,
      wordDelta: momentum.wordDelta,
      recentMeanWords: momentum.recentMeanWords,
      previousMeanWords: momentum.previousMeanWords,
      meanWordDelta: momentum.meanWordDelta,
      recentMedianWords: momentum.recentMedianWords,
      previousMedianWords: momentum.previousMedianWords,
      medianWordDelta: momentum.medianWordDelta,
      recentCoverage: momentum.recentCoverage,
      previousCoverage: momentum.previousCoverage,
      countDelta: momentum.countDelta,
      momentum: momentum.deltaCoverage,
      momentumPct: momentum.deltaCoverage,
    };
  });
}

function serviceMomentum(monthMap, wordMonthMap, wordValuesMonthMap, baseMonths, denominatorMonthMap) {
  const allMonths = [...baseMonths].sort();
  const selectedMonths = serviceWindowMonths(allMonths);
  const months = selectedMonths.length ? selectedMonths : allMonths;
  const recentMonths = months.slice(-6);
  const previousMonths = months.slice(-12, -6);
  const recent = recentMonths.reduce((sum, month) => sum + (monthMap.get(month) || 0), 0);
  const previous = previousMonths.reduce((sum, month) => sum + (monthMap.get(month) || 0), 0);
  const recentWords = recentMonths.reduce((sum, month) => sum + (wordMonthMap.get(month) || 0), 0);
  const previousWords = previousMonths.reduce((sum, month) => sum + (wordMonthMap.get(month) || 0), 0);
  const recentWordValues = recentMonths.flatMap((month) => wordValuesMonthMap.get(month) || []);
  const previousWordValues = previousMonths.flatMap((month) => wordValuesMonthMap.get(month) || []);
  const recentMeanWords = mean(recentWordValues);
  const previousMeanWords = mean(previousWordValues);
  const recentMedianWords = quantile(recentWordValues, 0.5);
  const previousMedianWords = quantile(previousWordValues, 0.5);
  const recentDocs = recentMonths.reduce((sum, month) => sum + (denominatorMonthMap.get(month) || 0), 0);
  const previousDocs = previousMonths.reduce((sum, month) => sum + (denominatorMonthMap.get(month) || 0), 0);
  const recentCoverage = recentDocs ? (recent / recentDocs) * 100 : 0;
  const previousCoverage = previousDocs ? (previous / previousDocs) * 100 : 0;
  const deltaCoverage = recentCoverage - previousCoverage;
  return {
    recent,
    previous,
    countDelta: recent - previous,
    recentWords,
    previousWords,
    wordDelta: recentWords - previousWords,
    recentMeanWords,
    previousMeanWords,
    meanWordDelta: recentMeanWords - previousMeanWords,
    recentMedianWords,
    previousMedianWords,
    medianWordDelta: recentMedianWords - previousMedianWords,
    recentCoverage,
    previousCoverage,
    deltaCoverage,
  };
}

function serviceWindowMonths(months) {
  const sorted = [...months].sort();
  if (state.serviceWindow === "all") return sorted;
  return sorted.slice(-Number(state.serviceWindow));
}

function renderTimeVolumeChart() {
  const data = monthlyGroups(state.filtered);
  renderLineChart($("timeVolumeChart"), data, {
    value: (d) => d.documents,
    label: "Documents",
    tip: (d) => `${d.month} ${d.template}<br>${fmtInt.format(d.documents)} documents`,
  });
}

function renderServicesView() {
  renderServicePulse();
  renderServiceMomentumChart();
  renderServiceMixChart();
  renderTemplateServiceChart();
  renderServiceTable();
}

function authorStats(rows) {
  const groups = Array.from(groupBy(rows.filter((row) => row.Author), (row) => row.Author).entries());
  return groups
    .map(([author, items]) => ({
      author,
      rows: items,
      docs: items.length,
      templates: Array.from(new Set(items.map((row) => row["Template Type"]))).sort().join(", "),
      medianWords: quantile(items.map((row) => row["Text Before Opinions"]), 0.5),
      meanWords: mean(items.map((row) => row["Text Before Opinions"])),
      medianPages: quantile(items.map((row) => row["Document Page Count"]), 0.5),
      meanPages: mean(items.map((row) => row["Document Page Count"])),
      medianServiceOpinions: quantile(items.map((row) => row["Department Sections With Words"]), 0.5),
      manualRate: items.filter((row) => row.Extraction === "Manual").length / items.length * 100,
    }))
    .filter((row) => row.docs >= state.authorMinDocs);
}

function renderAuthorsView() {
  const stats = authorStats(state.filtered);
  const longest = [...stats].sort((a, b) => b.medianWords - a.medianWords).slice(0, 18);
  const shortest = [...stats].sort((a, b) => a.medianWords - b.medianWords).slice(0, 12);
  renderHorizontalBars($("authorLengthChart"), longest, {
    label: (d) => d.author,
    value: (d) => d.medianWords,
    color: (d) => templateColor(d.templates.split(", ")[0]),
    tip: (d) =>
      `${d.author}<br>${fmtInt.format(d.docs)} docs<br>${fmtInt.format(d.medianWords)} median words<br>${fmtInt.format(d.medianPages)} median pages`,
  });
  renderHorizontalBars($("shortAuthorChart"), shortest, {
    label: (d) => d.author,
    value: (d) => d.medianWords,
    color: () => "#9d9d9c",
    tip: (d) => `${d.author}<br>${fmtInt.format(d.docs)} docs<br>${fmtInt.format(d.medianWords)} median words`,
  });
  renderAuthorCoverage();
  renderAuthorTable(stats);
}

function renderAuthorCoverage() {
  const rows = Array.from(groupBy(state.filtered, (row) => row["Template Type"]).entries()).map(([template, items]) => ({
    template,
    missing: items.filter((row) => !row.Author).length,
    present: items.filter((row) => row.Author).length,
    missingPct: items.length ? items.filter((row) => !row.Author).length / items.length * 100 : 0,
  }));
  renderVerticalBars($("authorCoverageChart"), rows, {
    label: (d) => d.template,
    value: (d) => d.missingPct,
    color: (d) => templateColor(d.template),
    tip: (d) => `${d.template}<br>${fmtPct.format(d.missingPct)}% missing author<br>${fmtInt.format(d.missing)} missing rows`,
  });
}

function renderAuthorTable(stats) {
  const rows = [...stats].sort((a, b) => b.medianWords - a.medianWords);
  renderTable($("authorTable"), ["Author", "Templates", "Docs", "Median Words", "Mean Words", "Median Pages", "Median Services", "Manual Rate"], rows, (row) => [
    escapeHtml(row.author),
    escapeHtml(row.templates),
    numCell(row.docs),
    numCell(row.medianWords),
    numCell(row.meanWords),
    numCell(row.medianPages),
    numCell(row.medianServiceOpinions),
    `${fmtPct.format(row.manualRate)}%`,
  ]);
}

function renderServicePulse() {
  const container = $("servicePulse");
  const opinions = serviceOpinionRows(state.filtered);
  if (!opinions.length) return empty(container, "No service opinions match the current filters.");
  const allMonths = Array.from(new Set(opinions.map((d) => d.month))).sort();
  const months = serviceWindowMonths(allMonths);
  const templates = Array.from(new Set(opinions.map((d) => d.template))).sort();
  const services = DEPARTMENTS.filter((service) => opinions.some((d) => d.service === service && months.includes(d.month)));
  if (!months.length || !services.length) return empty(container, "No dated service opinions match the current filters.");

  const counts = new Map();
  opinions.forEach((d) => {
    if (!months.includes(d.month)) return;
    const key = `${d.template}|${d.service}|${d.month}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const monthW = Math.max(18, Math.min(42, 760 / months.length));
  const rowH = 20;
  const templateGap = 44;
  const margin = { top: 42, right: 24, bottom: 72, left: 92 };
  const width = Math.max(940, margin.left + margin.right + months.length * monthW);
  const height = margin.top + margin.bottom + templates.length * (services.length * rowH + templateGap);
  const svg = makeSvg(container, width, height);
  const max = Math.max(...Array.from(counts.values()), 1);
  let y = margin.top;
  let html = "";

  months.forEach((month, i) => {
    if (i % Math.max(1, Math.ceil(months.length / 16)) === 0) {
      const x = margin.left + i * monthW + monthW / 2;
      html += `<text x="${x}" y="22" text-anchor="middle" fill="${COLORS.neutral}" font-size="10">${month}</text>`;
    }
  });

  templates.forEach((template) => {
    html += `<text x="24" y="${y + 14}" fill="${templateColor(template)}" font-size="14" font-weight="900">${template}</text>`;
    services.forEach((service, si) => {
      const rowY = y + 24 + si * rowH;
      html += `<text x="${margin.left - 12}" y="${rowY + 13}" text-anchor="end" fill="${COLORS.ink}" font-size="11" font-weight="700">${service}</text>`;
      months.forEach((month, mi) => {
        const value = counts.get(`${template}|${service}|${month}`) || 0;
        const opacity = value ? 0.12 + (value / max) * 0.88 : 0.035;
        html += `<rect class="pulse-cell" x="${margin.left + mi * monthW}" y="${rowY}" width="${Math.max(6, monthW - 3)}" height="${rowH - 3}" rx="3" fill="${templateColor(template)}" opacity="${opacity}" data-tip="${template} / ${service}<br>${month}<br>${fmtInt.format(value)} service opinions"></rect>`;
      });
    });
    y += services.length * rowH + templateGap;
  });

  html += `<text x="${margin.left}" y="${height - 24}" fill="${COLORS.neutral}" font-size="12">Definition: a service opinion is counted when a service column has a positive word count in a document.</text>`;
  svg.innerHTML = html;
  bindSvgTips(svg);
}

function renderServiceMomentumChart() {
  const metric = state.serviceMomentumMetric;
  const rows = serviceOpinionSummary(state.filtered)
    .filter((row) => row.opinionCount > 0)
    .sort((a, b) => Math.abs(serviceMomentumValue(b, metric)) - Math.abs(serviceMomentumValue(a, metric)))
    .slice(0, 18);
  if (!rows.length) return empty($("serviceMomentumChart"));
  renderDivergingBars($("serviceMomentumChart"), rows, {
    label: (d) => `${d.template} ${d.service}`,
    value: (d) => serviceMomentumValue(d, metric),
    valueFormat: (value) => serviceMomentumLabel(value, metric),
    tip: (d) =>
      `${d.template} / ${d.service}<br>Coverage delta: ${d.momentum > 0 ? "+" : ""}${fmtPct.format(d.momentum)} pp<br>Mean words/opinion delta: ${d.meanWordDelta > 0 ? "+" : ""}${fmtInt.format(d.meanWordDelta)}<br>Median words/opinion delta: ${d.medianWordDelta > 0 ? "+" : ""}${fmtInt.format(d.medianWordDelta)}<br>Total word-count delta: ${d.wordDelta > 0 ? "+" : ""}${fmtInt.format(d.wordDelta)} words<br>Opinion-count delta: ${d.countDelta > 0 ? "+" : ""}${fmtInt.format(d.countDelta)} opinions<br>Recent: ${fmtPct.format(d.recentCoverage)}%, ${fmtInt.format(d.recentOpinions)} opinions, mean ${fmtInt.format(d.recentMeanWords)}, median ${fmtInt.format(d.recentMedianWords)}, total ${fmtInt.format(d.recentWords)} words<br>Previous: ${fmtPct.format(d.previousCoverage)}%, ${fmtInt.format(d.previousOpinions)} opinions, mean ${fmtInt.format(d.previousMeanWords)}, median ${fmtInt.format(d.previousMedianWords)}, total ${fmtInt.format(d.previousWords)} words`,
  });
}

function serviceMomentumValue(row, metric) {
  if (metric === "meanWords") return row.meanWordDelta;
  if (metric === "medianWords") return row.medianWordDelta;
  if (metric === "totalWords") return row.wordDelta;
  if (metric === "opinions") return row.countDelta;
  return row.momentum;
}

function serviceMomentumLabel(value, metric) {
  if (metric === "coverage") return `${value > 0 ? "+" : ""}${fmtOne.format(value)} pp`;
  if (["meanWords", "medianWords", "totalWords"].includes(metric)) return `${value > 0 ? "+" : ""}${fmtInt.format(value)}`;
  return `${value > 0 ? "+" : ""}${fmtInt.format(value)}`;
}

function renderServiceMixChart() {
  const rows = Array.from(groupBy(serviceOpinionRows(state.filtered), (d) => d.service).entries())
    .map(([service, items]) => ({
      service,
      count: items.length,
      words: items.reduce((sum, item) => sum + item.words, 0),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  renderVerticalBars($("serviceMixChart"), rows, {
    label: (d) => d.service,
    value: (d) => d.count,
    color: (_, i) => ["#003399", "#1856b6", "#00856f", "#b0444f", "#b38b00", "#6d5aa8"][i % 6],
    tip: (d) => `${d.service}<br>${fmtInt.format(d.count)} service opinions<br>${fmtInt.format(d.words)} words`,
    onClick: (d) => filterSearchToService(d.service),
  });
}

function renderTemplateServiceChart() {
  const rows = serviceOpinionSummary(state.filtered)
    .filter((row) => row.opinionCount > 0)
    .sort((a, b) => b.opinionCount - a.opinionCount)
    .slice(0, 14);
  renderHorizontalBars($("templateServiceChart"), rows, {
    label: (d) => `${d.template} ${d.service}`,
    value: (d) => d.opinionCount,
    color: (d) => templateColor(d.template),
    tip: (d) =>
      `${d.template} / ${d.service}<br>${fmtInt.format(d.opinionCount)} service opinions<br>${fmtInt.format(d.documentCount)} documents`,
    onClick: (d) => lockTemplate(d.template),
  });
}

function renderServiceTable() {
  const rows = serviceOpinionSummary(state.filtered)
    .filter((row) => row.opinionCount > 0)
    .sort((a, b) => b.opinionCount - a.opinionCount);
  renderTable($("serviceTable"), ["Template", "Service", "Opinions", "Docs", "Mean Now", "Mean Prev", "Median Now", "Median Prev", "Mean Delta"], rows, (row) => [
    `<span class="pill">${escapeHtml(row.template)}</span>`,
    escapeHtml(row.service),
    numCell(row.opinionCount),
    numCell(row.documentCount),
    numCell(row.recentMeanWords),
    numCell(row.previousMeanWords),
    numCell(row.recentMedianWords),
    numCell(row.previousMedianWords),
    `<span class="pill ${row.meanWordDelta >= 0 ? "auto" : "manual"}">${row.meanWordDelta > 0 ? "+" : ""}${fmtInt.format(row.meanWordDelta)}</span>`,
  ]);
}

function renderTimeWordsChart() {
  const data = monthlyGroups(state.filtered);
  renderLineChart($("timeWordsChart"), data, {
    value: (d) => d.meanWords,
    label: "Mean Words",
    movingAverage: true,
    tip: (d) => `${d.month} ${d.template}<br>${fmtInt.format(d.meanWords)} mean words`,
  });
}

function renderTimeManualChart() {
  const data = monthlyGroups(state.filtered).map((d) => ({
    ...d,
    manualRate: d.rows.length ? (d.rows.filter((row) => row.Extraction === "Manual").length / d.rows.length) * 100 : 0,
  }));
  renderLineChart($("timeManualChart"), data, {
    value: (d) => d.manualRate,
    label: "Manual Rate (%)",
    tip: (d) => `${d.month} ${d.template}<br>${fmtPct.format(d.manualRate)}% manual<br>${fmtInt.format(d.documents)} documents`,
  });
}

function renderTimeCumulativeChart() {
  const monthly = monthlyGroups(state.filtered);
  const templates = Array.from(new Set(monthly.map((d) => d.template))).sort();
  const cumulative = [];
  templates.forEach((template) => {
    let running = 0;
    monthly
      .filter((d) => d.template === template)
      .sort((a, b) => a.month.localeCompare(b.month))
      .forEach((d) => {
        running += d.documents;
        cumulative.push({ ...d, cumulative: running });
      });
  });
  renderLineChart($("timeCumulativeChart"), cumulative, {
    value: (d) => d.cumulative,
    label: "Cumulative Documents",
    tip: (d) => `${d.month} ${d.template}<br>${fmtInt.format(d.cumulative)} cumulative documents`,
  });
}

function renderCalendarHeatmap() {
  const container = $("calendarHeatmap");
  const data = Array.from(groupBy(state.filtered.filter((row) => row["Validation Month"]), (row) => row["Validation Month"]).entries())
    .map(([month, rows]) => ({ month, count: rows.length }))
    .sort((a, b) => a.month.localeCompare(b.month));
  if (!data.length) return empty(container);
  const years = Array.from(new Set(data.map((d) => d.month.slice(0, 4)))).sort();
  const counts = new Map(data.map((d) => [d.month, d.count]));
  const svg = makeSvg(container, 940, Math.max(230, 56 + years.length * 42));
  const max = Math.max(...data.map((d) => d.count), 1);
  const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const cellW = 62;
  const cellH = 26;
  const x0 = 90;
  const y0 = 45;
  svg.innerHTML =
    labels.map((label, i) => `<text x="${x0 + i * cellW + cellW / 2}" y="24" text-anchor="middle" fill="${COLORS.neutral}" font-size="11">${label}</text>`).join("") +
    years
      .map((year, yi) => {
        const y = y0 + yi * 42;
        const row = `<text x="30" y="${y + 18}" fill="${COLORS.ink}" font-size="12" font-weight="700">${year}</text>`;
        const cells = months
          .map((month, mi) => {
            const key = `${year}-${month}`;
            const count = counts.get(key) || 0;
            const intensity = count ? 0.18 + (count / max) * 0.82 : 0.06;
            return `<rect class="heat-cell" x="${x0 + mi * cellW}" y="${y}" width="${cellW - 6}" height="${cellH}" rx="5" fill="${COLORS.green}" opacity="${intensity}" data-tip="${key}<br>${fmtInt.format(count)} documents"></rect>`;
          })
          .join("");
        return row + cells;
      })
      .join("");
  bindSvgTips(svg);
}

function renderBatchView() {
  const rows = Array.from(groupBy(state.filtered, (row) => row["Batch Folder"]).entries()).map(([batch, items]) => {
    const s = summarize(items);
    return {
      batch,
      documents: s.docs,
      words: s.words,
      meanWords: s.meanWords,
      pages: s.pages,
      manual: s.manual,
      manualRate: s.docs ? (s.manual / s.docs) * 100 : 0,
      qualityFlags: items.filter(hasQualityIssue).length,
      templates: Array.from(new Set(items.map((row) => row["Template Type"]))).join(", "),
    };
  });
  const sorters = {
    documents: (a, b) => b.documents - a.documents,
    manualRate: (a, b) => b.manualRate - a.manualRate,
    meanWords: (a, b) => b.meanWords - a.meanWords,
    qualityFlags: (a, b) => b.qualityFlags - a.qualityFlags,
  };
  rows.sort(sorters[state.batchSort]);
  renderHorizontalBars($("batchChart"), rows.slice(0, 18), {
    label: (d) => d.batch,
    value: (d) => d[state.batchSort] ?? d.documents,
    color: (d) => templateColor((d.templates || "").split(", ")[0]),
    suffix: state.batchSort === "manualRate" ? "%" : "",
    onClick: (d) => lockBatch(d.batch),
    tip: (d) =>
      `${d.batch}<br>${fmtInt.format(d.documents)} docs<br>${fmtPct.format(d.manualRate)}% manual<br>${fmtInt.format(
        d.qualityFlags
      )} quality flags`,
  });
  renderBatchTable(rows);
}

function renderQualityView() {
  const flagRows = [
    ["Missing date", state.filtered.filter((row) => row["Has Missing Date"]).length],
    ["Future date", state.filtered.filter((row) => row["Is Future Date"]).length],
    ["Missing GED", state.filtered.filter((row) => row["Has Missing GED"]).length],
    ["Missing annex", state.filtered.filter((row) => row["Annex Page Count"] === null || row["Annex Page Count"] === undefined).length],
  ].map(([flag, count]) => ({ flag, count }));
  renderVerticalBars($("qualityChart"), flagRows, {
    label: (d) => d.flag,
    value: (d) => d.count,
    color: (_, i) => ["#c1666b", "#b88a2c", "#376996", "#7759a6"][i],
    tip: (d) => `${d.flag}<br>${fmtInt.format(d.count)} records`,
  });

  const gedRows = Array.from(groupBy(state.filtered, (row) => row["GED Match Status"] || "Missing GED status").entries())
    .map(([status, items]) => ({ status, count: items.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  renderHorizontalBars($("gedChart"), gedRows, {
    label: (d) => shortLabel(d.status, 24),
    value: (d) => d.count,
    color: (_, i) => ["#376996", "#2a9d8f", "#c1666b", "#b88a2c", "#7759a6", "#2f8db3"][i % 6],
    tip: (d) => `${d.status}<br>${fmtInt.format(d.count)} records`,
  });
  renderQualityTable();
}

function renderTestsView() {
  const tests = state.raw.tests || [];
  const order = { warn: 0, info: 1, pass: 2 };
  const sorted = [...tests].sort((a, b) => order[a.status] - order[b.status] || a.category.localeCompare(b.category));
  $("testCards").innerHTML = sorted
    .map(
      (test) => `<article class="test-card ${escapeAttr(test.status)}">
        <div class="test-meta">
          <span>${escapeHtml(test.category)}</span>
          <span class="status-badge ${escapeAttr(test.status)}">${escapeHtml(test.status)}</span>
        </div>
        <h4>${escapeHtml(test.title)}</h4>
        <p>${escapeHtml(test.finding)}</p>
      </article>`
    )
    .join("");
  renderTestStatusChart();
  renderGngDepartmentTestChart();
  populateTestDetailFilter();
  renderTestDetailTable();
}

function renderTestStatusChart() {
  const tests = state.raw.tests || [];
  const data = ["warn", "info", "pass"].map((status) => ({
    status,
    count: tests.filter((test) => test.status === status).length,
  }));
  renderVerticalBars($("testStatusChart"), data, {
    label: (d) => d.status.toUpperCase(),
    value: (d) => d.count,
    color: (d) => (d.status === "pass" ? COLORS.green : d.status === "warn" ? COLORS.gold : COLORS.blue),
    tip: (d) => `${d.status}<br>${fmtInt.format(d.count)} tests`,
  });
}

function renderGngDepartmentTestChart() {
  const tests = (state.raw.tests || []).filter(
    (test) => test.id === "gng-unexpected-departments" || test.id.startsWith("gng-")
  );
  const data = tests.map((test) => ({
    label: test.id === "gng-unexpected-departments" ? "Unexpected" : test.title.replace("GNG ", "").replace(" coverage", ""),
    value: Number(test.metric),
    status: test.status,
    unit: test.unit,
    finding: test.finding,
  }));
  renderHorizontalBars($("gngDepartmentTestChart"), data, {
    label: (d) => d.label,
    value: (d) => d.value,
    color: (d) => (d.status === "pass" ? COLORS.green : COLORS.gold),
    suffix: "",
    max: 100,
    tip: (d) => `${d.label}<br>${fmtOne.format(d.value)} ${d.unit}<br>${d.finding}`,
  });
}

function populateTestDetailFilter() {
  const select = $("testDetailFilter");
  const current = select.value || state.testDetail;
  const tests = state.raw.tests || [];
  select.innerHTML = [
    `<option value="all-warnings">Warning rows</option>`,
    `<option value="all">All rows</option>`,
    ...tests.map((test) => `<option value="${escapeAttr(test.id)}">${escapeHtml(shortLabel(test.title, 58))}</option>`),
  ].join("");
  select.value = [...select.options].some((option) => option.value === current) ? current : "all-warnings";
  state.testDetail = select.value;
}

function renderTestDetailTable() {
  const tests = state.raw.tests || [];
  let rows = [];
  if (state.testDetail === "all-warnings") {
    rows = tests.filter((test) => test.status === "warn").flatMap((test) => (test.rows || []).map((row) => ({ ...row, Test: test.title })));
  } else if (state.testDetail === "all") {
    rows = tests.flatMap((test) => (test.rows || []).map((row) => ({ ...row, Test: test.title })));
  } else {
    const test = tests.find((item) => item.id === state.testDetail);
    rows = test ? (test.rows || []).map((row) => ({ ...row, Test: test.title })) : [];
  }
  rows = rows.slice(0, 250);
  renderTable($("testDetailTable"), ["Test", "Template", "Extraction", "Batch", "Date", "Words", "File"], rows, (row) => [
    escapeHtml(shortLabel(row.Test, 44)),
    `<span class="pill">${escapeHtml(row["Template Type"] || "")}</span>`,
    row.Extraction ? `<span class="pill ${row.Extraction === "Manual" ? "manual" : "auto"}">${escapeHtml(row.Extraction)}</span>` : "",
    escapeHtml(row["Batch Folder"] || ""),
    escapeHtml(formatDate(row["Validation Date"])),
    numCell(row["Text Before Opinions"]),
    `<span class="file-cell">${escapeHtml(row["File Name"] || JSON.stringify(row))}</span>`,
  ]);
}

function renderRecordTable() {
  const sorted = [...state.filtered].sort(recordSorter());
  const totalPages = Math.max(1, Math.ceil(sorted.length / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  const start = (state.page - 1) * state.pageSize;
  const pageRows = sorted.slice(start, start + state.pageSize);
  $("pageStatus").textContent = `${state.page} / ${totalPages}`;
  $("prevPage").disabled = state.page <= 1;
  $("nextPage").disabled = state.page >= totalPages;
  renderTable($("recordTable"), ["Template", "Extraction", "Batch", "Date", "Words", "Pages", "Op", "File"], pageRows, (row) => [
    `<span class="pill">${escapeHtml(row["Template Type"])}</span>`,
    `<span class="pill ${row.Extraction === "Manual" ? "manual" : "auto"}">${escapeHtml(row.Extraction)}</span>`,
    escapeHtml(row["Batch Folder"]),
    escapeHtml(formatDate(row["Validation Date"])),
    numCell(row["Text Before Opinions"]),
    numCell(row["Document Page Count"]),
    escapeHtml(row["Operation Number"] || ""),
    `<span class="file-cell">${escapeHtml(row["File Name"])}</span>`,
  ]);
}

function recordSorter() {
  const sorters = {
    "words-desc": (a, b) => n(b["Text Before Opinions"]) - n(a["Text Before Opinions"]),
    "words-asc": (a, b) => n(a["Text Before Opinions"]) - n(b["Text Before Opinions"]),
    "pages-desc": (a, b) => n(b["Document Page Count"]) - n(a["Document Page Count"]),
    "date-desc": (a, b) => String(b["Validation Date"] || "").localeCompare(String(a["Validation Date"] || "")),
    "manual-first": (a, b) => Number(b.Extraction === "Manual") - Number(a.Extraction === "Manual"),
  };
  return sorters[state.recordSort];
}

function renderBatchTable(rows) {
  renderTable($("batchTable"), ["Batch", "Templates", "Documents", "Manual Rate", "Mean Words", "Pages", "Flags"], rows, (row) => [
    `<button class="link-button" type="button" data-batch-lock="${escapeAttr(row.batch)}">${escapeHtml(row.batch)}</button>`,
    escapeHtml(row.templates),
    numCell(row.documents),
    `${fmtPct.format(row.manualRate)}%`,
    numCell(row.meanWords),
    numCell(row.pages),
    numCell(row.qualityFlags),
  ]);
  $("batchTable").querySelectorAll("[data-batch-lock]").forEach((button) => {
    button.addEventListener("click", () => lockBatch(button.dataset.batchLock));
  });
}

function renderQualityTable() {
  const rows = state.filtered.filter(hasQualityIssue).slice(0, 250);
  renderTable($("qualityTable"), ["Flags", "Template", "Extraction", "Batch", "Date", "Words", "File"], rows, (row) => [
    qualityFlags(row).map((flag) => `<span class="pill manual">${escapeHtml(flag)}</span>`).join(" "),
    `<span class="pill">${escapeHtml(row["Template Type"])}</span>`,
    `<span class="pill ${row.Extraction === "Manual" ? "manual" : "auto"}">${escapeHtml(row.Extraction)}</span>`,
    escapeHtml(row["Batch Folder"]),
    escapeHtml(formatDate(row["Validation Date"])),
    numCell(row["Text Before Opinions"]),
    `<span class="file-cell">${escapeHtml(row["File Name"])}</span>`,
  ]);
}

function renderTable(table, headers, rows, rowFn) {
  if (!rows.length) {
    table.innerHTML = `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody><tr><td colspan="${headers.length}">No records match the current filters.</td></tr></tbody>`;
    return;
  }
  table.innerHTML = `<thead><tr>${headers
    .map((h) => `<th class="${["Documents", "Words", "Pages", "Flags"].some((x) => h.includes(x)) ? "num" : ""}">${escapeHtml(h)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${rowFn(row).map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
}

function numCell(value) {
  return `<span class="num">${fmtInt.format(n(value))}</span>`;
}

function renderHorizontalBars(container, data, options) {
  if (!data.length) return empty(container);
  const height = Math.max(300, 52 + data.length * 30);
  const svg = makeSvg(container, 900, height);
  const margin = { top: 18, right: 90, bottom: 30, left: 180 };
  const width = 900 - margin.left - margin.right;
  const max = options.max || Math.max(...data.map(options.value), 1);
  svg.innerHTML = data
    .map((d, i) => {
      const y = margin.top + i * 30;
      const value = options.value(d);
      const barW = max ? (value / max) * width : 0;
      return `<g class="bar" data-index="${i}" data-tip="${escapeAttr(options.tip ? options.tip(d) : `${options.label(d)}: ${value}`)}">
        <text x="${margin.left - 10}" y="${y + 18}" text-anchor="end" fill="${COLORS.ink}" font-size="12">${escapeHtml(shortLabel(options.label(d), 24))}</text>
        <rect x="${margin.left}" y="${y + 4}" width="${Math.max(2, barW)}" height="17" rx="4" fill="${options.color(d, i)}"></rect>
        <text x="${margin.left + barW + 8}" y="${y + 18}" fill="${COLORS.neutral}" font-size="12">${fmtOne.format(value)}${options.suffix || ""}</text>
      </g>`;
    })
    .join("");
  bindSvgTips(svg);
  if (options.onClick) {
    svg.querySelectorAll(".bar").forEach((node) => {
      node.addEventListener("click", () => options.onClick(data[Number(node.dataset.index)]));
    });
  }
}

function renderVerticalBars(container, data, options) {
  if (!data.length) return empty(container);
  const svg = makeSvg(container, 900, 330);
  const margin = { top: 25, right: 20, bottom: 72, left: 74 };
  const width = 900 - margin.left - margin.right;
  const height = 330 - margin.top - margin.bottom;
  const max = Math.max(...data.map(options.value), 1);
  const step = width / data.length;
  svg.innerHTML =
    gridY(max, margin, width, height, 4).join("") +
    data
      .map((d, i) => {
        const value = options.value(d);
        const barH = (value / max) * height;
        const x = margin.left + i * step + step * 0.18;
        const barW = Math.max(10, step * 0.64);
        const y = margin.top + height - barH;
        return `<g data-tip="${escapeAttr(options.tip ? options.tip(d) : `${options.label(d)}: ${value}`)}">
          <rect class="bar" x="${x}" y="${y}" width="${barW}" height="${barH}" rx="5" fill="${options.color(d, i)}"></rect>
          <text x="${x + barW / 2}" y="${margin.top + height + 20}" text-anchor="middle" fill="${COLORS.ink}" font-size="11">${escapeHtml(shortLabel(options.label(d), 11))}</text>
        </g>`;
      })
      .join("");
  bindSvgTips(svg);
  if (options.onClick) {
    svg.querySelectorAll(".bar").forEach((node, index) => {
      node.addEventListener("click", () => options.onClick(data[index]));
    });
  }
}

function renderDivergingBars(container, data, options) {
  if (!data.length) return empty(container);
  const height = Math.max(330, 58 + data.length * 28);
  const svg = makeSvg(container, 920, height);
  const margin = { top: 22, right: 92, bottom: 34, left: 306 };
  const width = 920 - margin.left - margin.right;
  const center = margin.left + width / 2;
  const max = Math.max(...data.map((d) => Math.abs(options.value(d))), 1);
  const nameX = 190;
  const negativeValueX = margin.left - 12;
  const positiveValueX = margin.left + width + 12;
  let html = `<line x1="${center}" x2="${center}" y1="${margin.top}" y2="${height - margin.bottom}" stroke="${COLORS.grid}" stroke-width="2"></line>`;
  html += data
    .map((d, i) => {
      const y = margin.top + i * 28;
      const value = options.value(d);
      const barW = (Math.abs(value) / max) * (width / 2);
      const x = value >= 0 ? center : center - barW;
      const color = value >= 0 ? COLORS.green : COLORS.rose;
      const valueLabel = options.valueFormat ? options.valueFormat(value) : `${value > 0 ? "+" : ""}${fmtOne.format(value)} pp`;
      const valueX = value >= 0 ? positiveValueX : negativeValueX;
      const valueAnchor = value >= 0 ? "start" : "end";
      return `<g class="bar" data-tip="${escapeAttr(options.tip(d))}">
        <text x="${nameX}" y="${y + 17}" text-anchor="end" fill="${COLORS.ink}" font-size="12">${escapeHtml(shortLabel(options.label(d), 24))}</text>
        <rect x="${x}" y="${y + 4}" width="${Math.max(2, barW)}" height="16" rx="4" fill="${color}"></rect>
        <text x="${valueX}" y="${y + 17}" text-anchor="${valueAnchor}" fill="${COLORS.neutral}" font-size="12">${valueLabel}</text>
      </g>`;
    })
    .join("");
  svg.innerHTML = html;
  bindSvgTips(svg);
}

function renderHeatMatrix(container, data, templates, departments) {
  const svg = makeSvg(container, 920, Math.max(330, 96 + templates.length * 48));
  const margin = { top: 54, right: 28, bottom: 42, left: 92 };
  const cellW = (920 - margin.left - margin.right) / departments.length;
  const cellH = 36;
  const max = Math.max(...data.map((d) => d.words), 1);
  const html = [
    ...departments.map(
      (dept, i) =>
        `<text x="${margin.left + i * cellW + cellW / 2}" y="30" text-anchor="middle" fill="${COLORS.ink}" font-size="11" font-weight="700">${dept}</text>`
    ),
    ...templates.map((template, ti) => {
      const y = margin.top + ti * 48;
      const label = `<text x="${margin.left - 14}" y="${y + 23}" text-anchor="end" fill="${COLORS.ink}" font-size="12" font-weight="800">${template}</text>`;
      const cells = departments
        .map((dept, di) => {
          const item = data.find((d) => d.template === template && d.dept === dept);
          const words = item ? item.words : 0;
          const opacity = words ? 0.16 + (words / max) * 0.84 : 0.04;
          return `<rect class="heat-cell" data-template-click="${template}" x="${margin.left + di * cellW + 4}" y="${y}" width="${Math.max(18, cellW - 8)}" height="${cellH}" rx="5" fill="${templateColor(template)}" opacity="${opacity}" data-tip="${template} / ${dept}<br>${fmtInt.format(words)} words<br>${fmtInt.format(item ? item.docs : 0)} documents<br>Click to filter ${template}"></rect>`;
        })
        .join("");
      return label + cells;
    }),
    `<text x="${margin.left}" y="${margin.top + templates.length * 48 + 28}" fill="${COLORS.neutral}" font-size="12">Darker cells mean more department-coded words within the active filters.</text>`,
  ].join("");
  svg.innerHTML = html;
  bindSvgTips(svg);
  bindTemplateClicks(svg);
}

function renderLineChart(container, data, options) {
  if (!data.length) return empty(container);
  const svg = makeSvg(container, 980, 420);
  const margin = { top: 25, right: 34, bottom: 58, left: 74 };
  const width = 980 - margin.left - margin.right;
  const height = 420 - margin.top - margin.bottom;
  const months = Array.from(new Set(data.map((d) => d.month))).sort();
  const templates = Array.from(new Set(data.map((d) => d.template))).sort();
  const max = Math.max(...data.map(options.value), 1);
  const x = (month) => margin.left + (months.indexOf(month) / Math.max(1, months.length - 1)) * width;
  const y = (value) => margin.top + height - (value / max) * height;
  const lookup = new Map(data.map((d) => [`${d.month}|${d.template}`, d]));
  let html = gridXY(months.length, max, margin, width, height, { yLabel: options.label });
  templates.forEach((template) => {
    const points = months
      .map((month) => lookup.get(`${month}|${template}`))
      .filter(Boolean);
    if (!points.length) return;
    const path = points.map((d, i) => `${i === 0 ? "M" : "L"} ${x(d.month)} ${y(options.value(d))}`).join(" ");
    html += `<path d="${path}" fill="none" stroke="${templateColor(template)}" stroke-width="3"></path>`;
    html += points
      .map((d) => `<circle class="point" cx="${x(d.month)}" cy="${y(options.value(d))}" r="4" fill="${templateColor(template)}" data-tip="${escapeAttr(options.tip(d))}"></circle>`)
      .join("");
    if (options.movingAverage) {
      const ma = movingAverage(points, options.value);
      const maPath = ma.map((d, i) => `${i === 0 ? "M" : "L"} ${x(d.month)} ${y(d.value)}`).join(" ");
      html += `<path d="${maPath}" fill="none" stroke="${templateColor(template)}" stroke-width="2" opacity="0.38" stroke-dasharray="6 5"></path>`;
    }
  });
  html += monthTicks(months, margin, width, height);
  html += templates
    .map((template, i) => `<g><rect x="${margin.left + i * 88}" y="395" width="12" height="12" rx="2" fill="${templateColor(template)}"></rect><text x="${margin.left + 18 + i * 88}" y="406" fill="${COLORS.ink}" font-size="12">${template}</text></g>`)
    .join("");
  svg.innerHTML = html;
  bindSvgTips(svg);
}

function movingAverage(points, valueFn) {
  return points.map((point, i) => {
    const window = points.slice(Math.max(0, i - 2), i + 1);
    return { month: point.month, value: mean(window.map(valueFn)) };
  });
}

function gridY(max, margin, width, height, ticks) {
  const lines = [];
  for (let i = 0; i <= ticks; i += 1) {
    const value = (max / ticks) * i;
    const y = margin.top + height - (value / max) * height;
    lines.push(`<line class="grid-line" x1="${margin.left}" x2="${margin.left + width}" y1="${y}" y2="${y}"></line>`);
    lines.push(`<text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" fill="${COLORS.neutral}" font-size="11">${fmtInt.format(value)}</text>`);
  }
  return lines;
}

function gridXY(xMax, yMax, margin, width, height) {
  const lines = gridY(yMax, margin, width, height, 5).join("");
  return (
    lines +
    `<line x1="${margin.left}" x2="${margin.left + width}" y1="${margin.top + height}" y2="${margin.top + height}" stroke="${COLORS.grid}"></line>
     <line x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${margin.top + height}" stroke="${COLORS.grid}"></line>`
  );
}

function monthTicks(months, margin, width, height) {
  const step = Math.max(1, Math.ceil(months.length / 12));
  return months
    .filter((_, i) => i % step === 0)
    .map((month) => {
      const x = margin.left + (months.indexOf(month) / Math.max(1, months.length - 1)) * width;
      return `<text x="${x}" y="${margin.top + height + 25}" text-anchor="middle" fill="${COLORS.neutral}" font-size="11">${month}</text>`;
    })
    .join("");
}

function bindSvgTips(svg) {
  svg.querySelectorAll("[data-tip]").forEach((node) => {
    node.addEventListener("mousemove", (event) => tooltip(node.dataset.tip, event));
    node.addEventListener("mouseleave", hideTooltip);
  });
}

function bindTemplateClicks(svg) {
  svg.querySelectorAll("[data-template-click]").forEach((node) => {
    node.addEventListener("click", () => lockTemplate(node.dataset.templateClick));
  });
}

function lockTemplate(template) {
  state.selectedTemplates = new Set([template]);
  document.querySelectorAll("[data-template]").forEach((button) => {
    button.classList.toggle("active", button.dataset.template === template);
  });
  state.page = 1;
  update();
}

function lockBatch(batch) {
  state.batch = batch;
  $("batchFilter").value = batch;
  state.page = 1;
  update();
}

function filterSearchToService(service) {
  state.serviceFocus = state.serviceFocus === service ? "" : service;
  state.page = 1;
  update();
}

function downloadFilteredCsv() {
  const columns = [
    "Batch Folder",
    "Template Type",
    "Extraction",
    "MC_Note_Type",
    "File Name",
    "Operation Number",
    "Validation Date",
    "Document Page Count",
    "Page count before opinion",
    "Annex Page Count",
    "Text Before Opinions",
    "GED Match Status",
  ];
  const csv = [
    columns.join(","),
    ...state.filtered.map((row) =>
      columns
        .map((col) => {
          const value = row[col] ?? "";
          return `"${String(value).replaceAll('"', '""')}"`;
        })
        .join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "mc_notes_filtered_records.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

async function init() {
  const response = await fetch(`dashboard_data.json?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load dashboard_data.json");
  state.raw = await response.json();
  state.records = state.raw.records;
  populateFilters();
  bindEvents();
  update();
}

init().catch((error) => {
  document.body.innerHTML = `<main class="main-panel"><article class="panel"><div class="panel-header"><div><h3>Dashboard load failed</h3><p>${escapeHtml(
    error.message
  )}</p></div></div></article></main>`;
});
