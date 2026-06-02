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

const MC_NOTE_TYPES = ["NOTEMCDEC", "NOTEMCDISC", "NOTEMCINFO"];
const MC_NOTE_TYPE_LABELS = {
  NOTEMCDEC: "Decision",
  NOTEMCDISC: "Discussion",
  NOTEMCINFO: "Info",
};
const PAGE_COMPOSITION_PARTS = ["Pre-opinion", "Opinion", "Annex"];
const PAGE_COMPOSITION_COLORS = {
  "Pre-opinion": "#376996",
  Opinion: "#2a9d8f",
  Annex: "#b38b00",
};
const AFS_PROCESS_COLORS = {
  Old: "#b38b00",
  New: "#376996",
};

const state = {
  raw: null,
  records: [],
  filtered: [],
  selectedTemplates: new Set(),
  selectedMcNoteTypes: new Set(MC_NOTE_TYPES),
  selectedExtractions: new Set(),
  batch: "All",
  product: "All",
  ged: "All",
  dateFrom: "",
  dateTo: "",
  search: "",
  hideFutureDates: false,
  excludePre2023Validation: false,
  onlyQualityIssues: false,
  serviceFocus: "",
  opinionWordFloor: 0,
  view: "services",
  distributionMetric: "Text Before Opinions",
  batchSort: "documents",
  recordSort: "words-desc",
  testDetail: "all-warnings",
  serviceWindow: "all",
  serviceMomentumMetric: "meanWords",
  overviewTrendMetric: "Document Page Count",
  timeTrendMetric: "Document Page Count",
  pageTrendMetric: "Document Page Count",
  pageTrendPeriod: "month",
  selectedMcMonthTypes: new Set(MC_NOTE_TYPES),
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

function timelineDate(row) {
  const date = row["BO Validation Date"] || "";
  return date === "2000-01-01" ? "" : date;
}

function timelineMonth(row) {
  const month = row["BO Validation Month"] || "";
  return month === "2000-01" ? "" : month;
}

function opinionPassesFloor(words) {
  return n(words) > state.opinionWordFloor;
}

function opinionFloorText() {
  return state.opinionWordFloor > 0
    ? `Excluding service opinions with ${fmtInt.format(state.opinionWordFloor)} words or fewer.`
    : "Including all service opinions.";
}

function shortLabel(value, max = 28) {
  const text = String(value ?? "Missing");
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function templateColor(template) {
  return COLORS[template] || COLORS.neutral;
}

function categoryColor(value, index = 0) {
  const named = {
    NOTEMCDEC: "#376996",
    NOTEMCINFO: "#2a9d8f",
    NOTEMCDISC: "#c1666b",
  };
  const palette = ["#376996", "#2a9d8f", "#c1666b", "#b88a2c", "#7759a6", "#2f8db3"];
  return named[value] || palette[index % palette.length];
}

function mcNoteTypeDisplay(value) {
  return MC_NOTE_TYPE_LABELS[value] || value || "Missing";
}

function hasQualityIssue(row) {
  return Boolean(
    row["Has Missing Date"] ||
      row["Is Future Date"] ||
      row["Has Missing BO Date"]
  );
}

function qualityFlags(row) {
  const flags = [];
  if (row["Has Missing Date"]) flags.push("Missing date");
  if (row["Is Future Date"]) flags.push("Future date");
  if (row["Has Missing BO Date"]) flags.push("Missing BO date");
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
  const boDates = rows.filter((row) => row["BO Validation Date"]).length;
  const dates = rows.map(timelineDate).filter(Boolean).sort();
  return {
    docs,
    words,
    pages,
    manual,
    future,
    quality,
    boDates,
    meanWords: mean(rows.map((row) => row["Text Before Opinions"])),
    medianWords: quantile(rows.map((row) => row["Text Before Opinions"]), 0.5),
    meanPages: mean(rows.map((row) => row["Document Page Count"])),
    medianPages: quantile(rows.map((row) => row["Document Page Count"]), 0.5),
    serviceOpinions: serviceOpinionRows(rows).length,
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
  const dates = records.map(timelineDate).filter(Boolean).sort();
  return { min: dates[0] || "", max: dates[dates.length - 1] || "" };
}

function populateFilters() {
  const templates = state.raw.meta.templates;
  const extractions = state.raw.meta.extractions;
  state.selectedTemplates = new Set(templates);
  state.selectedMcNoteTypes = new Set(MC_NOTE_TYPES);
  state.selectedExtractions = new Set(extractions);

  $("templateFilters").innerHTML = templates
    .map((name) => `<button class="chip active" type="button" data-template="${escapeAttr(name)}">${escapeHtml(name)}</button>`)
    .join("");
  $("mcNoteTypeFilters").innerHTML = MC_NOTE_TYPES.map(
    (name) => `<button class="chip active" type="button" data-mc-filter-type="${escapeAttr(name)}">${escapeHtml(mcNoteTypeDisplay(name))}</button>`
  ).join("");
  $("extractionFilters").innerHTML = extractions
    .map((name) => `<button class="chip active" type="button" data-extraction="${escapeAttr(name)}">${escapeHtml(name)}</button>`)
    .join("");

  const batches = ["All", ...state.raw.meta.batchFolders];
  $("batchFilter").innerHTML = batches
    .map((batch) => `<option value="${escapeAttr(batch)}">${escapeHtml(batch)}</option>`)
    .join("");

  if ($("productFilter")) {
    const products = ["All", ...(state.raw.meta.products || [])];
    $("productFilter").innerHTML = products
      .map((product) => `<option value="${escapeAttr(product)}">${escapeHtml(shortLabel(product, 58))}</option>`)
      .join("");
  }

  if ($("gedFilter")) {
    const gedValues = Array.from(
      new Set(state.records.map((row) => row["GED Match Status"] || "Missing GED status"))
    ).sort();
    $("gedFilter").innerHTML = ["All", ...gedValues]
      .map((value) => `<option value="${escapeAttr(value)}">${escapeHtml(shortLabel(value, 48))}</option>`)
      .join("");
  }

  const bounds = getDateBounds(state.records);
  if ($("dateFrom")) {
    $("dateFrom").min = bounds.min;
    $("dateFrom").max = bounds.max;
    $("dateFrom").value = "";
  }
  if ($("dateTo")) {
    $("dateTo").min = bounds.min;
    $("dateTo").max = bounds.max;
    $("dateTo").value = "";
  }
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

  $("mcNoteTypeFilters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-mc-filter-type]");
    if (!button) return;
    const value = button.dataset.mcFilterType;
    if (state.selectedMcNoteTypes.has(value)) {
      state.selectedMcNoteTypes.delete(value);
    } else {
      state.selectedMcNoteTypes.add(value);
    }
    document.querySelectorAll("[data-mc-filter-type]").forEach((node) => {
      node.classList.toggle("active", state.selectedMcNoteTypes.has(node.dataset.mcFilterType));
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

  if ($("productFilter")) {
    $("productFilter").addEventListener("change", (event) => {
      state.product = event.target.value;
      state.page = 1;
      update();
    });
  }

  if ($("gedFilter")) {
    $("gedFilter").addEventListener("change", (event) => {
      state.ged = event.target.value;
      state.page = 1;
      update();
    });
  }

  if ($("dateFrom")) {
    $("dateFrom").addEventListener("change", (event) => {
      state.dateFrom = event.target.value;
      state.page = 1;
      update();
    });
  }

  if ($("dateTo")) {
    $("dateTo").addEventListener("change", (event) => {
      state.dateTo = event.target.value;
      state.page = 1;
      update();
    });
  }

  if ($("searchInput")) {
    $("searchInput").addEventListener("input", (event) => {
      state.search = event.target.value.trim().toLowerCase();
      state.page = 1;
      update();
    });
  }

  if ($("hideFutureDates")) {
    $("hideFutureDates").addEventListener("change", (event) => {
      state.hideFutureDates = event.target.checked;
      state.page = 1;
      update();
    });
  }

  $("excludePre2023Validation").addEventListener("change", (event) => {
    state.excludePre2023Validation = event.target.checked;
    state.page = 1;
    update();
  });

  if ($("onlyQualityIssues")) {
    $("onlyQualityIssues").addEventListener("change", (event) => {
      state.onlyQualityIssues = event.target.checked;
      state.page = 1;
      update();
    });
  }

  $("applyOpinionThreshold").addEventListener("click", applyOpinionThreshold);
  $("opinionThresholdInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") applyOpinionThreshold();
  });
  $("resetOpinionThreshold").addEventListener("click", () => {
    state.opinionWordFloor = 0;
    $("opinionThresholdInput").value = 0;
    $("opinionThresholdStatus").textContent = opinionFloorText();
    state.page = 1;
    update();
  });

  if ($("resetFilters")) $("resetFilters").addEventListener("click", resetFilters);
  $("clearAllFilters").addEventListener("click", resetFilters);
  $("collapseSlicers").addEventListener("click", () => {
    document.querySelector(".sidebar").classList.toggle("compact");
  });
  $("focusServices").addEventListener("click", () => switchView("services"));
  $("focusTests").addEventListener("click", () => switchView("tests"));
  $("refreshData").addEventListener("click", refreshDashboardData);
  if ($("downloadFiltered")) $("downloadFiltered").addEventListener("click", downloadFilteredCsv);
  const elevenFace = $("elevenFace");
  if (elevenFace) {
    elevenFace.addEventListener("click", triggerDogRain);
    elevenFace.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        triggerDogRain();
      }
    });
  }
  document.addEventListener("click", (event) => {
    if (event.target.closest("#elevenFace")) triggerDogRain();
  });
  if ($("distributionMetric")) {
    $("distributionMetric").addEventListener("change", (event) => {
      state.distributionMetric = event.target.value;
      updateCharts();
    });
  }
  if ($("batchSort")) {
    $("batchSort").addEventListener("change", (event) => {
      state.batchSort = event.target.value;
      renderBatchView();
    });
  }
  if ($("overviewTrendMetric")) {
    $("overviewTrendMetric").addEventListener("change", (event) => {
      state.overviewTrendMetric = event.target.value;
      renderOverviewPageTrendChart();
    });
  }
  if ($("timeTrendMetric")) {
    $("timeTrendMetric").addEventListener("change", (event) => {
      state.timeTrendMetric = event.target.value;
      renderTimePagesChart();
    });
  }
  if ($("pageTrendMetric")) {
    $("pageTrendMetric").addEventListener("change", (event) => {
      state.pageTrendMetric = event.target.value;
      renderPageTrendChart();
    });
  }
  if ($("pageTrendPeriod")) {
    $("pageTrendPeriod").addEventListener("change", (event) => {
      state.pageTrendPeriod = event.target.value;
      renderPageTrendChart();
    });
  }
  document.querySelectorAll("[data-mc-month-type]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const type = event.target.dataset.mcMonthType;
      if (event.target.checked) {
        state.selectedMcMonthTypes.add(type);
      } else {
        state.selectedMcMonthTypes.delete(type);
      }
      updateMcTypeControls();
      renderMcNoteTypeMonthChart();
    });
  });
  $("recordSort").addEventListener("change", (event) => {
    state.recordSort = event.target.value;
    state.page = 1;
    renderRecordTable();
  });
  if ($("serviceWindow")) {
    $("serviceWindow").addEventListener("change", (event) => {
      state.serviceWindow = event.target.value;
      renderServicesView();
    });
  }
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
  state.selectedMcNoteTypes = new Set(MC_NOTE_TYPES);
  state.selectedExtractions = new Set(state.raw.meta.extractions);
  document.querySelectorAll("[data-template], [data-mc-filter-type], [data-extraction]").forEach((button) => {
    button.classList.add("active");
  });
  state.batch = "All";
  state.product = "All";
  state.ged = "All";
  $("batchFilter").value = "All";
  if ($("productFilter")) $("productFilter").value = "All";
  if ($("gedFilter")) $("gedFilter").value = "All";
  const bounds = getDateBounds(state.records);
  state.dateFrom = "";
  state.dateTo = "";
  if ($("dateFrom")) $("dateFrom").value = "";
  if ($("dateTo")) $("dateTo").value = "";
  state.search = "";
  if ($("searchInput")) $("searchInput").value = "";
  state.hideFutureDates = false;
  state.excludePre2023Validation = false;
  state.onlyQualityIssues = false;
  state.serviceFocus = "";
  state.opinionWordFloor = 0;
  state.selectedMcMonthTypes = new Set(MC_NOTE_TYPES);
  $("opinionThresholdInput").value = 0;
  $("opinionThresholdStatus").textContent = opinionFloorText();
  if ($("hideFutureDates")) $("hideFutureDates").checked = false;
  $("excludePre2023Validation").checked = false;
  if ($("onlyQualityIssues")) $("onlyQualityIssues").checked = false;
  updateMcTypeControls();
  state.page = 1;
  update();
}

