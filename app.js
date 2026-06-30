import { calculateStack, rangeValues, validateConfig } from "./core.js";
import { MATERIALS } from "./materials.js";

const $ = (id) => document.getElementById(id);
const fmt = (value, digits = 5) => {
  if (!Number.isFinite(value)) return "NaN";
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) return value.toExponential(3);
  return Number(value).toPrecision(digits).replace(/\.?0+$/, "");
};
const pct = (value) => `${fmt(value * 100, 5)}%`;
const uid = () => (globalThis.crypto?.randomUUID?.() || `L${Date.now()}${Math.random().toString(16).slice(2)}`);

const els = {
  wavelength: $("wavelength"),
  thetaDeg: $("thetaDeg"),
  nIn: $("nIn"),
  kIn: $("kIn"),
  nSub: $("nSub"),
  kSub: $("kSub"),
  splitPolarWavelength: $("splitPolarWavelength"),
  polarWavelengths: $("polarWavelengths"),
  lambdaS: $("lambdaS"),
  lambdaP: $("lambdaP"),
  materialPicker: $("materialPicker"),
  addMaterial: $("addMaterial"),
  addCustom: $("addCustom"),
  dbMatName: $("dbMatName"),
  dbMatCategory: $("dbMatCategory"),
  dbMatN: $("dbMatN"),
  dbMatK: $("dbMatK"),
  dbMatA: $("dbMatA"),
  dbMatB: $("dbMatB"),
  dbMatC: $("dbMatC"),
  addMaterialToDb: $("addMaterialToDb"),
  importMaterialDb: $("importMaterialDb"),
  exportMaterialDb: $("exportMaterialDb"),
  clearCustomMaterials: $("clearCustomMaterials"),
  materialDbCount: $("materialDbCount"),
  materialDbHint: $("materialDbHint"),
  layerTable: $("layerTable"),
  scanLayer: $("scanLayer"),
  scanLamStart: $("scanLamStart"),
  scanLamEnd: $("scanLamEnd"),
  scanLamStep: $("scanLamStep"),
  scanDStart: $("scanDStart"),
  scanDEnd: $("scanDEnd"),
  scanDStep: $("scanDStep"),
  scanThetaStart: $("scanThetaStart"),
  scanThetaEnd: $("scanThetaEnd"),
  scanThetaStep: $("scanThetaStep"),
  singleCalc: $("singleCalc"),
  wavelengthScan: $("wavelengthScan"),
  thicknessScan: $("thicknessScan"),
  angleScan: $("angleScan"),
  saveConfig: $("saveConfig"),
  loadConfig: $("loadConfig"),
  exportCsv: $("exportCsv"),
  chartCanvas: $("chartCanvas"),
  stackCanvas: $("stackCanvas"),
  chartZoomSelect: $("chartZoomSelect"),
  chartResetView: $("chartResetView"),
  chartReadout: $("chartReadout"),
  chartTitle: $("chartTitle"),
  pointCount: $("pointCount"),
  resultCards: $("resultCards"),
  validationText: $("validationText"),
  energyBadge: $("energyBadge"),
  statusText: $("statusText"),
  toast: $("toast"),
};

const chartPalette = ["#8b5cf6", "#38bdf8", "#f59e0b", "#36d399", "#ff4d6d", "#b8c0ff"];
const MATERIAL_DB_KEY = "fresnel.materialDb.v1";

const state = {
  materials: [...MATERIALS],
  customMaterials: [],
  layers: [
    { id: uid(), name: "MgF2", material: "MgF2", useDispersion: true, n: 1.38, k: 0, d: 105 },
    { id: uid(), name: "TiO2", material: "TiO2", useDispersion: true, n: 2.61, k: 0, d: 62 },
  ],
  chart: null,
  chartViewport: null,
  chartLayout: null,
  chartHover: null,
  zoomMode: false,
  zoomDrag: null,
  lastResult: null,
  toastTimer: null,
};

function numberFrom(el, fallback = 0) {
  const value = Number(el.value);
  return Number.isFinite(value) ? value : fallback;
}

function setStatus(text) {
  els.statusText.textContent = text;
}

