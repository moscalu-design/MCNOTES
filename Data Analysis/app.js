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
  view: "overview",
  distributionMetric: "Text Before Opinions",
  batchSort: "documents",
  recordSort: "words-desc",
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
    if (state.selectedTemplates.has(value) && state.selectedTemplates.size > 1) {
      state.selectedTemplates.delete(value);
    } else {
      state.selectedTemplates.add(value);
    }
    button.classList.toggle("active", state.selectedTemplates.has(value));
    state.page = 1;
    update();
  });

  $("extractionFilters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-extraction]");
    if (!button) return;
    const value = button.dataset.extraction;
    if (state.selectedExtractions.has(value) && state.selectedExtractions.size > 1) {
      state.selectedExtractions.delete(value);
    } else {
      state.selectedExtractions.add(value);
    }
    button.classList.toggle("active", state.selectedExtractions.has(value));
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
      state.view = button.dataset.view;
      document.querySelectorAll(".tab-button").forEach((node) => {
        node.classList.toggle("active", node === button);
      });
      document.querySelectorAll("[data-view-panel]").forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.viewPanel === state.view);
      });
      updateCharts();
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
  $("hideFutureDates").checked = false;
  $("onlyQualityIssues").checked = false;
  state.page = 1;
  update();
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
    renderCalendarHeatmap();
  }
  if (state.view === "batches") renderBatchView();
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
  const totals = DEPARTMENTS.map((dept) => ({
    dept,
    words: state.filtered.reduce((sum, row) => sum + n(row[dept]), 0),
    docs: state.filtered.filter((row) => n(row[dept]) > 0).length,
  }))
    .filter((d) => d.words > 0)
    .sort((a, b) => b.words - a.words)
    .slice(0, 12);
  renderVerticalBars(container, totals, {
    label: (d) => d.dept,
    value: (d) => d.words,
    color: (_, i) => ["#376996", "#2a9d8f", "#c1666b", "#b88a2c", "#7759a6", "#2f8db3"][i % 6],
    tip: (d) => `${d.dept}<br>${fmtInt.format(d.words)} words<br>${fmtInt.format(d.docs)} documents`,
  });
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

function renderTimeVolumeChart() {
  const data = monthlyGroups(state.filtered);
  renderLineChart($("timeVolumeChart"), data, {
    value: (d) => d.documents,
    label: "Documents",
    tip: (d) => `${d.month} ${d.template}<br>${fmtInt.format(d.documents)} documents`,
  });
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
  const response = await fetch("dashboard_data.json");
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