function captureFilterState() {
  return {
    selectedTemplates: new Set(state.selectedTemplates),
    selectedMcNoteTypes: new Set(state.selectedMcNoteTypes),
    selectedExtractions: new Set(state.selectedExtractions),
    batch: state.batch,
    product: state.product,
    ged: state.ged,
    dateFrom: state.dateFrom,
    dateTo: state.dateTo,
    search: state.search,
    hideFutureDates: state.hideFutureDates,
    excludePre2023Validation: state.excludePre2023Validation,
    onlyQualityIssues: state.onlyQualityIssues,
    serviceFocus: state.serviceFocus,
    opinionWordFloor: state.opinionWordFloor,
    selectedMcMonthTypes: new Set(state.selectedMcMonthTypes),
    page: state.page,
  };
}

function restoreFilterState(snapshot) {
  const templates = state.raw.meta.templates || [];
  const extractions = state.raw.meta.extractions || [];
  const batches = state.raw.meta.batchFolders || [];
  const products = state.raw.meta.products || [];
  const gedValues = Array.from(new Set(state.records.map((row) => row["GED Match Status"] || "Missing GED status")));

  const selectedTemplates = Array.from(snapshot.selectedTemplates).filter((value) => templates.includes(value));
  state.selectedTemplates = new Set(selectedTemplates.length ? selectedTemplates : templates);
  const selectedMcNoteTypes = Array.from(snapshot.selectedMcNoteTypes || MC_NOTE_TYPES).filter((value) => MC_NOTE_TYPES.includes(value));
  state.selectedMcNoteTypes = new Set(selectedMcNoteTypes);
  const selectedExtractions = Array.from(snapshot.selectedExtractions).filter((value) => extractions.includes(value));
  state.selectedExtractions = new Set(selectedExtractions.length ? selectedExtractions : extractions);

  state.batch = snapshot.batch === "All" || batches.includes(snapshot.batch) ? snapshot.batch : "All";
  state.product = snapshot.product === "All" || products.includes(snapshot.product) ? snapshot.product : "All";
  state.ged = snapshot.ged === "All" || gedValues.includes(snapshot.ged) ? snapshot.ged : "All";
  state.dateFrom = snapshot.dateFrom;
  state.dateTo = snapshot.dateTo;
  state.search = snapshot.search;
  state.hideFutureDates = snapshot.hideFutureDates;
  state.excludePre2023Validation = Boolean(snapshot.excludePre2023Validation);
  state.onlyQualityIssues = snapshot.onlyQualityIssues;
  state.serviceFocus = snapshot.serviceFocus;
  state.opinionWordFloor = snapshot.opinionWordFloor;
  state.selectedMcMonthTypes = new Set(
    Array.from(snapshot.selectedMcMonthTypes || MC_NOTE_TYPES).filter((type) => MC_NOTE_TYPES.includes(type))
  );
  if (!state.selectedMcMonthTypes.size) state.selectedMcMonthTypes = new Set(MC_NOTE_TYPES);
  state.page = snapshot.page || 1;

  document.querySelectorAll("[data-template]").forEach((button) => {
    button.classList.toggle("active", state.selectedTemplates.has(button.dataset.template));
  });
  document.querySelectorAll("[data-mc-filter-type]").forEach((button) => {
    button.classList.toggle("active", state.selectedMcNoteTypes.has(button.dataset.mcFilterType));
  });
  document.querySelectorAll("[data-extraction]").forEach((button) => {
    button.classList.toggle("active", state.selectedExtractions.has(button.dataset.extraction));
  });
  $("batchFilter").value = state.batch;
  if ($("productFilter")) $("productFilter").value = state.product;
  if ($("gedFilter")) $("gedFilter").value = state.ged;
  if ($("dateFrom")) $("dateFrom").value = state.dateFrom;
  if ($("dateTo")) $("dateTo").value = state.dateTo;
  if ($("searchInput")) $("searchInput").value = state.search;
  if ($("hideFutureDates")) $("hideFutureDates").checked = state.hideFutureDates;
  $("excludePre2023Validation").checked = state.excludePre2023Validation;
  if ($("onlyQualityIssues")) $("onlyQualityIssues").checked = state.onlyQualityIssues;
  $("opinionThresholdInput").value = state.opinionWordFloor;
  $("opinionThresholdStatus").textContent = opinionFloorText();
}

function updateMcTypeControls() {
  document.querySelectorAll("[data-mc-month-type]").forEach((input) => {
    input.checked = state.selectedMcMonthTypes.has(input.dataset.mcMonthType);
    input.closest(".checkbox-pill")?.classList.toggle("active", input.checked);
  });
}