function toast(message) {
  clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  state.toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function materialByNameDb(name) {
  return state.materials.find((material) => material.name === name) || state.materials[0] || MATERIALS[0];
}

function normalizeMaterial(raw) {
  if (!raw || typeof raw !== "object") return null;
  const read = (...keys) => {
    for (const key of keys) if (raw[key] !== undefined && raw[key] !== "") return raw[key];
    return undefined;
  };
  const name = String(read("name", "Name", "material", "Material") || "").trim();
  const category = String(read("category", "Category", "group", "Group") || "User").trim() || "User";
  const n = Number(read("n", "N"));
  const k = Number(read("k", "K") ?? 0);
  if (!name || !(n > 0) || !(k >= 0)) return null;
  let cauchy = null;
  if (Array.isArray(raw.cauchy) && raw.cauchy.length >= 2) {
    cauchy = raw.cauchy.map(Number).slice(0, 3);
  } else {
    const A = Number(read("A", "a", "cauchyA", "CauchyA"));
    const B = Number(read("B", "b", "cauchyB", "CauchyB"));
    const C = Number(read("C", "c", "cauchyC", "CauchyC") ?? 0);
    if (Number.isFinite(A) && Number.isFinite(B)) cauchy = [A, B, Number.isFinite(C) ? C : 0];
  }
  if (cauchy && !cauchy.every(Number.isFinite)) cauchy = null;
  return { name, category, n, k, ...(cauchy ? { cauchy } : {}), user: true };
}

function rebuildMaterialDb() {
  const map = new Map();
  MATERIALS.forEach((material) => map.set(material.name, { ...material, builtin: true }));
  state.customMaterials.forEach((material) => map.set(material.name, { ...material, user: true }));
  state.materials = [...map.values()];
  if (els.materialDbCount) {
    els.materialDbCount.textContent = `${state.materials.length} MATERIALS / ${state.customMaterials.length} CUSTOM`;
  }
  if (els.materialDbHint) {
    els.materialDbHint.textContent = `支持 JSON 或 CSV：name, category, n, k, A, B, C。自定义材料保存在浏览器 localStorage；同名自定义材料会覆盖内置材料。`;
  }
}

function loadCustomMaterialDb() {
  try {
    const raw = localStorage.getItem(MATERIAL_DB_KEY);
    if (!raw) {
      rebuildMaterialDb();
      return;
    }
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed.materials;
    state.customMaterials = (Array.isArray(list) ? list : []).map(normalizeMaterial).filter(Boolean);
  } catch {
    state.customMaterials = [];
  }
  rebuildMaterialDb();
}

function saveCustomMaterialDb() {
  localStorage.setItem(MATERIAL_DB_KEY, JSON.stringify({
    version: 1,
    updatedAt: new Date().toISOString(),
    materials: state.customMaterials.map(({ user, builtin, ...material }) => material),
  }, null, 2));
  rebuildMaterialDb();
}

function nkForMaterialDb(name, wavelengthNm, useDispersion = false) {
  const material = materialByNameDb(name);
  if (useDispersion && material.cauchy) {
    const [A, B, C = 0] = material.cauchy;
    const lamUm = Number(wavelengthNm) / 1000;
    if (lamUm > 0) {
      return {
        n: A + B / lamUm ** 2 + C / lamUm ** 4,
        k: Number(material.k || 0),
        source: material.user ? "custom Cauchy" : "Cauchy",
      };
    }
  }
  return {
    n: Number(material.n),
    k: Number(material.k || 0),
    source: material.user ? "custom fixed" : "fixed@550nm",
  };
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"" && line[i + 1] === "\"") {
      current += "\"";
      i += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseMaterialsCsv(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

function mergeCustomMaterials(materials) {
  const incoming = materials.map(normalizeMaterial).filter(Boolean);
  const map = new Map(state.customMaterials.map((material) => [material.name, material]));
  incoming.forEach((material) => map.set(material.name, material));
  state.customMaterials = [...map.values()];
  saveCustomMaterialDb();
  fillMaterialSelect(els.materialPicker, els.materialPicker.value);
  renderLayerTable();
  updateTelemetry();
  return incoming.length;
}

function createOption(value, label = value) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function fillMaterialSelect(select, selected) {
  select.textContent = "";
  const categories = [...new Set(state.materials.map((material) => material.category))];
  categories.forEach((category) => {
    const group = document.createElement("optgroup");
    group.label = category;
    state.materials.filter((material) => material.category === category).forEach((material) => {
      group.append(createOption(material.name));
    });
    select.append(group);
  });
  if (selected && state.materials.some((material) => material.name === selected)) select.value = selected;
  else select.value = state.materials.some((material) => material.name === "MgF2") ? "MgF2" : state.materials[0]?.name || "Custom";
}

function materialAtCurrentWavelength(name, useDispersion) {
  return nkForMaterialDb(name, numberFrom(els.wavelength, 550), useDispersion);
}

function layerNumberFromSubstrate(index, total = state.layers.length) {
  return Math.max(1, total - index);
}

function layerLabel(index, total = state.layers.length) {
  return `L${layerNumberFromSubstrate(index, total)}`;
}

function addLayer(materialName = "Custom") {
  const useDispersion = Boolean(materialByNameDb(materialName).cauchy);
  const nk = materialAtCurrentWavelength(materialName, useDispersion);
  // Layer array order is incident side -> substrate side.
  // Newly deposited/added layers should sit above existing layers, so older
  // layers remain closer to the substrate.
  state.layers.unshift({
    id: uid(),
    name: materialName,
    material: materialName,
    useDispersion,
    n: nk.n,
    k: nk.k,
    d: 50,
  });
  renderLayerTable();
  updateTelemetry();
}

function renderLayerTable() {
  els.layerTable.textContent = "";
  state.layers.forEach((layer, index) => {
    const row = document.createElement("div");
    row.className = "layer-row";
    row.dataset.id = layer.id;

    const indexCell = document.createElement("div");
    indexCell.className = "layer-index";
    indexCell.textContent = layerLabel(index);
    row.append(indexCell);

    const nameLabel = document.createElement("label");
    nameLabel.className = "layer-name-field";
    nameLabel.textContent = "名称";
    const nameInput = document.createElement("input");
    nameInput.dataset.field = "name";
    nameInput.value = layer.name;
    nameLabel.append(nameInput);
    row.append(nameLabel);

    const materialLabel = document.createElement("label");
    materialLabel.className = "layer-material-field";
    materialLabel.textContent = "材料";
    const materialSelect = document.createElement("select");
    materialSelect.dataset.field = "material";
    fillMaterialSelect(materialSelect, layer.material);
    materialLabel.append(materialSelect);
    row.append(materialLabel);

    const dispersionLabel = document.createElement("label");
    dispersionLabel.className = "layer-dispersion-field";
    dispersionLabel.textContent = "色散";
    const dispersionInput = document.createElement("input");
    dispersionInput.type = "checkbox";
    dispersionInput.dataset.field = "useDispersion";
    dispersionInput.checked = Boolean(layer.useDispersion);
    dispersionLabel.append(dispersionInput);
    row.append(dispersionLabel);

    const preview = materialAtCurrentWavelength(layer.material, layer.useDispersion);

    const nLabel = document.createElement("label");
    nLabel.className = "layer-n-field";
    nLabel.textContent = "n";
    const nInput = document.createElement("input");
    nInput.type = "number";
    nInput.step = "0.0001";
    nInput.min = "0.0001";
    nInput.dataset.field = "n";
    nInput.value = fmt(layer.useDispersion ? preview.n : layer.n, 7);
    nInput.readOnly = Boolean(layer.useDispersion && layer.material !== "Custom");
    nLabel.append(nInput);
    row.append(nLabel);

    const kLabel = document.createElement("label");
    kLabel.className = "layer-k-field";
    kLabel.textContent = "k";
    const kInput = document.createElement("input");
    kInput.type = "number";
    kInput.step = "0.0001";
    kInput.min = "0";
    kInput.dataset.field = "k";
    kInput.value = fmt(layer.useDispersion ? preview.k : layer.k, 7);
    kInput.readOnly = Boolean(layer.useDispersion && layer.material !== "Custom");
    kLabel.append(kInput);
    row.append(kLabel);

    const dLabel = document.createElement("label");
    dLabel.className = "layer-d-field";
    dLabel.textContent = "d / nm";
    const dInput = document.createElement("input");
    dInput.type = "number";
    dInput.step = "0.1";
    dInput.min = "0";
    dInput.dataset.field = "d";
    dInput.value = layer.d;
    dLabel.append(dInput);
    row.append(dLabel);

    const actions = document.createElement("div");
    actions.className = "layer-actions";
    [
      ["up", "↑"],
      ["down", "↓"],
      ["delete", "×"],
    ].forEach(([action, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.action = action;
      button.textContent = label;
      actions.append(button);
    });
    row.append(actions);

    const sourceLine = document.createElement("div");
    sourceLine.className = "source-line";
    sourceLine.textContent = `SOURCE=${preview.source} · n_eff=${fmt(preview.n, 7)} · k_eff=${fmt(preview.k, 7)} @ ${fmt(numberFrom(els.wavelength, 550), 6)} nm`;
    row.append(sourceLine);

    els.layerTable.append(row);
  });
  renderScanLayerSelect();
}

function renderScanLayerSelect() {
  const oldValue = els.scanLayer.value;
  els.scanLayer.textContent = "";
  state.layers.forEach((layer, index) => {
    els.scanLayer.append(createOption(String(index), `${layerLabel(index)} ${layer.name}`));
  });
  if (state.layers.length) {
    els.scanLayer.value = Number(oldValue) < state.layers.length ? oldValue : "0";
  }
}

function resolveLayers(wavelength, layerOverrides = new Map()) {
  return state.layers.map((layer, index) => {
    const override = layerOverrides.get(index) || {};
    const material = override.material ?? layer.material;
    const useDispersion = override.useDispersion ?? layer.useDispersion;
    const nk = useDispersion ? nkForMaterialDb(material, wavelength, true) : { n: layer.n, k: layer.k, source: "manual" };
    return {
      name: override.name ?? layer.name,
      material,
      useDispersion,
      n: Number(override.n ?? nk.n),
      k: Number(override.k ?? nk.k),
      d: Number(override.d ?? layer.d),
      source: nk.source,
    };
  });
}

function getConfig(overrides = {}) {
  const wavelength = Number(overrides.wavelength ?? numberFrom(els.wavelength, 550));
  const split = els.splitPolarWavelength.checked;
  const lambdaS = Number(overrides.lambdaS ?? (split ? numberFrom(els.lambdaS, wavelength) : wavelength));
  const lambdaP = Number(overrides.lambdaP ?? (split ? numberFrom(els.lambdaP, wavelength) : wavelength));
  return {
    wavelength,
    lambdaS,
    lambdaP,
    thetaDeg: Number(overrides.thetaDeg ?? numberFrom(els.thetaDeg, 0)),
    nIn: Number(overrides.nIn ?? numberFrom(els.nIn, 1)),
    kIn: Number(overrides.kIn ?? numberFrom(els.kIn, 0)),
    nSub: Number(overrides.nSub ?? numberFrom(els.nSub, 1.5)),
    kSub: Number(overrides.kSub ?? numberFrom(els.kSub, 0)),
    layers: overrides.layers ?? resolveLayers(wavelength),
  };
}

function updateResultCards(result) {
  const cards = [
    ["R AVG", result.R_avg, "平均反射率"],
    ["T AVG", result.T_avg, "平均透过率"],
    ["A AVG", result.A_avg, "吸收/损耗"],
    ["R S", result.R_s, "s 偏振反射"],
    ["R P", result.R_p, "p 偏振反射"],
    ["ΔE", Math.max(Math.abs(result.energy_s - 1), Math.abs(result.energy_p - 1)), "能量闭合误差"],
  ];
  els.resultCards.textContent = "";
  cards.forEach(([label, value, desc]) => {
    const card = document.createElement("div");
    card.className = "metric-card";
    const small = document.createElement("small");
    small.textContent = `${label} / ${desc}`;
    const output = document.createElement("output");
    output.textContent = label === "ΔE" ? fmt(value, 4) : pct(value);
    card.append(small, output);
    els.resultCards.append(card);
  });
}

function setValidation(errors, config, result = null) {
  if (errors.length) {
    els.validationText.textContent = errors.join("；");
    els.energyBadge.textContent = "INPUT WARN";
    els.energyBadge.classList.add("warn");
    return;
  }
  const layerText = config.layers.map((layer, index) => `${layerLabel(index, config.layers.length)}:${layer.name} n=${fmt(layer.n, 6)} k=${fmt(layer.k, 6)} d=${fmt(layer.d, 6)}nm`).join(" / ");
  const drift = result ? Math.max(Math.abs(result.energy_s - 1), Math.abs(result.energy_p - 1)) : 0;
  els.validationText.textContent = `参数有效。${layerText || "无膜层，直接界面计算"}。能量闭合误差 ${fmt(drift, 4)}。`;
  els.energyBadge.textContent = drift < 1e-7 ? "ENERGY OK" : "ENERGY WARN";
  els.energyBadge.classList.toggle("warn", drift >= 1e-7);
}

function updateTelemetry() {
  const config = getConfig();
  const errors = validateConfig(config);
  if (errors.length) {
    setValidation(errors, config);
    setStatus("INPUT WARN");
    return null;
  }
  try {
    const result = calculateStack(config);
    state.lastResult = result;
    updateResultCards(result);
    setValidation([], config, result);
    drawStack(config.layers);
    setStatus("READY");
    return { config, result };
  } catch (error) {
    els.validationText.textContent = `计算失败：${error.message}`;
    setStatus("ERROR");
    return null;
  }
}

function fitCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, rect.width || canvas.width);
  const height = Math.max(220, rect.height || canvas.height);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function drawChartFrame(ctx, width, height, title) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#070a10";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#20283a";
  ctx.lineWidth = 1;
  for (let x = 48; x < width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 40; y < height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#98a0b3";
  ctx.font = "11px IBM Plex Mono, monospace";
  ctx.fillText(`// ${title}`, 18, 24);
}

function inPlotArea(x, y, layout = state.chartLayout) {
  if (!layout) return false;
  return x >= layout.margin.left && x <= layout.margin.left + layout.plotW
    && y >= layout.margin.top && y <= layout.margin.top + layout.plotH;
}

function setChartReadout(text) {
  if (els.chartReadout) els.chartReadout.textContent = text;
}

function drawHoverReadout(ctx, width, hover) {
  if (!hover) return;
  ctx.save();
  ctx.strokeStyle = hover.color;
  ctx.fillStyle = hover.color;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(hover.px, state.chartLayout.margin.top);
  ctx.lineTo(hover.px, state.chartLayout.margin.top + state.chartLayout.plotH);
  ctx.moveTo(state.chartLayout.margin.left, hover.py);
  ctx.lineTo(state.chartLayout.margin.left + state.chartLayout.plotW, hover.py);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(hover.px, hover.py, 4, 0, Math.PI * 2);
  ctx.fill();
  const text = `${hover.label}  x=${fmt(hover.xValue, 6)}  y=${fmt(hover.yValue, 6)}`;
  ctx.font = "12px IBM Plex Mono, monospace";
  const textW = ctx.measureText(text).width;
  const boxW = Math.min(width - 32, textW + 24);
  const boxX = width - boxW - 18;
  const boxY = 16;
  ctx.fillStyle = "rgba(11, 13, 18, 0.92)";
  ctx.fillRect(boxX, boxY, boxW, 28);
  ctx.strokeStyle = hover.color;
  ctx.strokeRect(boxX, boxY, boxW, 28);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, boxX + 12, boxY + 18);
  ctx.restore();
}

function drawZoomRectangle(ctx) {
  if (!state.zoomDrag || !state.chartLayout) return;
  const { start, current } = state.zoomDrag;
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const w = Math.abs(current.x - start.x);
  const h = Math.abs(current.y - start.y);
  ctx.save();
  ctx.fillStyle = "rgba(139, 92, 246, 0.14)";
  ctx.strokeStyle = "#8b5cf6";
  ctx.setLineDash([6, 4]);
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function drawLineChart(chart) {
  const { ctx, width, height } = fitCanvas(els.chartCanvas);
  drawChartFrame(ctx, width, height, chart.title);
  const margin = { left: 58, right: 22, top: 48, bottom: 48 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const xValues = chart.rows.map((row) => row[chart.xField]).filter(Number.isFinite);
  const yValues = [];
  chart.series.forEach((series) => chart.rows.forEach((row) => {
    if (Number.isFinite(row[series.field])) yValues.push(row[series.field]);
  }));
  if (!xValues.length || !yValues.length) return;
  const fullXMin = Math.min(...xValues);
  const fullXMax = Math.max(...xValues);
  let fullYMin = Math.min(0, Math.min(...yValues));
  let fullYMax = Math.max(1, Math.max(...yValues));
  if (Math.abs(fullYMax - fullYMin) < 1e-12) fullYMax = fullYMin + 1;
  const fullPad = (fullYMax - fullYMin) * 0.04;
  fullYMin -= fullPad;
  fullYMax += fullPad;
  const xMin = state.chartViewport?.xMin ?? fullXMin;
  const xMax = state.chartViewport?.xMax ?? fullXMax;
  let yMin = state.chartViewport?.yMin ?? fullYMin;
  let yMax = state.chartViewport?.yMax ?? fullYMax;
  if (Math.abs(yMax - yMin) < 1e-12) yMax = yMin + 1;
  const xScale = (value) => margin.left + (xMax === xMin ? 0.5 : (value - xMin) / (xMax - xMin)) * plotW;
  const yScale = (value) => margin.top + (1 - (value - yMin) / (yMax - yMin)) * plotH;
  const xInvert = (value) => xMin + (value - margin.left) / plotW * (xMax - xMin);
  const yInvert = (value) => yMax - (value - margin.top) / plotH * (yMax - yMin);
  state.chartLayout = { margin, plotW, plotH, xMin, xMax, yMin, yMax, xScale, yScale, xInvert, yInvert, width, height };

  ctx.strokeStyle = "#4a5268";
  ctx.lineWidth = 1;
  ctx.strokeRect(margin.left, margin.top, plotW, plotH);
  ctx.fillStyle = "#98a0b3";
  ctx.font = "11px IBM Plex Mono, monospace";
  for (let i = 0; i <= 5; i += 1) {
    const y = margin.top + plotH * i / 5;
    const value = yMax - (yMax - yMin) * i / 5;
    ctx.fillText(fmt(value, 3), 8, y + 4);
    ctx.strokeStyle = i === 5 ? "#4a5268" : "#20283a";
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(width - margin.right, y);
    ctx.stroke();
  }
  for (let i = 0; i <= 5; i += 1) {
    const x = margin.left + plotW * i / 5;
    const value = xMin + (xMax - xMin) * i / 5;
    ctx.fillText(fmt(value, 5), x - 16, height - 20);
    ctx.strokeStyle = "#20283a";
    ctx.beginPath();
    ctx.moveTo(x, margin.top);
    ctx.lineTo(x, height - margin.bottom);
    ctx.stroke();
  }
  ctx.fillStyle = "#cdd3e7";
  ctx.fillText(chart.xLabel, margin.left + plotW / 2 - 26, height - 8);
  ctx.save();
  ctx.translate(15, margin.top + plotH / 2 + 28);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(chart.yLabel, 0, 0);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(margin.left, margin.top, plotW, plotH);
  ctx.clip();
  chart.series.forEach((series, seriesIndex) => {
    ctx.beginPath();
    ctx.strokeStyle = series.color || chartPalette[seriesIndex % chartPalette.length];
    ctx.lineWidth = series.width || 2;
    ctx.setLineDash(series.dash || []);
    let started = false;
    chart.rows.forEach((row) => {
      const xv = row[chart.xField];
      const yv = row[series.field];
      if (!Number.isFinite(xv) || !Number.isFinite(yv)) return;
      const x = xScale(xv);
      const y = yScale(yv);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    ctx.setLineDash([]);
  });
  ctx.restore();

  let legendX = margin.left;
  chart.series.forEach((series, index) => {
    ctx.fillStyle = series.color || chartPalette[index % chartPalette.length];
    ctx.fillRect(legendX, 34, 14, 4);
    ctx.fillStyle = "#edf0f7";
    ctx.fillText(series.label, legendX + 20, 39);
    legendX += 92;
  });
  drawHoverReadout(ctx, width, state.chartHover);
  drawZoomRectangle(ctx);
}

function drawBarChart(chart) {
  const { ctx, width, height } = fitCanvas(els.chartCanvas);
  state.chartLayout = null;
  drawChartFrame(ctx, width, height, chart.title);
  const margin = { left: 58, right: 24, top: 58, bottom: 50 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const maxValue = Math.max(1, ...chart.rows.flatMap((row) => [row.avg, row.s, row.p]));
  const yScale = (value) => margin.top + (1 - value / maxValue) * plotH;
  ctx.strokeStyle = "#4a5268";
  ctx.strokeRect(margin.left, margin.top, plotW, plotH);
  ctx.font = "11px IBM Plex Mono, monospace";
  ctx.fillStyle = "#98a0b3";
  for (let i = 0; i <= 5; i += 1) {
    const value = maxValue * i / 5;
    const y = yScale(value);
    ctx.fillText(fmt(value, 3), 12, y + 4);
    ctx.strokeStyle = "#20283a";
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(width - margin.right, y);
    ctx.stroke();
  }
  const groupW = plotW / chart.rows.length;
  chart.rows.forEach((row, index) => {
    const baseX = margin.left + index * groupW + groupW * 0.18;
    const barW = groupW * 0.16;
    [["avg", "#8b5cf6"], ["s", "#38bdf8"], ["p", "#f59e0b"]].forEach(([key, color], subIndex) => {
      const value = row[key];
      const x = baseX + subIndex * barW * 1.45;
      const y = yScale(value);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, barW, margin.top + plotH - y);
    });
    ctx.fillStyle = "#edf0f7";
    ctx.fillText(row.metric, margin.left + index * groupW + groupW * 0.35, height - 20);
  });
  ctx.fillStyle = "#8b5cf6";
  ctx.fillRect(margin.left, 36, 14, 4);
  ctx.fillStyle = "#edf0f7";
  ctx.fillText("AVG", margin.left + 20, 41);
  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(margin.left + 72, 36, 14, 4);
  ctx.fillStyle = "#edf0f7";
  ctx.fillText("S", margin.left + 92, 41);
  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(margin.left + 124, 36, 14, 4);
  ctx.fillStyle = "#edf0f7";
  ctx.fillText("P", margin.left + 144, 41);
}

function drawChart() {
  if (!state.chart) return;
  els.chartTitle.textContent = state.chart.title;
  els.pointCount.textContent = `${state.chart.rows.length} PTS`;
  els.exportCsv.disabled = !state.chart.rows.length;
  if (els.chartZoomSelect) els.chartZoomSelect.disabled = state.chart.mode !== "line";
  if (els.chartResetView) els.chartResetView.disabled = state.chart.mode !== "line" || !state.chartViewport;
  els.chartZoomSelect?.classList.toggle("active", state.zoomMode);
  if (state.chart.mode === "bar") drawBarChart(state.chart);
  else drawLineChart(state.chart);
}

function drawArrow(ctx, x1, y1, x2, y2, color, width = 2) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 10;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function materialAppearance(layer, index) {
  const material = materialByNameDb(layer.material || layer.name || "");
  const key = `${layer.material || layer.name || ""} ${material.category || ""}`.toLowerCase();
  const palette = [
    { fill: "rgba(160, 190, 230, 0.34)", stroke: "rgba(73, 116, 180, 0.72)" },
    { fill: "rgba(216, 198, 154, 0.34)", stroke: "rgba(150, 122, 61, 0.72)" },
    { fill: "rgba(178, 210, 196, 0.34)", stroke: "rgba(86, 144, 119, 0.72)" },
    { fill: "rgba(196, 180, 218, 0.34)", stroke: "rgba(128, 98, 174, 0.72)" },
  ];
  if (key.includes("au")) return { fill: "rgba(218, 184, 88, 0.46)", stroke: "rgba(156, 115, 24, 0.82)" };
  if (key.includes("cu")) return { fill: "rgba(203, 123, 82, 0.44)", stroke: "rgba(145, 68, 38, 0.82)" };
  if (key.includes("ag")) return { fill: "rgba(205, 210, 214, 0.46)", stroke: "rgba(122, 132, 142, 0.84)" };
  if (/\b(al|pt|ni|cr|ti)\b/.test(key) || key.includes("metal")) return { fill: "rgba(165, 168, 174, 0.42)", stroke: "rgba(86, 92, 104, 0.82)" };
  if (key.includes("si") || key.includes("ge") || key.includes("gaas") || key.includes("inp") || key.includes("semiconductor")) return { fill: "rgba(151, 154, 166, 0.34)", stroke: "rgba(78, 82, 98, 0.76)" };
  if (key.includes("tio") || key.includes("ta2o5") || key.includes("nb2o5") || key.includes("hfo") || key.includes("zro") || key.includes("high-index")) return { fill: "rgba(238, 224, 174, 0.36)", stroke: "rgba(176, 151, 82, 0.74)" };
  if (key.includes("mgf") || key.includes("sio") || key.includes("caf") || key.includes("fluoride") || key.includes("low-index")) return { fill: "rgba(190, 218, 244, 0.32)", stroke: "rgba(96, 142, 187, 0.72)" };
  if (key.includes("nitride") || key.includes("sin") || key.includes("aln")) return { fill: "rgba(219, 212, 164, 0.34)", stroke: "rgba(144, 132, 68, 0.74)" };
  if (key.includes("oxide") || key.includes("al2o3") || key.includes("sapphire")) return { fill: "rgba(218, 230, 246, 0.32)", stroke: "rgba(116, 148, 190, 0.72)" };
  return palette[index % palette.length];
}

function drawStack(layers) {
  const { ctx, width, height } = fitCanvas(els.stackCanvas);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#eef0f4";
  for (let x = 0; x < width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const thetaDeg = numberFrom(els.thetaDeg, 0);
  const theta = thetaDeg * Math.PI / 180;
  const wavelength = numberFrom(els.wavelength, 550);
  const lambdaS = els.splitPolarWavelength.checked ? numberFrom(els.lambdaS, wavelength) : wavelength;
  const lambdaP = els.splitPolarWavelength.checked ? numberFrom(els.lambdaP, wavelength) : wavelength;
  const result = state.lastResult;

  const stackX = Math.max(66, Math.round(width * 0.16));
  const stackW = Math.max(220, width - stackX - 28);
  const stackBaseTop = 108;
  const substrateH = 42;
  const availableLayerH = Math.max(84, height - stackBaseTop - substrateH - 30);
  const layerAreaH = Math.max(42, availableLayerH * 0.5);
  const stackTop = stackBaseTop + (availableLayerH - layerAreaH) * 0.42;
  const stackBottom = stackTop + layerAreaH + substrateH;
  const totalD = layers.reduce((sum, layer) => sum + Math.max(0, layer.d), 0);
  const targetX = stackX + stackW * 0.34;
  const targetY = stackTop;
  const rayOffset = Math.max(4, Math.sin(theta) * 92);
  const incidentStart = { x: targetX - rayOffset, y: 24 };
  const reflectEnd = { x: targetX + rayOffset, y: 24 };
  const transmitEnd = { x: targetX + rayOffset * 0.55, y: stackBottom + 18 };

  ctx.fillStyle = "rgba(245, 247, 251, 0.94)";
  ctx.fillRect(14, 12, width - 28, 80);
  ctx.strokeStyle = "#cfd5df";
  ctx.strokeRect(14, 12, width - 28, 80);
  ctx.fillStyle = "#111827";
  ctx.font = "13px IBM Plex Mono, monospace";
  ctx.fillText(`λs=${fmt(lambdaS, 6)} nm   λp=${fmt(lambdaP, 6)} nm   θ=${fmt(thetaDeg, 5)}°`, 24, 36);
  ctx.fillStyle = "#5f6675";
  ctx.fillText("INCIDENT / REFLECTED / TRANSMITTED PATH", 24, 62);
  if (result) {
    ctx.fillStyle = "#111827";
    ctx.fillText(`R=${pct(result.R_avg)}   T=${pct(result.T_avg)}   A=${pct(result.A_avg)}`, Math.max(24, width - 300), 62);
  }

  drawArrow(ctx, incidentStart.x, incidentStart.y, targetX, targetY, "#8b5cf6", 2.2);
  drawArrow(ctx, targetX, targetY, reflectEnd.x, reflectEnd.y, "#38bdf8", 2);
  drawArrow(ctx, targetX, targetY + layerAreaH + substrateH - 4, transmitEnd.x, Math.min(height - 8, transmitEnd.y), "#36d399", 2);
  ctx.fillStyle = "#8b5cf6";
  ctx.font = "12px IBM Plex Mono, monospace";
  ctx.fillText("IN", incidentStart.x - 18, incidentStart.y + 14);
  ctx.fillStyle = "#38bdf8";
  ctx.fillText(result ? `R ${pct(result.R_avg)}` : "R", reflectEnd.x + 8, reflectEnd.y + 14);
  ctx.fillStyle = "#36d399";
  ctx.fillText(result ? `T ${pct(result.T_avg)}` : "T", Math.min(width - 92, transmitEnd.x + 8), Math.min(height - 12, transmitEnd.y));

  ctx.strokeStyle = "#8b5cf6";
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(targetX, stackTop - 26);
  ctx.lineTo(targetX, stackTop + layerAreaH + substrateH);
  ctx.stroke();
  ctx.setLineDash([]);

  const minH = Math.max(8, Math.min(20, layerAreaH / Math.max(1, layers.length) * 0.85));
  let layerHeights = layers.map((layer) => (
    totalD > 0 ? Math.max(minH, layerAreaH * Math.max(0, layer.d) / totalD) : layerAreaH / Math.max(1, layers.length)
  ));
  const heightSum = layerHeights.reduce((sum, value) => sum + value, 0);
  if (heightSum > layerAreaH && heightSum > 0) {
    layerHeights = layerHeights.map((value) => value / heightSum * layerAreaH);
  }
  let y = stackTop;
  layers.forEach((layer, index) => {
    const h = layerHeights[index] || 0;
    const style = materialAppearance(layer, index);
    ctx.fillStyle = style.fill;
    ctx.fillRect(stackX, y, stackW, h);
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(stackX, y, stackW, h);
    ctx.fillStyle = "#0b0d12";
    const fontSize = Math.max(11, Math.min(20, h * 0.45));
    ctx.font = `${fontSize}px IBM Plex Mono, monospace`;
    const text = `${layerLabel(index, layers.length)} ${layer.name}  d=${fmt(layer.d, 5)}nm  n=${fmt(layer.n, 5)}  k=${fmt(layer.k, 5)}`;
    ctx.fillText(text, stackX + 12, y + Math.min(Math.max(fontSize + 4, h * 0.62), h - 5));
    y += h;
  });

  ctx.fillStyle = "rgba(226, 228, 232, 0.62)";
  ctx.fillRect(stackX, stackTop + layerAreaH, stackW, substrateH);
  ctx.strokeStyle = "rgba(92, 102, 118, 0.78)";
  ctx.lineWidth = 2;
  ctx.strokeRect(stackX, stackTop + layerAreaH, stackW, substrateH);
  ctx.fillStyle = "#0b0d12";
  ctx.font = "18px IBM Plex Mono, monospace";
  ctx.fillText(`SUBSTRATE  n=${fmt(numberFrom(els.nSub, 1.5), 6)}  k=${fmt(numberFrom(els.kSub, 0), 6)}`, stackX + 12, stackTop + layerAreaH + 31);
  ctx.lineWidth = 1;
}

function resetChartInteraction({ keepZoomMode = false } = {}) {
  state.chartHover = null;
  state.zoomDrag = null;
  if (!keepZoomMode) state.zoomMode = false;
  setChartReadout("HOVER LINE FOR X/Y");
  els.chartZoomSelect?.classList.toggle("active", state.zoomMode);
}

function setBarChartFromResult(result) {
  state.chartViewport = null;
  resetChartInteraction();
  state.chart = {
    mode: "bar",
    title: "Single Point R/T/A",
    rows: [
      { metric: "R", avg: result.R_avg, s: result.R_s, p: result.R_p },
      { metric: "T", avg: result.T_avg, s: result.T_s, p: result.T_p },
      { metric: "A", avg: result.A_avg, s: result.A_s, p: result.A_p },
    ],
  };
  drawChart();
}

function rowFromResult(xField, xValue, result) {
  return {
    [xField]: xValue,
    R_avg: result.R_avg,
    T_avg: result.T_avg,
    A_avg: result.A_avg,
    R_s: result.R_s,
    R_p: result.R_p,
    T_s: result.T_s,
    T_p: result.T_p,
    A_s: result.A_s,
    A_p: result.A_p,
  };
}

function runScan({ title, xField, xLabel, values, buildConfig }) {
  if (!values.length) {
    toast("扫描范围无效：请检查起点、终点和步长。");
    return;
  }
  if (values.length > 6000) {
    toast("扫描点数过多，建议增大步长。");
    return;
  }
  const rows = [];
  for (const value of values) {
    const config = buildConfig(value);
    const errors = validateConfig(config);
    if (errors.length) {
      toast(errors[0]);
      return;
    }
    rows.push(rowFromResult(xField, value, calculateStack(config)));
  }
  state.chartViewport = null;
  resetChartInteraction();
  state.chart = {
    mode: "line",
    title,
    rows,
    xField,
    xLabel,
    yLabel: "R / T / A",
    series: [
      { field: "R_avg", label: "R AVG", color: "#8b5cf6", width: 2.4 },
      { field: "T_avg", label: "T AVG", color: "#38bdf8", width: 2.4 },
      { field: "A_avg", label: "A AVG", color: "#f59e0b", width: 2.2 },
      { field: "R_s", label: "R S", color: "#b8c0ff", width: 1.2, dash: [5, 5] },
      { field: "R_p", label: "R P", color: "#36d399", width: 1.2, dash: [3, 5] },
    ],
  };
  drawChart();
  updateTelemetry();
  toast(`${title} 完成：${rows.length} 点。`);
}

function doSingleCalculation() {
  const current = updateTelemetry();
  if (!current) return;
  setBarChartFromResult(current.result);
  toast("单点计算完成。");
}

function doWavelengthScan() {
  const values = rangeValues(numberFrom(els.scanLamStart, 380), numberFrom(els.scanLamEnd, 780), numberFrom(els.scanLamStep, 2));
  runScan({
    title: "Wavelength Scan",
    xField: "wavelength",
    xLabel: "λ / nm",
    values,
    buildConfig: (lambda) => getConfig({ wavelength: lambda, lambdaS: lambda, lambdaP: lambda, layers: resolveLayers(lambda) }),
  });
}

function doThicknessScan() {
  const layerIndex = Number(els.scanLayer.value);
  if (!Number.isInteger(layerIndex) || !state.layers[layerIndex]) {
    toast("请先选择有效膜层。");
    return;
  }
  const values = rangeValues(numberFrom(els.scanDStart, 0), numberFrom(els.scanDEnd, 300), numberFrom(els.scanDStep, 1));
  const wavelength = numberFrom(els.wavelength, 550);
  runScan({
    title: `Thickness Scan / ${layerLabel(layerIndex)}`,
    xField: "thickness",
    xLabel: "d / nm",
    values,
    buildConfig: (d) => {
      const overrides = new Map([[layerIndex, { d }]]);
      return getConfig({ layers: resolveLayers(wavelength, overrides) });
    },
  });
}

function doAngleScan() {
  const values = rangeValues(numberFrom(els.scanThetaStart, 0), numberFrom(els.scanThetaEnd, 85), numberFrom(els.scanThetaStep, 0.5));
  runScan({
    title: "Incident Angle Scan",
    xField: "theta",
    xLabel: "θ / deg",
    values,
    buildConfig: (thetaDeg) => getConfig({ thetaDeg }),
  });
}

function serializeConfig() {
  return {
    version: 1,
    optics: {
      wavelength: numberFrom(els.wavelength, 550),
      thetaDeg: numberFrom(els.thetaDeg, 0),
      nIn: numberFrom(els.nIn, 1),
      kIn: numberFrom(els.kIn, 0),
      nSub: numberFrom(els.nSub, 1.5),
      kSub: numberFrom(els.kSub, 0),
      splitPolarWavelength: els.splitPolarWavelength.checked,
      lambdaS: numberFrom(els.lambdaS, 550),
      lambdaP: numberFrom(els.lambdaP, 550),
    },
    layers: state.layers.map(({ id, ...layer }) => layer),
    materialDb: state.customMaterials.map(({ user, builtin, ...material }) => material),
    scan: {
      lamStart: numberFrom(els.scanLamStart, 380),
      lamEnd: numberFrom(els.scanLamEnd, 780),
      lamStep: numberFrom(els.scanLamStep, 2),
      dStart: numberFrom(els.scanDStart, 0),
      dEnd: numberFrom(els.scanDEnd, 300),
      dStep: numberFrom(els.scanDStep, 1),
      thetaStart: numberFrom(els.scanThetaStart, 0),
      thetaEnd: numberFrom(els.scanThetaEnd, 85),
      thetaStep: numberFrom(els.scanThetaStep, 0.5),
    },
  };
}

function downloadBlob(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function saveConfig() {
  downloadBlob(`fresnel-config-${Date.now()}.json`, "application/json", `${JSON.stringify(serializeConfig(), null, 2)}\n`);
}

async function loadConfig(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const optics = data.optics || {};
    [
      ["wavelength", optics.wavelength],
      ["thetaDeg", optics.thetaDeg],
      ["nIn", optics.nIn],
      ["kIn", optics.kIn],
      ["nSub", optics.nSub],
      ["kSub", optics.kSub],
      ["lambdaS", optics.lambdaS],
      ["lambdaP", optics.lambdaP],
      ["scanLamStart", data.scan?.lamStart],
      ["scanLamEnd", data.scan?.lamEnd],
      ["scanLamStep", data.scan?.lamStep],
      ["scanDStart", data.scan?.dStart],
      ["scanDEnd", data.scan?.dEnd],
      ["scanDStep", data.scan?.dStep],
      ["scanThetaStart", data.scan?.thetaStart],
      ["scanThetaEnd", data.scan?.thetaEnd],
      ["scanThetaStep", data.scan?.thetaStep],
    ].forEach(([id, value]) => {
      if (value !== undefined && $(id)) $(id).value = value;
    });
    els.splitPolarWavelength.checked = Boolean(optics.splitPolarWavelength);
    els.polarWavelengths.classList.toggle("hidden", !els.splitPolarWavelength.checked);
    if (Array.isArray(data.materialDb)) {
      mergeCustomMaterials(data.materialDb);
    }
    if (Array.isArray(data.layers)) {
      state.layers = data.layers.map((layer) => ({
        id: uid(),
        name: String(layer.name || layer.material || "Custom"),
        material: String(layer.material || "Custom"),
        useDispersion: Boolean(layer.useDispersion),
        n: Number(layer.n || 1),
        k: Number(layer.k || 0),
        d: Number(layer.d || 0),
      }));
    }
    renderLayerTable();
    doSingleCalculation();
    toast("配置已载入。");
  } catch (error) {
    toast(`JSON 读取失败：${error.message}`);
  } finally {
    els.loadConfig.value = "";
  }
}

function exportCsv() {
  if (!state.chart?.rows?.length) return;
  const columns = Object.keys(state.chart.rows[0]);
  const lines = [
    columns.join(","),
    ...state.chart.rows.map((row) => columns.map((column) => JSON.stringify(row[column] ?? "")).join(",")),
  ];
  downloadBlob(`fresnel-${state.chart.title.replace(/\W+/g, "-").toLowerCase()}-${Date.now()}.csv`, "text/csv;charset=utf-8", `${lines.join("\n")}\n`);
}

function addMaterialFromInputs() {
  const material = normalizeMaterial({
    name: els.dbMatName.value,
    category: els.dbMatCategory.value,
    n: els.dbMatN.value,
    k: els.dbMatK.value,
    A: els.dbMatA.value,
    B: els.dbMatB.value,
    C: els.dbMatC.value,
  });
  if (!material) {
    toast("材料信息无效：名称不能为空，n>0，k≥0。");
    return;
  }
  mergeCustomMaterials([material]);
  fillMaterialSelect(els.materialPicker, material.name);
  els.dbMatName.value = "";
  toast(`材料 ${material.name} 已加入本地数据库。`);
}

async function importMaterialDb(file) {
  if (!file) return;
  try {
    const text = await file.text();
    let rows;
    if (/\.csv$/i.test(file.name) || file.type.includes("csv")) {
      rows = parseMaterialsCsv(text);
    } else {
      const parsed = JSON.parse(text);
      rows = Array.isArray(parsed) ? parsed : (parsed.materials || parsed.materialDb || []);
    }
    if (!Array.isArray(rows)) throw new Error("未找到 materials 数组");
    const count = mergeCustomMaterials(rows);
    toast(`材料库导入完成：有效 ${count} 条。`);
  } catch (error) {
    toast(`材料库导入失败：${error.message}`);
  } finally {
    els.importMaterialDb.value = "";
  }
}

function exportMaterialDb() {
  downloadBlob(`fresnel-material-db-${Date.now()}.json`, "application/json", `${JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    materials: state.customMaterials.map(({ user, builtin, ...material }) => material),
  }, null, 2)}\n`);
}

function clearCustomMaterials() {
  if (!state.customMaterials.length) {
    toast("当前没有自定义材料。");
    return;
  }
  if (!window.confirm("确认清空所有自定义材料？内置材料不会删除。")) return;
  state.customMaterials = [];
  saveCustomMaterialDb();
  fillMaterialSelect(els.materialPicker, "MgF2");
  renderLayerTable();
  updateTelemetry();
  toast("自定义材料已清空。");
}

function chartPointerPosition(event) {
  const rect = els.chartCanvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function clampToPlot(point) {
  const layout = state.chartLayout;
  if (!layout) return point;
  return {
    x: Math.min(layout.margin.left + layout.plotW, Math.max(layout.margin.left, point.x)),
    y: Math.min(layout.margin.top + layout.plotH, Math.max(layout.margin.top, point.y)),
  };
}

function findNearestChartPoint(point) {
  if (!state.chart || state.chart.mode !== "line" || !state.chartLayout) return null;
  let nearest = null;
  const maxDist = 16;
  for (const [seriesIndex, series] of state.chart.series.entries()) {
    const color = series.color || chartPalette[seriesIndex % chartPalette.length];
    for (const row of state.chart.rows) {
      const xValue = row[state.chart.xField];
      const yValue = row[series.field];
      if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) continue;
      const px = state.chartLayout.xScale(xValue);
      const py = state.chartLayout.yScale(yValue);
      if (!inPlotArea(px, py)) continue;
      const distance = Math.hypot(point.x - px, point.y - py);
      if (distance <= maxDist && (!nearest || distance < nearest.distance)) {
        nearest = {
          distance,
          px,
          py,
          xValue,
          yValue,
          label: series.label,
          color,
        };
      }
    }
  }
  return nearest;
}

function bindChartTools() {
  els.chartZoomSelect?.addEventListener("click", () => {
    state.zoomMode = !state.zoomMode;
    state.zoomDrag = null;
    state.chartHover = null;
    setChartReadout(state.zoomMode ? "DRAG ON CHART TO ZOOM" : "HOVER LINE FOR X/Y");
    drawChart();
  });

  els.chartResetView?.addEventListener("click", () => {
    state.chartViewport = null;
    resetChartInteraction();
    drawChart();
    toast("图表视图已恢复。");
  });

  els.chartCanvas.addEventListener("mousedown", (event) => {
    if (!state.zoomMode || state.chart?.mode !== "line" || !state.chartLayout) return;
    const rawPoint = chartPointerPosition(event);
    if (!inPlotArea(rawPoint.x, rawPoint.y)) return;
    const point = clampToPlot(rawPoint);
    state.zoomDrag = { start: point, current: point };
    state.chartHover = null;
    drawChart();
  });

  els.chartCanvas.addEventListener("mousemove", (event) => {
    const point = chartPointerPosition(event);
    if (state.zoomDrag && state.chartLayout) {
      state.zoomDrag.current = clampToPlot(point);
      drawChart();
      return;
    }
    if (state.zoomMode) {
      setChartReadout("DRAG ON CHART TO ZOOM");
      return;
    }
    const hover = findNearestChartPoint(point);
    if (hover) {
      state.chartHover = hover;
      setChartReadout(`${hover.label}  X=${fmt(hover.xValue, 6)}  Y=${fmt(hover.yValue, 6)}`);
    } else {
      state.chartHover = null;
      setChartReadout("HOVER LINE FOR X/Y");
    }
    drawChart();
  });

  els.chartCanvas.addEventListener("mouseleave", () => {
    if (state.zoomDrag) return;
    state.chartHover = null;
    setChartReadout(state.zoomMode ? "DRAG ON CHART TO ZOOM" : "HOVER LINE FOR X/Y");
    drawChart();
  });

  window.addEventListener("mouseup", () => {
    if (!state.zoomDrag || !state.chartLayout) return;
    const { start, current } = state.zoomDrag;
    const w = Math.abs(current.x - start.x);
    const h = Math.abs(current.y - start.y);
    if (w > 12 && h > 12) {
      const xA = state.chartLayout.xInvert(start.x);
      const xB = state.chartLayout.xInvert(current.x);
      const yA = state.chartLayout.yInvert(start.y);
      const yB = state.chartLayout.yInvert(current.y);
      state.chartViewport = {
        xMin: Math.min(xA, xB),
        xMax: Math.max(xA, xB),
        yMin: Math.min(yA, yB),
        yMax: Math.max(yA, yB),
      };
      toast("图表已局部放大。");
    }
    resetChartInteraction();
    drawChart();
  });
}

function bindEvents() {
  loadCustomMaterialDb();
  fillMaterialSelect(els.materialPicker, "MgF2");
  bindChartTools();
  const inputIds = ["wavelength", "thetaDeg", "nIn", "kIn", "nSub", "kSub", "lambdaS", "lambdaP"];
  inputIds.forEach((id) => $(id).addEventListener("input", () => {
    if (id === "wavelength" && !els.splitPolarWavelength.checked) {
      els.lambdaS.value = els.wavelength.value;
      els.lambdaP.value = els.wavelength.value;
      renderLayerTable();
    }
    updateTelemetry();
  }));
  els.splitPolarWavelength.addEventListener("change", () => {
    els.polarWavelengths.classList.toggle("hidden", !els.splitPolarWavelength.checked);
    if (!els.splitPolarWavelength.checked) {
      els.lambdaS.value = els.wavelength.value;
      els.lambdaP.value = els.wavelength.value;
    }
    updateTelemetry();
  });
  els.addMaterial.addEventListener("click", () => addLayer(els.materialPicker.value));
  els.addCustom.addEventListener("click", () => addLayer("Custom"));
  els.addMaterialToDb.addEventListener("click", addMaterialFromInputs);
  els.importMaterialDb.addEventListener("change", (event) => importMaterialDb(event.target.files?.[0]));
  els.exportMaterialDb.addEventListener("click", exportMaterialDb);
  els.clearCustomMaterials.addEventListener("click", clearCustomMaterials);
  els.singleCalc.addEventListener("click", doSingleCalculation);
  els.wavelengthScan.addEventListener("click", doWavelengthScan);
  els.thicknessScan.addEventListener("click", doThicknessScan);
  els.angleScan.addEventListener("click", doAngleScan);
  els.saveConfig.addEventListener("click", saveConfig);
  els.loadConfig.addEventListener("change", (event) => loadConfig(event.target.files?.[0]));
  els.exportCsv.addEventListener("click", exportCsv);

  els.layerTable.addEventListener("input", (event) => {
    const row = event.target.closest(".layer-row");
    if (!row) return;
    const layer = state.layers.find((item) => item.id === row.dataset.id);
    if (!layer) return;
    const field = event.target.dataset.field;
    if (field === "name") layer.name = event.target.value;
    if (field === "n" && !event.target.readOnly) layer.n = Number(event.target.value);
    if (field === "k" && !event.target.readOnly) layer.k = Number(event.target.value);
    if (field === "d") layer.d = Number(event.target.value);
    updateTelemetry();
  });

  els.layerTable.addEventListener("change", (event) => {
    const row = event.target.closest(".layer-row");
    if (!row) return;
    const layer = state.layers.find((item) => item.id === row.dataset.id);
    if (!layer) return;
    const field = event.target.dataset.field;
    if (field === "material") {
      layer.material = event.target.value;
      layer.name = event.target.value;
      layer.useDispersion = Boolean(materialByNameDb(layer.material).cauchy);
      const nk = materialAtCurrentWavelength(layer.material, layer.useDispersion);
      layer.n = nk.n;
      layer.k = nk.k;
      renderLayerTable();
    }
    if (field === "useDispersion") {
      layer.useDispersion = event.target.checked;
      const nk = materialAtCurrentWavelength(layer.material, layer.useDispersion);
      layer.n = nk.n;
      layer.k = nk.k;
      renderLayerTable();
    }
    updateTelemetry();
  });

  els.layerTable.addEventListener("click", (event) => {
    const action = event.target.dataset.action;
    if (!action) return;
    const row = event.target.closest(".layer-row");
    const index = state.layers.findIndex((item) => item.id === row?.dataset.id);
    if (index < 0) return;
    if (action === "delete") state.layers.splice(index, 1);
    if (action === "up" && index > 0) [state.layers[index - 1], state.layers[index]] = [state.layers[index], state.layers[index - 1]];
    if (action === "down" && index < state.layers.length - 1) [state.layers[index + 1], state.layers[index]] = [state.layers[index], state.layers[index + 1]];
    renderLayerTable();
    updateTelemetry();
  });

  window.addEventListener("resize", () => {
    drawChart();
    const config = getConfig();
    drawStack(config.layers);
  });
}

bindEvents();
renderLayerTable();
const initial = updateTelemetry();
if (initial) setBarChartFromResult(initial.result);