function applyOpinionThreshold() {
  const raw = Number($("opinionThresholdInput").value);
  state.opinionWordFloor = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  $("opinionThresholdInput").value = state.opinionWordFloor;
  $("opinionThresholdStatus").textContent = opinionFloorText();
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
    if (!state.selectedMcNoteTypes.has(mcNoteTypeLabel(row))) return false;
    if (!state.selectedExtractions.has(row.Extraction)) return false;
    if (state.batch !== "All" && row["Batch Folder"] !== state.batch) return false;
    if (state.product !== "All" && row["Financing Product Name"] !== state.product) return false;
    const ged = row["GED Match Status"] || "Missing GED status";
    if (state.ged !== "All" && ged !== state.ged) return false;
    const date = timelineDate(row);
    if (state.dateFrom && date && date < state.dateFrom) return false;
    if (state.dateTo && date && date > state.dateTo) return false;
    if (state.dateFrom && !date) return false;
    if (state.excludePre2023Validation && (!date || date < "2023-01-01")) return false;
    if (state.hideFutureDates && row["Is Future Date"]) return false;
    if (state.onlyQualityIssues && !hasQualityIssue(row)) return false;
    if (state.serviceFocus && !opinionPassesFloor(row[state.serviceFocus])) return false;
    if (search) {
      const haystack = [
        row["File Name"],
        row["Operation Number"],
        row["MC_Note_Type"],
        row["Batch Folder"],
        row["Template Type"],
        row["Financing Product Name"],
        row["BO PJ"],
        row["BO RM"],
        row["BO JU"],
        row["BO ECON"],
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
  if (state.selectedMcNoteTypes.size !== MC_NOTE_TYPES.length) {
    parts.push(`MC Note Type: ${Array.from(state.selectedMcNoteTypes).join(", ")}`);
  }
  if (state.selectedExtractions.size !== state.raw.meta.extractions.length) {
    parts.push(`Extraction: ${Array.from(state.selectedExtractions).join(", ")}`);
  }
  if (state.batch !== "All") parts.push(`Batch: ${state.batch}`);
  if (state.product !== "All") parts.push(`Product: ${shortLabel(state.product, 24)}`);
  if (state.ged !== "All") parts.push(`GED: ${shortLabel(state.ged, 26)}`);
  if (state.dateFrom || state.dateTo) parts.push(`Date: ${state.dateFrom || "..."} to ${state.dateTo || "..."}`);
  if (state.excludePre2023Validation) parts.push("BO date >= 01/01/2023");
  if (state.search) parts.push(`Search: ${state.search}`);
  if (state.hideFutureDates) parts.push("Future dates hidden");
  if (state.onlyQualityIssues) parts.push("Quality rows only");
  if (state.serviceFocus) parts.push(`Service: ${state.serviceFocus}`);
  if (state.opinionWordFloor > 0) parts.push(`Opinion floor: > ${state.opinionWordFloor} words`);
  return parts.length ? parts.join(" | ") : "All records";
}

function updateCharts() {
  if (state.view === "overview") {
    renderOverviewPageTrendChart();
  }
  if (state.view === "services") renderServicesView();
  if (state.view === "pages") renderPagesView();
  if (state.view === "noteTypes") renderNoteTypesView();
  if (state.view === "authors") renderAuthorsView();
  if (state.view === "batches") renderBatchView();
  if (state.view === "tests") renderTestsView();
  if (state.view === "quality") renderQualityView();
  if (state.view === "records") renderRecordTable();
}

function renderKpis() {
  const s = summarize(state.filtered);
  const qualityRate = s.docs ? (s.quality / s.docs) * 100 : 0;
  const kpis = [
    ["Documents", fmtInt.format(s.docs), "Current filter"],
    ["Total Pages", fmtInt.format(s.pages), "Document page count"],
    ["Mean Pages", fmtOne.format(s.meanPages), "Per document"],
    ["Median Pages", fmtOne.format(s.medianPages), "Per document"],
    ["Service Opinions", fmtInt.format(s.serviceOpinions), "Positive service sections"],
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
    .filter((row) => timelineMonth(row))
    .forEach((row) => {
      const key = `${timelineMonth(row)}|${row["Template Type"]}`;
      if (!map.has(key)) {
        map.set(key, { month: timelineMonth(row), template: row["Template Type"], rows: [] });
      }
      map.get(key).rows.push(row);
    });
  return Array.from(map.values())
    .map((item) => ({
      ...item,
      documents: item.rows.length,
      meanWords: mean(item.rows.map((row) => row["Text Before Opinions"])),
      meanPages: mean(item.rows.map((row) => row["Document Page Count"])),
      meanTextBeforeOpinions: mean(item.rows.map((row) => row["Text Before Opinions"])),
      words: item.rows.reduce((sum, row) => sum + n(row["Text Before Opinions"]), 0),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function serviceOpinionRows(rows) {
  const out = [];
  rows.forEach((row) => {
    if (!timelineMonth(row)) return;
    DEPARTMENTS.forEach((service) => {
      const words = n(row[service]);
      if (opinionPassesFloor(words)) {
        out.push({
          template: row["Template Type"],
          service,
          month: timelineMonth(row),
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
        .filter((row) => timelineMonth(row) && !row["Is Future Date"])
      .map(timelineMonth)
    )
  ).sort();
  const templateMonthDocs = new Map();
  rows
    .filter((row) => timelineMonth(row) && !row["Is Future Date"])
    .forEach((row) => {
      const template = row["Template Type"];
      const month = timelineMonth(row);
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

function renderOverviewPageTrendChart() {
  const data = monthlyGroups(state.filtered);
  const metric = trendMetricConfig(state.overviewTrendMetric);
  renderLineChart($("overviewPageTrendChart"), data, {
    value: metric.value,
    label: metric.axisLabel,
    movingAverage: true,
    tip: (d) => `${d.month} ${d.template}<br>${metric.format(metric.value(d))} ${metric.tipLabel}<br>${fmtInt.format(d.documents)} documents`,
  });
}

function trendMetricConfig(metric) {
  if (metric === "Text Before Opinions") {
    return {
      value: (d) => d.meanTextBeforeOpinions,
      axisLabel: "Mean Text Before Opinions",
      tipLabel: "mean text-before-opinions words",
      format: (value) => fmtInt.format(value),
    };
  }
  return {
    value: (d) => d.meanPages,
    axisLabel: "Mean Pages",
    tipLabel: "mean pages",
    format: (value) => fmtOne.format(value),
  };
}

function renderServicesView() {
  renderServiceMomentumChart();
  renderServiceVolumeLengthChart();
  renderServiceTable();
  renderBoTeamExtremesTable();
}

const BO_SERVICE_TEAM_COLUMNS = [
  ["PJ", "BO PJ"],
  ["RM", "BO RM"],
  ["JU", "BO JU"],
  ["ECON", "BO ECON"],
];

function renderBoView() {
  renderBoValidationChart();
  renderProductMixChart();
  renderBoTeamTable();
  renderProductTable();
}

function boDateBucket(row) {
  if (!row["BO Validation Date"]) return "Missing BO date";
  const delta = Number(row["BO Validation Delta Days"]);
  if (!Number.isFinite(delta)) return "No MC date";
  if (delta === 0) return "Same day";
  if (delta < 0) return "BO before MC";
  return "BO after MC";
}

function renderBoValidationChart() {
  const order = ["Same day", "BO before MC", "BO after MC", "Missing BO date", "No MC date"];
  const grouped = groupBy(state.filtered, boDateBucket);
  const rows = order
    .map((bucket) => ({ bucket, count: (grouped.get(bucket) || []).length }))
    .filter((row) => row.count > 0);
  renderVerticalBars($("boValidationChart"), rows, {
    label: (d) => d.bucket,
    value: (d) => d.count,
    color: (_, i) => ["#00856f", "#376996", "#b38b00", "#b0444f", "#607080"][i % 5],
    tip: (d) => `${d.bucket}<br>${fmtInt.format(d.count)} records`,
  });
}

function productStats(rows) {
  return Array.from(groupBy(rows, (row) => row["Financing Product Name"] || "Missing product").entries())
    .map(([product, items]) => ({
      product,
      docs: items.length,
      templates: Array.from(new Set(items.map((row) => row["Template Type"]))).sort().join(", "),
      medianWords: quantile(items.map((row) => row["Text Before Opinions"]), 0.5),
      meanWords: mean(items.map((row) => row["Text Before Opinions"])),
      medianPages: quantile(items.map((row) => row["Document Page Count"]), 0.5),
      opinionCount: serviceOpinionRows(items).length,
      boDateCoverage: items.length ? (items.filter((row) => row["BO Validation Date"]).length / items.length) * 100 : 0,
    }))
    .sort((a, b) => b.docs - a.docs);
}

function renderProductMixChart() {
  const rows = productStats(state.filtered).slice(0, 12);
  renderHorizontalBars($("productMixChart"), rows, {
    label: (d) => d.product,
    value: (d) => d.docs,
    color: (_, i) => ["#003399", "#00856f", "#b38b00", "#6d5aa8", "#2a7f9e", "#b0444f"][i % 6],
    tip: (d) =>
      `${d.product}<br>${fmtInt.format(d.docs)} docs<br>${fmtInt.format(d.medianWords)} median words<br>${fmtPct.format(d.boDateCoverage)}% with BO date`,
  });
}

function boTeamOpinionRows(rows) {
  const out = [];
  rows.forEach((row) => {
    BO_SERVICE_TEAM_COLUMNS.forEach(([service, teamCol]) => {
      const words = n(row[service]);
      const team = String(row[teamCol] || "").trim();
      if (opinionPassesFloor(words) && team && !["#", "N/A", "NA", "NONE"].includes(team.toUpperCase())) {
        out.push({
          service,
          team,
          words,
          file: row["File Name"],
          template: row["Template Type"],
          product: row["Financing Product Name"] || "Missing product",
          validationDate: row["Validation Date"],
          boValidationDate: row["BO Validation Date"],
        });
      }
    });
  });
  return out;
}

function boTeamStats(rows) {
  return Array.from(groupBy(boTeamOpinionRows(rows), (item) => `${item.service}|${item.team}`).entries())
    .map(([key, items]) => {
      const [service, team] = key.split("|");
      return {
        service,
        team,
        opinions: items.length,
        documents: new Set(items.map((item) => item.file)).size,
        totalWords: items.reduce((sum, item) => sum + item.words, 0),
        meanWords: mean(items.map((item) => item.words)),
        medianWords: quantile(items.map((item) => item.words), 0.5),
        topProduct: topCategory(items.map((item) => item.product)),
        templates: Array.from(new Set(items.map((item) => item.template))).sort().join(", "),
      };
    })
    .sort((a, b) => b.opinions - a.opinions || b.medianWords - a.medianWords);
}

function topCategory(values) {
  const counts = Array.from(groupBy(values.filter(Boolean), (value) => value).entries()).map(([value, items]) => ({
    value,
    count: items.length,
  }));
  counts.sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
  return counts[0]?.value || "";
}

function renderBoTeamExtremesTable() {
  const rows = [];
  BO_SERVICE_TEAM_COLUMNS.forEach(([service]) => {
    const groups = boTeamStats(serviceAnalysisRecords()).filter((row) => row.service === service && row.opinions >= 3);
    if (!groups.length) return;
    const highest = [...groups].sort((a, b) => b.medianWords - a.medianWords || b.opinions - a.opinions)[0];
    const lowest = [...groups].sort((a, b) => a.medianWords - b.medianWords || b.opinions - a.opinions)[0];
    rows.push({ service, highest, lowest });
  });
  renderTable($("boTeamExtremesTable"), ["Service", "Highest Team", "Median", "Opinions", "Lowest Team", "Median", "Opinions"], rows, (row) => [
    `<span class="pill">${escapeHtml(row.service)}</span>`,
    escapeHtml(row.highest.team),
    numCell(row.highest.medianWords),
    numCell(row.highest.opinions),
    escapeHtml(row.lowest.team),
    numCell(row.lowest.medianWords),
    numCell(row.lowest.opinions),
  ]);
}

function renderBoTeamTable() {
  const rows = boTeamStats(state.filtered).slice(0, 160);
  renderTable($("boTeamTable"), ["Service", "BO Team", "Opinions", "Docs", "Median Words", "Mean Words", "Top Product"], rows, (row) => [
    `<span class="pill">${escapeHtml(row.service)}</span>`,
    escapeHtml(row.team),
    numCell(row.opinions),
    numCell(row.documents),
    numCell(row.medianWords),
    numCell(row.meanWords),
    escapeHtml(shortLabel(row.topProduct, 54)),
  ]);
}

function renderProductTable() {
  const rows = productStats(state.filtered).slice(0, 180);
  renderTable($("productTable"), ["Product", "Templates", "Docs", "Median Words", "Mean Words", "Median Pages", "Opinions", "BO Date Coverage"], rows, (row) => [
    escapeHtml(shortLabel(row.product, 68)),
    escapeHtml(row.templates),
    numCell(row.docs),
    numCell(row.medianWords),
    numCell(row.meanWords),
    numCell(row.medianPages),
    numCell(row.opinionCount),
    `${fmtPct.format(row.boDateCoverage)}%`,
  ]);
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
  const longest = [...stats].sort((a, b) => b.medianWords - a.medianWords).slice(0, 12);
  const shortest = [...stats].sort((a, b) => a.medianWords - b.medianWords).slice(0, 12);
  renderHorizontalBars($("authorLengthChart"), longest, {
    label: (d) => d.author,
    value: (d) => d.medianWords,
    color: (d) => templateColor(d.templates.split(", ")[0]),
    tip: (d) =>
      `${d.author}<br>${fmtInt.format(d.docs)} docs<br>${fmtInt.format(d.medianWords)} median Text Before Opinions<br>${fmtInt.format(d.medianPages)} median pages`,
  });
  renderHorizontalBars($("shortAuthorChart"), shortest, {
    label: (d) => d.author,
    value: (d) => d.medianWords,
    color: () => "#9d9d9c",
    tip: (d) => `${d.author}<br>${fmtInt.format(d.docs)} docs<br>${fmtInt.format(d.medianWords)} median Text Before Opinions`,
  });
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
  renderTable($("authorTable"), ["Author", "Templates", "Docs", "Median TBO", "Mean TBO", "Median Pages", "Median Services", "Manual Rate"], rows, (row) => [
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

  html += `<text x="${margin.left}" y="${height - 24}" fill="${COLORS.neutral}" font-size="12">Definition: a service opinion is counted when a service column is above the active word floor.</text>`;
  svg.innerHTML = html;
  bindSvgTips(svg);
}

function renderServiceMomentumChart() {
  const metric = state.serviceMomentumMetric;
  const rows = serviceOpinionSummary(serviceAnalysisRecords())
    .filter((row) => row.opinionCount > 0)
    .sort((a, b) => templateSort(a.template, b.template) || Math.abs(serviceMomentumValue(b, metric)) - Math.abs(serviceMomentumValue(a, metric)));
  const container = $("serviceMomentumChart");
  if (!rows.length) return empty(container);
  const groups = [
    { label: "AFS / GNG", templates: ["AFS", "GNG"] },
    { label: "OTHER", templates: ["OTHER"] },
  ].filter((group) => rows.some((row) => group.templates.includes(row.template)));
  const max = Math.max(...rows.map((row) => Math.abs(serviceMomentumValue(row, metric))), 1);
  container.innerHTML = groups
    .map((group, index) => `
      <section class="momentum-template">
        <div class="momentum-template-title">
          <span>${escapeHtml(group.label)}</span>
          <small>${escapeHtml(serviceMomentumAxisLabel(metric))}</small>
        </div>
        <div id="serviceMomentumGroup${index}" class="chart compact-momentum"></div>
      </section>`)
    .join("");
  groups.forEach((group, index) => {
    const groupRows = rows
      .filter((row) => group.templates.includes(row.template))
      .sort((a, b) => templateSort(a.template, b.template) || Math.abs(serviceMomentumValue(b, metric)) - Math.abs(serviceMomentumValue(a, metric)))
      .slice(0, 18);
    if (group.templates.length > 1) {
      renderPairedTemplateMomentum($(`serviceMomentumGroup${index}`), groupRows, group.templates, metric, max);
    } else {
      renderDivergingBars($(`serviceMomentumGroup${index}`), groupRows, {
        label: (d) => d.service,
        value: (d) => serviceMomentumValue(d, metric),
        valueFormat: (value) => serviceMomentumLabel(value, metric),
        max,
        color: (d) => templateColor(d.template),
        tip: (d) =>
          `${d.template} / ${d.service}<br>Mean words/opinion delta: ${d.meanWordDelta > 0 ? "+" : ""}${fmtInt.format(d.meanWordDelta)}<br>Median words/opinion delta: ${d.medianWordDelta > 0 ? "+" : ""}${fmtInt.format(d.medianWordDelta)}<br>Recent: ${fmtInt.format(d.recentOpinions)} opinions, mean ${fmtInt.format(d.recentMeanWords)}, median ${fmtInt.format(d.recentMedianWords)}<br>Previous: ${fmtInt.format(d.previousOpinions)} opinions, mean ${fmtInt.format(d.previousMeanWords)}, median ${fmtInt.format(d.previousMedianWords)}`,
      });
    }
  });
}

function renderPairedTemplateMomentum(container, rows, templates, metric, max) {
  const services = Array.from(new Set(rows.map((row) => row.service)))
    .sort((a, b) => {
      const aMax = Math.max(...rows.filter((row) => row.service === a).map((row) => Math.abs(serviceMomentumValue(row, metric))));
      const bMax = Math.max(...rows.filter((row) => row.service === b).map((row) => Math.abs(serviceMomentumValue(row, metric))));
      return bMax - aMax || DEPARTMENTS.indexOf(a) - DEPARTMENTS.indexOf(b);
    });
  if (!services.length) return empty(container);
  const groupH = 50;
  const height = Math.max(300, 64 + services.length * groupH);
  const svg = makeSvg(container, 920, height);
  const margin = { top: 38, right: 84, bottom: 34, left: 172 };
  const width = 920 - margin.left - margin.right;
  const center = margin.left + width / 2;
  let html = `<line x1="${center}" x2="${center}" y1="${margin.top - 10}" y2="${height - margin.bottom}" stroke="${COLORS.grid}" stroke-width="2"></line>`;
  html += templates
    .map((template, i) => `<g>
      <rect x="${margin.left + i * 76}" y="12" width="12" height="12" rx="2" fill="${templateColor(template)}"></rect>
      <text x="${margin.left + 18 + i * 76}" y="23" fill="${COLORS.ink}" font-size="12" font-weight="750">${template}</text>
    </g>`)
    .join("");
  services.forEach((service, si) => {
    const y = margin.top + si * groupH;
    html += `<text x="72" y="${y + 28}" text-anchor="end" fill="${COLORS.ink}" font-size="13" font-weight="850">${escapeHtml(service)}</text>`;
    templates.forEach((template, ti) => {
      const row = rows.find((item) => item.service === service && item.template === template);
      const value = row ? serviceMomentumValue(row, metric) : 0;
      const barW = (Math.abs(value) / max) * (width / 2);
      const x = value >= 0 ? center : center - barW;
      const rowY = y + 5 + ti * 20;
      const labelX = margin.left - 12;
      const valueX = value >= 0 ? x + barW + 6 : x - 6;
      const anchor = value >= 0 ? "start" : "end";
      const tip = row
        ? `${template} / ${service}<br>Mean words/opinion delta: ${row.meanWordDelta > 0 ? "+" : ""}${fmtInt.format(row.meanWordDelta)}<br>Median words/opinion delta: ${row.medianWordDelta > 0 ? "+" : ""}${fmtInt.format(row.medianWordDelta)}<br>Recent: ${fmtInt.format(row.recentOpinions)} opinions, mean ${fmtInt.format(row.recentMeanWords)}, median ${fmtInt.format(row.recentMedianWords)}<br>Previous: ${fmtInt.format(row.previousOpinions)} opinions, mean ${fmtInt.format(row.previousMeanWords)}, median ${fmtInt.format(row.previousMedianWords)}`
        : `${template} / ${service}<br>No opinions in comparison window`;
      html += `<g data-tip="${escapeAttr(tip)}">
        <text x="${labelX}" y="${rowY + 12}" text-anchor="end" fill="${templateColor(template)}" font-size="11" font-weight="800">${template}</text>
        <rect x="${x}" y="${rowY + 2}" width="${Math.max(2, barW)}" height="12" rx="4" fill="${templateColor(template)}" opacity="${row ? 0.9 : 0.22}"></rect>
        <text x="${valueX}" y="${rowY + 13}" text-anchor="${anchor}" fill="${COLORS.neutral}" font-size="11">${serviceMomentumLabel(value, metric)}</text>
      </g>`;
    });
  });
  svg.innerHTML = html;
  bindSvgTips(svg);
}

function serviceMomentumValue(row, metric) {
  if (metric === "meanWords") return row.meanWordDelta;
  if (metric === "medianWords") return row.medianWordDelta;
  return row.meanWordDelta;
}

function serviceMomentumLabel(value, metric) {
  return `${value > 0 ? "+" : ""}${fmtInt.format(value)}`;
}

function serviceMomentumAxisLabel(metric) {
  return metric === "medianWords" ? "Median delta" : "Mean delta";
}

function templateSort(a, b) {
  const order = ["AFS", "GNG", "OTHER", "PIN"];
  const ai = order.includes(a) ? order.indexOf(a) : order.length;
  const bi = order.includes(b) ? order.indexOf(b) : order.length;
  return ai - bi || String(a).localeCompare(String(b));
}

function renderServiceMixChart(containerId = "serviceMixChart") {
  const rows = Array.from(groupBy(serviceOpinionRows(state.filtered), (d) => d.service).entries())
    .map(([service, items]) => ({
      service,
      count: items.length,
      words: items.reduce((sum, item) => sum + item.words, 0),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  renderVerticalBars($(containerId), rows, {
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
  const rows = serviceOpinionSummary(serviceAnalysisRecords())
    .filter((row) => row.opinionCount > 0)
    .sort((a, b) => templateSort(a.template, b.template) || b.opinionCount - a.opinionCount);
  renderGroupedServiceTable(rows);
}

function renderServiceVolumeLengthChart() {
  const opinions = serviceOpinionRows(serviceAnalysisRecords());
  const rows = Array.from(groupBy(opinions, (item) => item.service).entries())
    .map(([service, items]) => ({
      service,
      count: items.length,
      meanWords: mean(items.map((item) => item.words)),
      medianWords: quantile(items.map((item) => item.words), 0.5),
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || b.medianWords - a.medianWords)
    .slice(0, 14);
  renderServiceComboChart($("serviceVolumeLengthChart"), rows);
}

function renderServiceComboChart(container, rows) {
  if (!rows.length) return empty(container, "No service opinions match the current filters.");
  const svg = makeSvg(container, 980, Math.max(420, 104 + rows.length * 30));
  const margin = { top: 58, right: 34, bottom: 54, left: 82 };
  const chartWidth = 980 - margin.left - margin.right;
  const countW = Math.min(520, chartWidth * 0.62);
  const gap = 64;
  const lengthX0 = margin.left + countW + gap;
  const lengthW = chartWidth - countW - gap;
  const rowH = 30;
  const height = rows.length * rowH;
  const countMax = Math.max(...rows.map((row) => row.count), 1);
  const lengthMax = Math.max(...rows.flatMap((row) => [row.meanWords, row.medianWords]), 1);
  const countMaxRounded = Math.ceil(countMax / 500) * 500 || countMax;
  const lengthMaxRounded = Math.ceil(lengthMax / 250) * 250 || lengthMax;
  const barW = (value) => (value / countMaxRounded) * countW;
  const lengthX = (value) => lengthX0 + (value / lengthMaxRounded) * lengthW;
  const countTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => countMaxRounded * ratio);
  const lengthTicks = [0, 0.5, 1].map((ratio) => lengthMaxRounded * ratio);

  let html = `<text x="${margin.left}" y="20" fill="${COLORS.ink}" font-size="13" font-weight="850">Opinion rows</text>
    <text x="${lengthX0}" y="20" fill="${COLORS.ink}" font-size="13" font-weight="850">Words per opinion</text>
    <rect x="${margin.left}" y="32" width="14" height="10" rx="3" fill="#376996" opacity="0.45"></rect>
    <text x="${margin.left + 20}" y="42" fill="${COLORS.neutral}" font-size="11" font-weight="750">Count</text>
    <circle cx="${lengthX0}" cy="38" r="4.5" fill="#17212b"></circle>
    <text x="${lengthX0 + 11}" y="42" fill="${COLORS.neutral}" font-size="11" font-weight="750">Mean</text>
    <circle cx="${lengthX0 + 74}" cy="38" r="4.5" fill="#ffffff" stroke="#17212b" stroke-width="2"></circle>
    <text x="${lengthX0 + 85}" y="42" fill="${COLORS.neutral}" font-size="11" font-weight="750">Median</text>`;

  html += countTicks
    .map((value) => {
      const x = margin.left + (value / countMaxRounded) * countW;
      return `<line class="grid-line" x1="${x}" x2="${x}" y1="${margin.top - 6}" y2="${margin.top + height - 4}"></line>
        <text x="${x}" y="${margin.top + height + 18}" text-anchor="middle" fill="${COLORS.neutral}" font-size="10">${fmtInt.format(value)}</text>`;
    })
    .join("");
  html += lengthTicks
    .map((value) => {
      const x = lengthX(value);
      return `<line class="grid-line" x1="${x}" x2="${x}" y1="${margin.top - 6}" y2="${margin.top + height - 4}"></line>
        <text x="${x}" y="${margin.top + height + 18}" text-anchor="middle" fill="${COLORS.neutral}" font-size="10">${fmtInt.format(value)}</text>`;
    })
    .join("");

  rows.forEach((row, index) => {
    const y = margin.top + index * rowH;
    const barWidth = barW(row.count);
    html += `<g data-tip="${escapeAttr(
      `${row.service}<br>${fmtInt.format(row.count)} opinion rows<br>${fmtInt.format(row.meanWords)} mean words<br>${fmtInt.format(row.medianWords)} median words`
    )}">
      <rect x="${margin.left - 74}" y="${y - 1}" width="${chartWidth + 74}" height="${rowH - 4}" rx="6" fill="${index % 2 ? "#ffffff" : "#f7fafc"}"></rect>
      <text x="${margin.left - 12}" y="${y + 18}" text-anchor="end" fill="${COLORS.ink}" font-size="12" font-weight="850">${escapeHtml(row.service)}</text>
      <rect x="${margin.left}" y="${y + 6}" width="${Math.max(2, barWidth)}" height="14" rx="5" fill="#376996" opacity="0.42"></rect>
      <rect x="${margin.left}" y="${y + 6}" width="${Math.max(2, Math.min(barWidth, 3))}" height="14" rx="2" fill="#376996"></rect>
      <text x="${margin.left + barWidth + 7}" y="${y + 18}" fill="${COLORS.neutral}" font-size="11" font-weight="750">${fmtInt.format(row.count)}</text>
      <line x1="${lengthX(row.medianWords)}" x2="${lengthX(row.meanWords)}" y1="${y + 13}" y2="${y + 13}" stroke="#aeb8c4" stroke-width="2" stroke-linecap="round"></line>
      <circle cx="${lengthX(row.meanWords)}" cy="${y + 13}" r="5" fill="#17212b"></circle>
      <circle cx="${lengthX(row.medianWords)}" cy="${y + 13}" r="5" fill="#ffffff" stroke="#17212b" stroke-width="2"></circle>
    </g>`;
  });
  html += `<text x="${margin.left + countW / 2}" y="${margin.top + height + 40}" text-anchor="middle" fill="${COLORS.neutral}" font-size="11">Opinion rows</text>
    <text x="${lengthX0 + lengthW / 2}" y="${margin.top + height + 40}" text-anchor="middle" fill="${COLORS.neutral}" font-size="11">Mean and median words</text>`;
  svg.innerHTML = html;
  bindSvgTips(svg);
}

function renderGroupedServiceTable(rows) {
  const table = $("serviceTable");
  const headers = ["Service", "Opinions", "Docs", "Mean Now", "Mean Prev", "Median Now", "Median Prev", "Mean Delta", "Median Delta"];
  if (!rows.length) {
    table.innerHTML = `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody><tr><td colspan="${headers.length}">No records match the current filters.</td></tr></tbody>`;
    return;
  }
  const groups = Array.from(groupBy(rows, (row) => row.template).entries()).sort((a, b) => templateSort(a[0], b[0]));
  table.innerHTML = `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${groups
    .map(([template, items]) => {
      const groupHeader = `<tr class="group-row"><td colspan="${headers.length}">${escapeHtml(template)}</td></tr>`;
      const itemRows = items
        .map((row) => `<tr>
          <td>${escapeHtml(row.service)}</td>
          <td>${numCell(row.opinionCount)}</td>
          <td>${numCell(row.documentCount)}</td>
          <td>${numCell(row.recentMeanWords)}</td>
          <td>${numCell(row.previousMeanWords)}</td>
          <td>${numCell(row.recentMedianWords)}</td>
          <td>${numCell(row.previousMedianWords)}</td>
          <td><span class="pill ${row.meanWordDelta >= 0 ? "auto" : "manual"}">${row.meanWordDelta > 0 ? "+" : ""}${fmtInt.format(row.meanWordDelta)}</span></td>
          <td><span class="pill ${row.medianWordDelta >= 0 ? "auto" : "manual"}">${row.medianWordDelta > 0 ? "+" : ""}${fmtInt.format(row.medianWordDelta)}</span></td>
        </tr>`)
        .join("");
      return groupHeader + itemRows;
    })
    .join("")}</tbody>`;
}

function serviceTrendSignal(row) {
  const lengthDelta = Math.abs(row.medianWordDelta) >= Math.abs(row.meanWordDelta)
    ? row.medianWordDelta
    : row.meanWordDelta;
  const frequencyDelta = row.countDelta;
  if (lengthDelta >= 25 && frequencyDelta > 0) return "Longer and more frequent";
  if (lengthDelta >= 25 && frequencyDelta <= 0) return "Longer but less frequent";
  if (lengthDelta <= -25 && frequencyDelta > 0) return "Shorter but more frequent";
  if (lengthDelta <= -25 && frequencyDelta <= 0) return "Shorter and less frequent";
  if (frequencyDelta > 10) return "More frequent";
  if (frequencyDelta < -10) return "Less frequent";
  return "Stable length";
}

function renderServiceTrendSignalsTable() {
  const rows = serviceOpinionSummary(serviceAnalysisRecords())
    .filter((row) => row.opinionCount > 0)
    .map((row) => ({
      ...row,
      signal: serviceTrendSignal(row),
      score: Math.abs(row.meanWordDelta) + Math.abs(row.medianWordDelta) + Math.abs(row.countDelta) * 8,
    }))
    .sort((a, b) => templateSort(a.template, b.template) || b.score - a.score);
  const topRows = [];
  Array.from(groupBy(rows, (row) => row.template).entries())
    .sort((a, b) => templateSort(a[0], b[0]))
    .forEach(([, items]) => topRows.push(...items.slice(0, 8)));
  renderTable(
    $("serviceTrendSignalsTable"),
    ["Template", "Service", "Signal", "Recent Ops", "Prior Ops", "Mean Delta", "Median Delta"],
    topRows,
    (row) => [
      `<span class="pill">${escapeHtml(row.template)}</span>`,
      escapeHtml(row.service),
      escapeHtml(row.signal),
      numCell(row.recentOpinions),
      numCell(row.previousOpinions),
      `<span class="pill ${row.meanWordDelta >= 0 ? "auto" : "manual"}">${row.meanWordDelta > 0 ? "+" : ""}${fmtInt.format(row.meanWordDelta)}</span>`,
      `<span class="pill ${row.medianWordDelta >= 0 ? "auto" : "manual"}">${row.medianWordDelta > 0 ? "+" : ""}${fmtInt.format(row.medianWordDelta)}</span>`,
    ]
  );
}

function serviceAnalysisRecords() {
  return state.filtered.filter((row) => row["Template Type"] !== "PIN");
}

function renderPagesView() {
  renderPageTrendChart();
  renderAnnexTemplateChart();
  renderPageCompositionChart();
  renderPageCompositionTimeChart();
  renderPageSummaryTable();
  renderAnnexOutlierTable();
  renderAfsProcessPageChart();
  renderAfsProcessPageTable();
}

function renderNoteTypesView() {
  renderMcNoteTypeMonthChart();
  renderMcOpinionCoverageQuarterlyChart();
  renderMcOpinionCoverageYearChart();
  renderMcNoteTypeTable();
}

function mcNoteTypeLabel(row) {
  const value = String(row["MC_Note_Type"] || "").trim();
  return value || "Missing type";
}

function isValidMcNoteType(row) {
  return MC_NOTE_TYPES.includes(mcNoteTypeLabel(row));
}

function hasServiceOpinion(row) {
  return DEPARTMENTS.some((service) => opinionPassesFloor(row[service]));
}

function mcNoteTypeMonthlyGroups(rows) {
  const selectedTypes = MC_NOTE_TYPES.filter((type) => state.selectedMcMonthTypes.has(type));
  const validRows = rows.filter((row) => selectedTypes.includes(mcNoteTypeLabel(row)));
  const months = Array.from(new Set(validRows.map(timelineMonth).filter(Boolean))).sort();
  const typeTotals = Array.from(groupBy(validRows, mcNoteTypeLabel).entries())
    .map(([type, items]) => ({ type, documents: items.length }))
    .sort((a, b) => MC_NOTE_TYPES.indexOf(a.type) - MC_NOTE_TYPES.indexOf(b.type));
  const types = selectedTypes.filter((type) => typeTotals.some((item) => item.type === type));
  const counts = new Map();
  validRows
    .filter((row) => timelineMonth(row))
    .forEach((row) => {
      const key = `${timelineMonth(row)}|${mcNoteTypeLabel(row)}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  return { months, types, counts, typeTotals };
}

function renderMcNoteTypeMonthChart() {
  const container = $("mcNoteTypeMonthChart");
  const { months, types, counts } = mcNoteTypeMonthlyGroups(state.filtered);
  if (!state.selectedMcMonthTypes.size) return empty(container, "Select at least one MC note type.");
  if (!months.length || !types.length) return empty(container, "No dated MC note type records match the current filters.");

  const svgHeight = 500;
  const svg = makeSvg(container, 980, svgHeight);
  const margin = { top: 30, right: 34, bottom: 44, left: 70 };
  const width = 980 - margin.left - margin.right;
  const stackHeight = 250;
  const maTop = 338;
  const maHeight = 86;
  const step = width / months.length;
  const barW = Math.max(5, Math.min(24, step * 0.72));
  const monthTotals = months.map((month) => types.reduce((sum, type) => sum + (counts.get(`${month}|${type}`) || 0), 0));
  const stackMax = Math.max(...monthTotals, 1);
  const stackY = (value) => margin.top + stackHeight - (value / stackMax) * stackHeight;
  const maSeries = types.map((type) => {
    const points = months.map((month) => ({ month, value: counts.get(`${month}|${type}`) || 0 }));
    return {
      type,
      points: points.map((point, index) => {
        const window = points.slice(Math.max(0, index - 2), index + 1);
        return { month: point.month, value: mean(window.map((item) => item.value)) };
      }),
    };
  });
  const maMax = Math.max(...maSeries.flatMap((series) => series.points.map((point) => point.value)), 1);
  const maY = (value) => maTop + maHeight - (value / maMax) * maHeight;

  let html = `<text x="${margin.left}" y="18" fill="${COLORS.neutral}" font-size="11" font-weight="800">Stacked columns: monthly documents. Lines below: 3-month moving averages.</text>`;
  html += gridY(stackMax, margin, width, stackHeight, 5).join("");
  months.forEach((month, monthIndex) => {
    let running = 0;
    const x = margin.left + monthIndex * step + (step - barW) / 2;
    types.forEach((type, typeIndex) => {
      const value = counts.get(`${month}|${type}`) || 0;
      if (!value) return;
      const y0 = stackY(running + value);
      const y1 = stackY(running);
      html += `<rect x="${x}" y="${y0}" width="${barW}" height="${Math.max(1, y1 - y0)}" rx="2" fill="${categoryColor(
        type,
        MC_NOTE_TYPES.indexOf(type)
      )}" data-tip="${escapeAttr(`${month}<br>${mcNoteTypeDisplay(type)}<br>${fmtInt.format(value)} documents`)}"></rect>`;
      running += value;
    });
  });
  html += monthTicks(months, margin, width, stackHeight);
  html += `<text x="${margin.left}" y="${maTop - 14}" fill="${COLORS.ink}" font-size="12" font-weight="850">3-month moving average</text>`;
  html += [0, 0.5, 1]
    .map((ratio) => {
      const value = maMax * ratio;
      const y = maY(value);
      return `<line class="grid-line" x1="${margin.left}" x2="${margin.left + width}" y1="${y}" y2="${y}"></line>
        <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" fill="${COLORS.neutral}" font-size="10">${fmtInt.format(value)}</text>`;
    })
    .join("");
  maSeries.forEach((series, typeIndex) => {
    const path = series.points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${margin.left + (months.indexOf(point.month) / Math.max(1, months.length - 1)) * width} ${maY(point.value)}`)
      .join(" ");
    html += `<path d="${path}" fill="none" stroke="${categoryColor(series.type, MC_NOTE_TYPES.indexOf(series.type))}" stroke-width="3.2" stroke-linecap="round"></path>`;
  });
  html += monthTicks(months, { ...margin, top: maTop }, width, maHeight);
  html += `<text x="${margin.left + width / 2}" y="${svgHeight - 10}" text-anchor="middle" fill="${COLORS.neutral}" font-size="12">BO validation month</text>`;
  html += types
    .map((type, index) => {
      const x = margin.left + 560 + index * 98;
      return `<g><rect x="${x}" y="${maTop - 24}" width="12" height="12" rx="2" fill="${categoryColor(type, MC_NOTE_TYPES.indexOf(type))}"></rect><text x="${x + 18}" y="${
        maTop - 14
      }" fill="${COLORS.ink}" font-size="11" font-weight="750">${escapeHtml(mcNoteTypeDisplay(type))}</text></g>`;
    })
    .join("");
  svg.innerHTML = html;
  bindSvgTips(svg);
}

function mcOpinionCoverageQuarterRows(rows) {
  const validRows = rows.filter((row) => isValidMcNoteType(row) && timelineDate(row));
  const quarters = Array.from(
    new Set(
      validRows.map((row) => {
        const date = timelineDate(row);
        const year = Number(date.slice(0, 4));
        const month = Number(date.slice(5, 7));
        return `${year} Q${Math.ceil(month / 3)}`;
      })
    )
  ).sort((a, b) => {
    const [ay, aq] = a.split(" Q").map(Number);
    const [by, bq] = b.split(" Q").map(Number);
    return ay - by || aq - bq;
  });
  const types = MC_NOTE_TYPES.filter((type) => validRows.some((row) => mcNoteTypeLabel(row) === type));
  const totals = new Map();
  const opinionTotals = new Map();
  validRows.forEach((row) => {
    const date = timelineDate(row);
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7));
    const quarter = `${year} Q${Math.ceil(month / 3)}`;
    const key = `${quarter}|${mcNoteTypeLabel(row)}`;
    totals.set(key, (totals.get(key) || 0) + 1);
    if (hasServiceOpinion(row)) opinionTotals.set(key, (opinionTotals.get(key) || 0) + 1);
  });
  return { quarters, types, totals, opinionTotals };
}

function renderMcOpinionCoverageQuarterlyChart() {
  const container = $("mcOpinionCoverageQuarterlyChart");
  const { quarters, types, totals, opinionTotals } = mcOpinionCoverageQuarterRows(state.filtered);
  if (!quarters.length || !types.length) return empty(container, "No dated MC note type records match the current filters.");

  const svg = makeSvg(container, 980, 430);
  const margin = { top: 34, right: 34, bottom: 78, left: 70 };
  const width = 980 - margin.left - margin.right;
  const height = 430 - margin.top - margin.bottom;
  const y = (value) => margin.top + height - (value / 100) * height;
  const x = (index) => margin.left + (index / Math.max(1, quarters.length - 1)) * width;
  let html = `<text x="${margin.left}" y="18" fill="${COLORS.neutral}" font-size="11" font-weight="800">Quarterly share of documents with at least one service opinion. ${escapeHtml(opinionFloorText())}</text>`;
  [0, 25, 50, 75, 100].forEach((value) => {
    const yy = y(value);
    html += `<line class="grid-line" x1="${margin.left}" x2="${margin.left + width}" y1="${yy}" y2="${yy}"></line>
      <text x="${margin.left - 10}" y="${yy + 4}" text-anchor="end" fill="${COLORS.neutral}" font-size="10">${fmtInt.format(value)}%</text>`;
  });
  types.forEach((type) => {
    const points = quarters.map((quarter, index) => {
      const denominator = totals.get(`${quarter}|${type}`) || 0;
      const numerator = opinionTotals.get(`${quarter}|${type}`) || 0;
      return {
        quarter,
        type,
        denominator,
        numerator,
        pct: denominator ? (numerator / denominator) * 100 : null,
        x: x(index),
      };
    });
    const path = points
      .filter((point) => point.pct !== null)
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${y(point.pct)}`)
      .join(" ");
    if (path) {
      html += `<path d="${path}" fill="none" stroke="${categoryColor(type, MC_NOTE_TYPES.indexOf(type))}" stroke-width="3.4" stroke-linecap="round"></path>`;
    }
    points
      .filter((point) => point.pct !== null)
      .forEach((point) => {
        html += `<circle cx="${point.x}" cy="${y(point.pct)}" r="4" fill="${categoryColor(type, MC_NOTE_TYPES.indexOf(type))}" stroke="#ffffff" stroke-width="1.5" data-tip="${escapeAttr(
          `${point.quarter}<br>${mcNoteTypeDisplay(type)}<br>${fmtPct.format(point.pct)}% with service opinions<br>${fmtInt.format(point.numerator)} of ${fmtInt.format(point.denominator)} documents`
        )}"></circle>`;
      });
  });
  const tickStep = Math.max(1, Math.ceil(quarters.length / 12));
  html += quarters
    .filter((_, index) => index % tickStep === 0)
    .map((quarter, index, shown) => {
      const quarterIndex = quarters.indexOf(quarter);
      return `<text x="${x(quarterIndex)}" y="${margin.top + height + 25}" text-anchor="middle" fill="${COLORS.neutral}" font-size="11">${escapeHtml(quarter)}</text>`;
    })
    .join("");
  html += `<text x="${margin.left + width / 2}" y="396" text-anchor="middle" fill="${COLORS.neutral}" font-size="12">BO validation quarter</text>`;
  html += types
    .map((type, index) => {
      const legendX = margin.left + index * 112;
      return `<g><rect x="${legendX}" y="414" width="12" height="12" rx="2" fill="${categoryColor(type, MC_NOTE_TYPES.indexOf(type))}"></rect><text x="${
        legendX + 18
      }" y="424" fill="${COLORS.ink}" font-size="11" font-weight="750">${escapeHtml(mcNoteTypeDisplay(type))}</text></g>`;
    })
    .join("");
  svg.innerHTML = html;
  bindSvgTips(svg);
}

function renderMcOpinionCoverageYearChart() {
  const container = $("mcOpinionCoverageYearChart");
  const rows = state.filtered.filter((row) => isValidMcNoteType(row) && timelineDate(row));
  const years = Array.from(new Set(rows.map((row) => String(timelineDate(row)).slice(0, 4)))).sort();
  const types = MC_NOTE_TYPES.filter((type) => rows.some((row) => mcNoteTypeLabel(row) === type));
  if (!years.length || !types.length) return empty(container, "No dated MC note type records match the current filters.");

  const grouped = new Map();
  rows.forEach((row) => {
    const year = String(timelineDate(row)).slice(0, 4);
    const type = mcNoteTypeLabel(row);
    const key = `${year}|${type}`;
    if (!grouped.has(key)) grouped.set(key, { year, type, documents: 0, opinionDocs: 0 });
    const item = grouped.get(key);
    item.documents += 1;
    if (hasServiceOpinion(row)) item.opinionDocs += 1;
  });

  const svg = makeSvg(container, 980, 350);
  const margin = { top: 34, right: 34, bottom: 72, left: 70 };
  const width = 980 - margin.left - margin.right;
  const height = 350 - margin.top - margin.bottom;
  const yearW = width / years.length;
  const barW = Math.max(16, Math.min(44, (yearW * 0.9) / Math.max(1, types.length)));
  const y = (value) => margin.top + height - (value / 100) * height;
  let html = `<text x="${margin.left}" y="18" fill="${COLORS.neutral}" font-size="11" font-weight="800">Bars show yearly share of documents with at least one service opinion.</text>`;
  [0, 25, 50, 75, 100].forEach((value) => {
    const yy = y(value);
    html += `<line class="grid-line" x1="${margin.left}" x2="${margin.left + width}" y1="${yy}" y2="${yy}"></line>
      <text x="${margin.left - 10}" y="${yy + 4}" text-anchor="end" fill="${COLORS.neutral}" font-size="10">${fmtInt.format(value)}%</text>`;
  });
  years.forEach((year, yearIndex) => {
    const baseX = margin.left + yearIndex * yearW + (yearW - types.length * barW) / 2;
    types.forEach((type, typeIndex) => {
      const item = grouped.get(`${year}|${type}`) || { documents: 0, opinionDocs: 0 };
      const pct = item.documents ? (item.opinionDocs / item.documents) * 100 : 0;
      const x = baseX + typeIndex * barW;
      const yy = y(pct);
      const columnWidth = barW - 3;
      const labelY = pct >= 12 ? yy + 13 : yy - 5;
      const labelFill = pct >= 12 ? "#ffffff" : COLORS.ink;
      html += `<rect x="${x}" y="${yy}" width="${columnWidth}" height="${Math.max(1, margin.top + height - yy)}" rx="3" fill="${categoryColor(
        type,
        MC_NOTE_TYPES.indexOf(type)
      )}" data-tip="${escapeAttr(`${year}<br>${mcNoteTypeDisplay(type)}<br>${fmtPct.format(pct)}% with service opinions<br>${fmtInt.format(item.opinionDocs)} of ${fmtInt.format(item.documents)} documents`)}"></rect>`;
      if (item.documents) {
        html += `<text x="${x + columnWidth / 2}" y="${labelY}" text-anchor="middle" fill="${labelFill}" font-size="9" font-weight="850">${fmtPct.format(pct)}%</text>`;
      }
    });
    html += `<text x="${margin.left + yearIndex * yearW + yearW / 2}" y="${margin.top + height + 24}" text-anchor="middle" fill="${COLORS.neutral}" font-size="11">${escapeHtml(year)}</text>`;
  });
  html += `<text x="${margin.left + width / 2}" y="${margin.top + height + 48}" text-anchor="middle" fill="${COLORS.neutral}" font-size="12">BO validation year</text>`;
  html += types
    .map((type, index) => {
      const legendX = margin.left + 590 + index * 92;
      return `<g><rect x="${legendX}" y="12" width="12" height="12" rx="2" fill="${categoryColor(type, MC_NOTE_TYPES.indexOf(type))}"></rect><text x="${
        legendX + 18
      }" y="22" fill="${COLORS.ink}" font-size="11" font-weight="750">${escapeHtml(mcNoteTypeDisplay(type))}</text></g>`;
    })
    .join("");
  svg.innerHTML = html;
  bindSvgTips(svg);
}

function renderMcNoteTypeTable() {
  const rows = Array.from(groupBy(state.filtered.filter(isValidMcNoteType), mcNoteTypeLabel).entries())
    .map(([type, items]) => {
      const dates = items.map(timelineDate).filter(Boolean).sort();
      const opinionDocs = items.filter(hasServiceOpinion).length;
      const serviceCounts = items.map((row) => DEPARTMENTS.filter((service) => opinionPassesFloor(row[service])).length);
      const meanPages = mean(items.map((row) => row["Document Page Count"]));
      const meanPreOpinionPages = mean(items.map((row) => row["Page count before opinion"]));
      const meanAnnexPages = mean(items.map((row) => row["Annex Page Count"]));
      return {
        type,
        documents: items.length,
        opinionDocs,
        opinionDocShare: items.length ? (opinionDocs / items.length) * 100 : 0,
        medianPages: quantile(items.map((row) => row["Document Page Count"]), 0.5),
        meanPages,
        meanPreOpinionPages,
        meanOpinionPages: Math.max(0, meanPages - meanPreOpinionPages - meanAnnexPages),
        meanAnnexPages,
        medianServices: quantile(serviceCounts, 0.5),
        dateMin: dates[0] || "",
        dateMax: dates[dates.length - 1] || "",
      };
    })
    .sort((a, b) => MC_NOTE_TYPES.indexOf(a.type) - MC_NOTE_TYPES.indexOf(b.type));
  renderTable(
    $("mcNoteTypeTable"),
    ["MC Note Type", "Documents", "Opinion Docs", "Opinion Share", "Median Pages", "Pre-Opinion Pages", "Opinion Pages", "Annex Pages", "Median Services", "BO Date Range"],
    rows,
    (row) => [
      escapeHtml(mcNoteTypeDisplay(row.type)),
      numCell(row.documents),
      numCell(row.opinionDocs),
      `${fmtPct.format(row.opinionDocShare)}%`,
      numCell(row.medianPages),
      numCell(row.meanPreOpinionPages),
      numCell(row.meanOpinionPages),
      numCell(row.meanAnnexPages),
      numCell(row.medianServices),
      `${escapeHtml(formatDate(row.dateMin))} to ${escapeHtml(formatDate(row.dateMax))}`,
    ]
  );
}

function pageMetricConfig(metric) {
  if (metric === "Annex Page Count") {
    return { value: (d) => d.meanAnnexPages, label: "Mean Annex Pages", tip: "mean annex pages" };
  }
  if (metric === "Page count before opinion") {
    return { value: (d) => d.meanPreOpinionPages, label: "Mean Pre-Opinion Pages", tip: "mean pre-opinion pages" };
  }
  return { value: (d) => d.meanPages, label: "Mean Total Pages", tip: "mean total pages" };
}

function pageMonthlyGroups(rows) {
  return monthlyGroups(rows).map((item) => ({
    ...item,
    meanPreOpinionPages: mean(item.rows.map((row) => row["Page count before opinion"])),
    meanAnnexPages: mean(item.rows.map((row) => row["Annex Page Count"])),
  }));
}

function pagePeriodGroups(rows) {
  if (state.pageTrendPeriod === "month") return pageMonthlyGroups(rows);
  const map = new Map();
  rows
    .filter((row) => timelineMonth(row))
    .forEach((row) => {
      const month = timelineMonth(row);
      const year = month.slice(0, 4);
      const quarter = Math.floor((Number(month.slice(5, 7)) - 1) / 3) + 1;
      const period = `${year} Q${quarter}`;
      const key = `${period}|${row["Template Type"]}`;
      if (!map.has(key)) {
        map.set(key, { month: period, template: row["Template Type"], rows: [] });
      }
      map.get(key).rows.push(row);
    });
  return Array.from(map.values())
    .map((item) => ({
      ...item,
      documents: item.rows.length,
      meanPages: mean(item.rows.map((row) => row["Document Page Count"])),
      meanPreOpinionPages: mean(item.rows.map((row) => row["Page count before opinion"])),
      meanAnnexPages: mean(item.rows.map((row) => row["Annex Page Count"])),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function renderPageTrendChart() {
  const metric = pageMetricConfig(state.pageTrendMetric);
  const data = pagePeriodGroups(state.filtered);
  const periodLabel = state.pageTrendPeriod === "quarter" ? "quarter" : "month";
  renderLineChart($("pageTrendChart"), data, {
    value: metric.value,
    label: metric.label,
    movingAverage: true,
    tip: (d) => `${d.month} ${d.template}<br>${fmtOne.format(metric.value(d))} ${metric.tip}<br>${fmtInt.format(d.documents)} documents<br>Grouped by ${periodLabel}`,
  });
}

function pageTemplateStats(rows) {
  return Array.from(groupBy(rows, (row) => row["Template Type"]).entries())
    .map(([template, items]) => {
      const pages = items.map((row) => n(row["Document Page Count"]));
      const pre = items.map((row) => n(row["Page count before opinion"]));
      const annex = items.map((row) => n(row["Annex Page Count"]));
      const totalPages = pages.reduce((sum, value) => sum + value, 0);
      const annexPages = annex.reduce((sum, value) => sum + value, 0);
      return {
        template,
        docs: items.length,
        meanPages: mean(pages),
        medianPages: quantile(pages, 0.5),
        meanPreOpinionPages: mean(pre),
        medianPreOpinionPages: quantile(pre, 0.5),
        meanAnnexPages: mean(annex),
        medianAnnexPages: quantile(annex, 0.5),
        annexShare: totalPages ? (annexPages / totalPages) * 100 : 0,
      };
    })
    .sort((a, b) => templateSort(a.template, b.template));
}

function renderAnnexTemplateChart() {
  const rows = pageTemplateStats(state.filtered);
  renderHorizontalBars($("annexTemplateChart"), rows, {
    label: (d) => d.template,
    value: (d) => d.medianAnnexPages,
    color: (d) => templateColor(d.template),
    tip: (d) => `${d.template}<br>${fmtOne.format(d.medianAnnexPages)} median annex pages<br>${fmtPct.format(d.annexShare)}% of total pages`,
  });
}

function renderPageCompositionChart() {
  const rows = pageTemplateStats(state.filtered);
  const data = rows.flatMap((row) => [
    { template: row.template, part: "Pre-opinion", value: row.meanPreOpinionPages },
    { template: row.template, part: "Opinion", value: Math.max(0, row.meanPages - row.meanPreOpinionPages - row.meanAnnexPages) },
    { template: row.template, part: "Annex", value: row.meanAnnexPages },
  ]);
  renderStackedTemplateBars($("pageCompositionChart"), data, rows.map((row) => row.template));
}

function renderStackedTemplateBars(container, data, templates) {
  const orderedTemplates = [...templates].sort(templateSort);
  if (!orderedTemplates.length) return empty(container);
  const parts = PAGE_COMPOSITION_PARTS;
  const colors = PAGE_COMPOSITION_COLORS;
  const totals = new Map(
    orderedTemplates.map((template) => [
      template,
      parts.reduce((sum, part) => sum + n(data.find((item) => item.template === template && item.part === part)?.value), 0),
    ])
  );
  const rawMax = Math.max(...Array.from(totals.values()), 1);
  const max = Math.ceil(rawMax / 5) * 5;
  const svgWidth = 600;
  const height = Math.max(300, 116 + orderedTemplates.length * 42);
  const svg = makeSvg(container, svgWidth, height);
  const margin = { top: 34, right: 64, bottom: 68, left: 82 };
  const width = svgWidth - margin.left - margin.right;
  const rowGap = 42;
  const barHeight = 18;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => max * ratio);

  let html = ticks
    .map((value) => {
      const x = margin.left + (value / max) * width;
      return `<line class="grid-line" x1="${x}" x2="${x}" y1="${margin.top - 8}" y2="${
        margin.top + orderedTemplates.length * rowGap - 12
      }"></line>
      <text x="${x}" y="${margin.top + orderedTemplates.length * rowGap + 12}" text-anchor="middle" fill="${COLORS.neutral}" font-size="11">${fmtInt.format(
        value
      )}</text>`;
    })
    .join("");
  html += orderedTemplates
    .map((template, index) => {
      const y = margin.top + index * rowGap;
      let x = margin.left;
      const total = totals.get(template) || 0;
      const segments = parts
        .map((part) => {
          const value = n(data.find((item) => item.template === template && item.part === part)?.value);
          const segmentW = max ? (value / max) * width : 0;
          const label = segmentW > 34 ? `<text x="${x + segmentW / 2}" y="${y + 13}" text-anchor="middle" fill="${
            part === "Annex" ? COLORS.ink : "#ffffff"
          }" font-size="9" font-weight="850">${fmtOne.format(value)}</text>` : "";
          const segment = `<rect x="${x}" y="${y}" width="${Math.max(0, segmentW)}" height="${barHeight}" rx="4" fill="${colors[part]}" data-tip="${escapeAttr(
            `${template}<br>${part}: ${fmtOne.format(value)} mean pages<br>Total: ${fmtOne.format(total)} mean pages`
          )}"></rect>${label}`;
          x += segmentW;
          return segment;
        })
        .join("");
      return `<g>
        <text x="${margin.left - 12}" y="${y + 13}" text-anchor="end" fill="${COLORS.ink}" font-size="12" font-weight="850">${escapeHtml(template)}</text>
        ${segments}
        <text x="${margin.left + (total / max) * width + 8}" y="${y + 13}" fill="${COLORS.neutral}" font-size="11" font-weight="750">${fmtOne.format(total)}</text>
      </g>`;
    })
    .join("");
  html += `<text x="${margin.left + width / 2}" y="${margin.top + orderedTemplates.length * rowGap + 34}" text-anchor="middle" fill="${COLORS.neutral}" font-size="11">Mean document pages</text>`;
  html += parts
    .map(
      (part, index) =>
        `<g><rect x="${margin.left + index * 150}" y="${height - 24}" width="12" height="12" rx="2" fill="${colors[part]}"></rect><text x="${
          margin.left + 18 + index * 150
        }" y="${height - 14}" fill="${COLORS.ink}" font-size="11" font-weight="750">${escapeHtml(part)}</text></g>`
    )
    .join("");
  svg.innerHTML = html;
  bindSvgTips(svg);
}

function renderPageCompositionTimeChart() {
  const container = $("pageCompositionTimeChart");
  const groups = Array.from(groupBy(state.filtered.filter((row) => timelineMonth(row)), timelineMonth).entries())
    .map(([month, rows]) => {
      const meanPages = mean(rows.map((row) => row["Document Page Count"]));
      const pre = mean(rows.map((row) => row["Page count before opinion"]));
      const annex = mean(rows.map((row) => row["Annex Page Count"]));
      return {
        month,
        documents: rows.length,
        values: {
          "Pre-opinion": pre,
          Opinion: Math.max(0, meanPages - pre - annex),
          Annex: annex,
        },
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));
  if (!groups.length) return empty(container, "No dated page-composition records match the current filters.");

  const svgHeight = 660;
  const svg = makeSvg(container, 980, svgHeight);
  const margin = { top: 32, right: 34, bottom: 44, left: 70 };
  const width = 980 - margin.left - margin.right;
  const stackHeight = 250;
  const maTop = 338;
  const maHeight = 86;
  const pctTop = 500;
  const pctHeight = 72;
  const totals = groups.map((item) => PAGE_COMPOSITION_PARTS.reduce((sum, part) => sum + n(item.values[part]), 0));
  const max = Math.ceil(Math.max(...totals, 1) / 5) * 5;
  const step = width / groups.length;
  const barW = Math.max(5, Math.min(24, step * 0.72));
  const y = (value) => margin.top + stackHeight - (value / max) * stackHeight;
  const maSeries = PAGE_COMPOSITION_PARTS.map((part) => ({
    part,
    points: groups.map((item, index) => {
      const window = groups.slice(Math.max(0, index - 2), index + 1);
      return { month: item.month, value: mean(window.map((entry) => entry.values[part])) };
    }),
  }));
  const maMax = Math.ceil(Math.max(...maSeries.flatMap((series) => series.points.map((point) => point.value)), 1) / 5) * 5;
  const maY = (value) => maTop + maHeight - (value / maMax) * maHeight;

  let html = `<text x="${margin.left}" y="18" fill="${COLORS.neutral}" font-size="11" font-weight="800">Stacked columns show mean pages per document.</text>`;
  html += gridY(max, margin, width, stackHeight, 5).join("");
  groups.forEach((item, monthIndex) => {
    let running = 0;
    const x = margin.left + monthIndex * step + (step - barW) / 2;
    PAGE_COMPOSITION_PARTS.forEach((part) => {
      const value = n(item.values[part]);
      if (!value) return;
      const y0 = y(running + value);
      const y1 = y(running);
      html += `<rect x="${x}" y="${y0}" width="${barW}" height="${Math.max(1, y1 - y0)}" rx="2" fill="${PAGE_COMPOSITION_COLORS[part]}" data-tip="${escapeAttr(
        `${item.month}<br>${part}: ${fmtOne.format(value)} mean pages<br>${fmtInt.format(item.documents)} documents`
      )}"></rect>`;
      running += value;
    });
  });
  const months = groups.map((item) => item.month);
  html += monthTicks(months, margin, width, stackHeight);
  html += `<text x="${margin.left}" y="${maTop - 16}" fill="${COLORS.ink}" font-size="12" font-weight="850">3-month moving average</text>`;
  html += [0, 0.5, 1]
    .map((ratio) => {
      const value = maMax * ratio;
      const tickY = maY(value);
      return `<line class="grid-line" x1="${margin.left}" x2="${margin.left + width}" y1="${tickY}" y2="${tickY}"></line>
        <text x="${margin.left - 10}" y="${tickY + 4}" text-anchor="end" fill="${COLORS.neutral}" font-size="10">${fmtInt.format(value)}</text>`;
    })
    .join("");
  maSeries.forEach((series) => {
    const path = series.points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${margin.left + (index / Math.max(1, series.points.length - 1)) * width} ${maY(point.value)}`)
      .join(" ");
    html += `<path d="${path}" fill="none" stroke="${PAGE_COMPOSITION_COLORS[series.part]}" stroke-width="3.2" stroke-linecap="round"></path>`;
  });
  html += monthTicks(months, { ...margin, top: maTop }, width, maHeight);
  html += `<text x="${margin.left}" y="${pctTop - 16}" fill="${COLORS.ink}" font-size="12" font-weight="850">100% monthly mix</text>`;
  [0, 0.5, 1].forEach((ratio) => {
    const tickY = pctTop + pctHeight - ratio * pctHeight;
    html += `<line class="grid-line" x1="${margin.left}" x2="${margin.left + width}" y1="${tickY}" y2="${tickY}"></line>
      <text x="${margin.left - 10}" y="${tickY + 4}" text-anchor="end" fill="${COLORS.neutral}" font-size="10">${fmtInt.format(ratio * 100)}%</text>`;
  });
  groups.forEach((item, monthIndex) => {
    const total = PAGE_COMPOSITION_PARTS.reduce((sum, part) => sum + n(item.values[part]), 0);
    if (!total) return;
    let runningPct = 0;
    const x = margin.left + monthIndex * step + (step - barW) / 2;
    PAGE_COMPOSITION_PARTS.forEach((part) => {
      const value = n(item.values[part]);
      if (!value) return;
      const pct = value / total;
      const y0 = pctTop + pctHeight - (runningPct + pct) * pctHeight;
      const y1 = pctTop + pctHeight - runningPct * pctHeight;
      html += `<rect x="${x}" y="${y0}" width="${barW}" height="${Math.max(1, y1 - y0)}" rx="2" fill="${PAGE_COMPOSITION_COLORS[part]}" data-tip="${escapeAttr(
        `${item.month}<br>${part}: ${fmtPct.format(pct * 100)}% of mean pages<br>${fmtOne.format(value)} of ${fmtOne.format(total)} mean pages`
      )}"></rect>`;
      runningPct += pct;
    });
  });
  html += monthTicks(months, { ...margin, top: pctTop }, width, pctHeight);
  html += `<text x="${margin.left + width / 2}" y="${svgHeight - 14}" text-anchor="middle" fill="${COLORS.neutral}" font-size="12">BO validation month</text>`;
  html += PAGE_COMPOSITION_PARTS.map((part, index) => {
    const x = margin.left + index * 150;
    return `<g><rect x="${x}" y="${svgHeight - 34}" width="12" height="12" rx="2" fill="${PAGE_COMPOSITION_COLORS[part]}"></rect><text x="${
      x + 18
    }" y="${svgHeight - 24}" fill="${COLORS.ink}" font-size="11" font-weight="750">${escapeHtml(part)}</text></g>`;
  }).join("");
  svg.innerHTML = html;
  bindSvgTips(svg);
}

function renderPageSummaryTable() {
  const rows = pageTemplateStats(state.filtered);
  renderTable(
    $("pageSummaryTable"),
    ["Template", "Docs", "Mean Total", "Median Total", "Mean Pre-Opinion", "Mean Annex", "Median Annex", "Annex Share"],
    rows,
    (row) => [
      `<span class="pill">${escapeHtml(row.template)}</span>`,
      numCell(row.docs),
      numCell(row.meanPages),
      numCell(row.medianPages),
      numCell(row.meanPreOpinionPages),
      numCell(row.meanAnnexPages),
      numCell(row.medianAnnexPages),
      `${fmtPct.format(row.annexShare)}%`,
    ]
  );
}

function renderAnnexOutlierTable() {
  const rows = [...state.filtered]
    .filter((row) => n(row["Annex Page Count"]) > 0)
    .sort((a, b) => n(b["Annex Page Count"]) - n(a["Annex Page Count"]))
    .slice(0, 60);
  renderTable(
    $("annexOutlierTable"),
    ["Template", "BO Date", "Annex Pages", "Total Pages", "Pre-Opinion Pages", "File"],
    rows,
    (row) => [
      `<span class="pill">${escapeHtml(row["Template Type"])}</span>`,
      escapeHtml(formatDate(timelineDate(row))),
      numCell(row["Annex Page Count"]),
      numCell(row["Document Page Count"]),
      numCell(row["Page count before opinion"]),
      `<span class="file-cell">${escapeHtml(row["File Name"])}</span>`,
    ]
  );
}

function afsProcessLabel(row) {
  const value = String(row["New AFS Process"] || "").trim();
  return value === "New" || value === "Old" ? value : "";
}

function afsProcessRows() {
  return state.filtered.filter((row) => row["Template Type"] === "AFS" && afsProcessLabel(row));
}

function renderAfsProcessPageChart() {
  const container = $("afsProcessPageChart");
  const rows = afsProcessRows().filter((row) => timelineMonth(row));
  if (!rows.length) return empty(container, "No AFS rows with Old/New process values match the current filters.");
  const grouped = Array.from(groupBy(rows, (row) => `${timelineMonth(row)}|${afsProcessLabel(row)}`).entries())
    .map(([key, items]) => {
      const [month, process] = key.split("|");
      return {
        month,
        process,
        documents: items.length,
        meanPages: mean(items.map((row) => row["Document Page Count"])),
        medianPages: quantile(items.map((row) => row["Document Page Count"]), 0.5),
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month) || a.process.localeCompare(b.process));
  const months = Array.from(new Set(grouped.map((row) => row.month))).sort();
  const processes = ["Old", "New"].filter((process) => grouped.some((row) => row.process === process));
  const svg = makeSvg(container, 980, 430);
  const margin = { top: 42, right: 88, bottom: 72, left: 70 };
  const width = 980 - margin.left - margin.right;
  const height = 430 - margin.top - margin.bottom;
  const max = Math.ceil(Math.max(...grouped.map((row) => row.meanPages), 1) / 5) * 5;
  const x = (monthIndex) => margin.left + (monthIndex / Math.max(1, months.length - 1)) * width;
  const y = (value) => margin.top + height - (value / max) * height;

  let html = `<text x="${margin.left}" y="20" fill="${COLORS.neutral}" font-size="11" font-weight="800">Lines show monthly mean total pages for AFS documents.</text>`;
  html += gridY(max, margin, width, height, 5).join("");
  processes.forEach((process, processIndex) => {
    const points = months
      .map((month, monthIndex) => {
        const row = grouped.find((item) => item.month === month && item.process === process);
        return row ? { ...row, x: x(monthIndex), y: y(row.meanPages) } : null;
      })
      .filter(Boolean);
    const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
    html += `<path d="${path}" fill="none" stroke="${AFS_PROCESS_COLORS[process]}" stroke-width="3.5" stroke-linecap="round"></path>`;
    points.forEach((point) => {
      html += `<circle cx="${point.x}" cy="${point.y}" r="4.5" fill="${AFS_PROCESS_COLORS[process]}" stroke="#ffffff" stroke-width="1.5" data-tip="${escapeAttr(
        `${point.month}<br>${process} process<br>${fmtOne.format(point.meanPages)} mean pages<br>${fmtOne.format(point.medianPages)} median pages<br>${fmtInt.format(point.documents)} AFS documents`
      )}"></circle>`;
    });
    const legendX = margin.left + 520 + processIndex * 110;
    html += `<g><rect x="${legendX}" y="12" width="12" height="12" rx="2" fill="${AFS_PROCESS_COLORS[process]}"></rect><text x="${
      legendX + 18
    }" y="22" fill="${COLORS.ink}" font-size="11" font-weight="800">${escapeHtml(process)}</text></g>`;
  });
  html += monthTicks(months, margin, width, height);
  html += `<text x="${margin.left + width / 2}" y="${height + margin.top + 50}" text-anchor="middle" fill="${COLORS.neutral}" font-size="12">BO validation month</text>`;
  svg.innerHTML = html;
  bindSvgTips(svg);
}

function renderAfsProcessPageTable() {
  const rows = Array.from(groupBy(afsProcessRows(), afsProcessLabel).entries())
    .map(([process, items]) => {
      const dates = items.map(timelineDate).filter(Boolean).sort();
      const meanPages = mean(items.map((row) => row["Document Page Count"]));
      const pre = mean(items.map((row) => row["Page count before opinion"]));
      const annex = mean(items.map((row) => row["Annex Page Count"]));
      return {
        process,
        documents: items.length,
        meanPages,
        medianPages: quantile(items.map((row) => row["Document Page Count"]), 0.5),
        meanPreOpinionPages: pre,
        meanOpinionPages: Math.max(0, meanPages - pre - annex),
        meanAnnexPages: annex,
        dateMin: dates[0] || "",
        dateMax: dates[dates.length - 1] || "",
      };
    })
    .sort((a, b) => ["Old", "New"].indexOf(a.process) - ["Old", "New"].indexOf(b.process));
  renderTable(
    $("afsProcessPageTable"),
    ["AFS Process", "AFS Docs", "Mean Pages", "Median Pages", "Pre-Opinion Pages", "Opinion Pages", "Annex Pages", "BO Date Range"],
    rows,
    (row) => [
      `<span class="pill">${escapeHtml(row.process)}</span>`,
      numCell(row.documents),
      numCell(row.meanPages),
      numCell(row.medianPages),
      numCell(row.meanPreOpinionPages),
      numCell(row.meanOpinionPages),
      numCell(row.meanAnnexPages),
      `${escapeHtml(formatDate(row.dateMin))} to ${escapeHtml(formatDate(row.dateMax))}`,
    ]
  );
}

function renderTimePagesChart() {
  const data = monthlyGroups(state.filtered);
  const metric = trendMetricConfig(state.timeTrendMetric);
  renderLineChart($("timePagesChart"), data, {
    value: metric.value,
    label: metric.axisLabel,
    movingAverage: true,
    tip: (d) => `${d.month} ${d.template}<br>${metric.format(metric.value(d))} ${metric.tipLabel}`,
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
  const data = Array.from(groupBy(state.filtered.filter((row) => timelineMonth(row)), timelineMonth).entries())
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
  rows.sort((a, b) => b.documents - a.documents);
  renderBatchTable(rows);
}

function renderQualityView() {
  const flagRows = [
    ["Missing date", state.filtered.filter((row) => row["Has Missing Date"]).length],
    ["Future date", state.filtered.filter((row) => row["Is Future Date"]).length],
    ["Missing BO date", state.filtered.filter((row) => row["Has Missing BO Date"]).length],
  ].map(([flag, count]) => ({ flag, count }));
  renderVerticalBars($("qualityChart"), flagRows, {
    label: (d) => d.flag,
    value: (d) => d.count,
    color: (_, i) => ["#c1666b", "#b88a2c", "#00856f"][i],
    tip: (d) => `${d.flag}<br>${fmtInt.format(d.count)} records`,
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
  renderTable($("recordTable"), ["Template", "Extraction", "Product", "BO Date", "Date", "Words", "Op", "File"], pageRows, (row) => [
    `<span class="pill">${escapeHtml(row["Template Type"])}</span>`,
    `<span class="pill ${row.Extraction === "Manual" ? "manual" : "auto"}">${escapeHtml(row.Extraction)}</span>`,
    escapeHtml(shortLabel(row["Financing Product Name"], 28)),
    escapeHtml(formatDate(row["BO Validation Date"])),
    escapeHtml(formatDate(row["Validation Date"])),
    numCell(row["Text Before Opinions"]),
    escapeHtml(row["Operation Number"] || ""),
    `<span class="file-cell">${escapeHtml(row["File Name"])}</span>`,
  ]);
}

function recordSorter() {
  const sorters = {
    "words-desc": (a, b) => n(b["Text Before Opinions"]) - n(a["Text Before Opinions"]),
    "words-asc": (a, b) => n(a["Text Before Opinions"]) - n(b["Text Before Opinions"]),
    "pages-desc": (a, b) => n(b["Document Page Count"]) - n(a["Document Page Count"]),
    "date-desc": (a, b) => String(timelineDate(b)).localeCompare(String(timelineDate(a))),
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
  const max = options.max || Math.max(...data.map((d) => Math.abs(options.value(d))), 1);
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
      const color = options.color ? options.color(d) : value >= 0 ? COLORS.green : COLORS.rose;
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
  templates.forEach((template, templateIndex) => {
    const color = options.color ? options.color(template, templateIndex) : templateColor(template);
    const points = months
      .map((month) => lookup.get(`${month}|${template}`))
      .filter(Boolean);
    if (!points.length) return;
    const path = points.map((d, i) => `${i === 0 ? "M" : "L"} ${x(d.month)} ${y(options.value(d))}`).join(" ");
    html += `<path d="${path}" fill="none" stroke="${color}" stroke-width="3"></path>`;
    html += points
      .map((d) => `<circle class="point" cx="${x(d.month)}" cy="${y(options.value(d))}" r="4" fill="${color}" data-tip="${escapeAttr(options.tip(d))}"></circle>`)
      .join("");
    if (options.movingAverage) {
      const ma = movingAverage(points, options.value);
      const maPath = ma.map((d, i) => `${i === 0 ? "M" : "L"} ${x(d.month)} ${y(d.value)}`).join(" ");
      html += `<path d="${maPath}" fill="none" stroke="${color}" stroke-width="2" opacity="0.38" stroke-dasharray="6 5"></path>`;
    }
  });
  html += monthTicks(months, margin, width, height);
  html += templates
    .map((template, i) => `<g><rect x="${margin.left + i * 132}" y="395" width="12" height="12" rx="2" fill="${
      options.color ? options.color(template, i) : templateColor(template)
    }"></rect><text x="${margin.left + 18 + i * 132}" y="406" fill="${COLORS.ink}" font-size="12">${template}</text></g>`)
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
    "Financing Product Name",
    "Operation Special Activities Flag",
    "Validation Date",
    "BO Validation Date",
    "BO Validation Delta Days",
    "BO Author (OPS/GLO)",
    "BO PJ",
    "BO RM",
    "BO JU",
    "BO ECON",
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

function dogFaceSvg(faceColor, earColor, spotColor) {
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
    <path d="M18 24 C9 18, 8 8, 17 7 C26 7, 27 17, 24 25 Z" fill="${earColor}"></path>
    <path d="M46 24 C55 18, 56 8, 47 7 C38 7, 37 17, 40 25 Z" fill="${earColor}"></path>
    <circle cx="32" cy="33" r="24" fill="${faceColor}"></circle>
    <path d="M18 29 C20 18, 31 15, 34 26 C28 30, 24 32, 18 29 Z" fill="${spotColor}" opacity="0.82"></path>
    <circle cx="24" cy="32" r="3.2" fill="#17212b"></circle>
    <circle cx="40" cy="32" r="3.2" fill="#17212b"></circle>
    <path d="M29 40 C31 38, 33 38, 35 40 C34 43, 30 43, 29 40 Z" fill="#17212b"></path>
    <path d="M32 42 C30 47, 24 46, 22 43" fill="none" stroke="#17212b" stroke-width="2.4" stroke-linecap="round"></path>
    <path d="M32 42 C34 47, 40 46, 42 43" fill="none" stroke="#17212b" stroke-width="2.4" stroke-linecap="round"></path>
    <path d="M32 47 C35 48, 36 51, 33 53 C30 52, 29 49, 32 47 Z" fill="#e86f7e"></path>
    <circle cx="23" cy="26" r="1.2" fill="#fff" opacity="0.9"></circle>
    <circle cx="39" cy="26" r="1.2" fill="#fff" opacity="0.9"></circle>
  </svg>`;
}

function makeDogParticle(layer, className, options) {
  const faces = [
    ["#ffd1dc", "#ff6fa3", "#fff4f8"],
    ["#ffe4ef", "#d9467f", "#ff9fc2"],
    ["#fff7fb", "#b83272", "#ffc2d9"],
    ["#f8b7cf", "#8f245d", "#ffe6f0"],
    ["#ffffff", "#ff8fbd", "#f6a6c9"],
  ];
  const palette = faces[Math.floor(Math.random() * faces.length)];
  const dog = document.createElement("div");
  dog.className = `dog-particle ${className}`;
  dog.style.setProperty("--size", `${options.size}px`);
  dog.style.setProperty("--start-x", `${options.x}px`);
  dog.style.setProperty("--start-y", `${options.y}px`);
  dog.style.setProperty("--dx", `${options.dx || 0}px`);
  dog.style.setProperty("--dy", `${options.dy || 0}px`);
  dog.style.setProperty("--drift", `${options.drift || 0}px`);
  dog.style.setProperty("--spin", `${options.spin}deg`);
  dog.style.setProperty("--duration", `${options.duration}s`);
  dog.style.setProperty("--delay", `${options.delay || 0}s`);
  dog.innerHTML = dogFaceSvg(...palette);
  layer.appendChild(dog);
}

function triggerDogRain() {
  document.documentElement.dataset.puppyStorm = String(Number(document.documentElement.dataset.puppyStorm || 0) + 1);
  const existing = document.querySelector(".dog-rain-layer");
  if (existing) existing.remove();

  const layer = document.createElement("div");
  layer.className = "dog-rain-layer";
  document.body.appendChild(layer);

  const face = $("elevenFace");
  const rect = face ? face.getBoundingClientRect() : null;
  const centerX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const centerY = rect ? rect.top + rect.height / 2 : 90;

  for (let i = 0; i < 34; i += 1) {
    makeDogParticle(layer, "dog-burst", {
      x: centerX,
      y: centerY,
      dx: Math.random() * 330 - 165,
      dy: Math.random() * 230 - 150,
      spin: Math.random() * 520 - 260,
      size: Math.random() * 18 + 24,
      duration: Math.random() * 0.55 + 1.0,
    });
  }

  for (let i = 0; i < 48; i += 1) {
    makeDogParticle(layer, "dog-rain", {
      x: Math.random() * window.innerWidth,
      y: -80,
      drift: Math.random() * 180 - 90,
      spin: Math.random() * 420 - 210,
      size: Math.random() * 24 + 24,
      duration: Math.random() * 1.9 + 2.5,
      delay: Math.random() * 1.35 + 0.18,
    });
  }

  window.setTimeout(() => layer.remove(), 6200);
}

window.triggerDogRain = triggerDogRain;

async function loadDashboardData({ preserveFilters = false } = {}) {
  const snapshot = preserveFilters ? captureFilterState() : null;
  const response = await fetch(`dashboard_data.json?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load dashboard_data.json");
  state.raw = await response.json();
  state.records = state.raw.records;
  populateFilters();
  if (snapshot) restoreFilterState(snapshot);
  update();
}

async function refreshDashboardData() {
  const button = $("refreshData");
  const originalText = button.textContent;
  button.disabled = true;
  button.classList.add("refreshing");
  button.textContent = "Refreshing...";
  try {
    await loadDashboardData({ preserveFilters: true });
    const now = new Date();
    button.textContent = `Refreshed ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    window.setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove("refreshing");
      button.disabled = false;
    }, 2200);
  } catch (error) {
    button.textContent = "Refresh Failed";
    button.classList.remove("refreshing");
    button.disabled = false;
    window.alert(`Could not refresh dashboard_data.json: ${error.message}`);
  }
}

async function init() {
  await loadDashboardData();
  bindEvents();
  updateMcTypeControls();
}

init().catch((error) => {
  document.body.innerHTML = `<main class="main-panel"><article class="panel"><div class="panel-header"><div><h3>Dashboard load failed</h3><p>${escapeHtml(
    error.message
  )}</p></div></div></article></main>`;
});
