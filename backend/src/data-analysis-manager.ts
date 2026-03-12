/**
 * Data Analysis Manager: parses uploaded files, infers schemas,
 * stores analyses in memory, and prepares chart-ready data.
 */

import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { v4 as uuid } from "uuid";
import type {
  DatasetSchema,
  ColumnInfo,
  ChartConfig,
  ChartType,
} from "@my-ai-console/shared";

interface StoredAnalysis {
  id: string;
  fileName: string;
  fileType: "csv" | "xlsx" | "txt";
  schema: DatasetSchema;
  rows: Record<string, unknown>[];
  createdAt: number;
}

const analyses = new Map<string, StoredAnalysis>();
const MAX_ANALYSES = 10;

// ─── File parsing ───────────────────────────────────────────────

export function parseUploadedFile(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): StoredAnalysis {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  let rows: Record<string, unknown>[];
  let fileType: "csv" | "xlsx" | "txt";

  if (ext === "xlsx" || ext === "xls") {
    rows = parseExcel(buffer);
    fileType = "xlsx";
  } else if (ext === "csv") {
    rows = parseCsv(buffer);
    fileType = "csv";
  } else {
    rows = parseTxt(buffer);
    fileType = "txt";
  }

  // Rename duplicate / empty column headers
  if (rows.length > 0) {
    rows = normalizeColumnNames(rows);
  }

  const schema = buildSchema(rows, fileName, fileType, buffer.length);

  const analysis: StoredAnalysis = {
    id: uuid(),
    fileName,
    fileType,
    schema,
    rows,
    createdAt: Date.now(),
  };

  // Evict oldest if at capacity
  if (analyses.size >= MAX_ANALYSES) {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [id, a] of analyses) {
      if (a.createdAt < oldestTime) {
        oldestTime = a.createdAt;
        oldest = id;
      }
    }
    if (oldest) analyses.delete(oldest);
  }

  analyses.set(analysis.id, analysis);
  return analysis;
}

function parseCsv(buffer: Buffer): Record<string, unknown>[] {
  const content = buffer.toString("utf-8");
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    cast: true,
    trim: true,
    relax_column_count: true,
  });
}

function parseExcel(buffer: Buffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return [];
  const sheet = workbook.Sheets[firstSheet];
  return XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];
}

function parseTxt(buffer: Buffer): Record<string, unknown>[] {
  const content = buffer.toString("utf-8");
  // Auto-detect delimiter: tab, comma, semicolon, or multi-space
  const firstLine = content.split("\n")[0] ?? "";
  let delimiter: string;
  let useFixedWidth = false;

  if (firstLine.includes("\t")) delimiter = "\t";
  else if (firstLine.includes(",")) delimiter = ",";
  else if (firstLine.includes(";")) delimiter = ";";
  else if (/\s{2,}/.test(firstLine)) {
    // Multi-space delimited: pre-process lines to convert to tab-delimited
    useFixedWidth = true;
    delimiter = "\t";
  } else {
    delimiter = ",";
  }

  const input = useFixedWidth
    ? content
        .split("\n")
        .map((line) => line.trim().replace(/\s{2,}/g, "\t"))
        .join("\n")
    : content;

  return parse(input, {
    columns: true,
    skip_empty_lines: true,
    cast: true,
    trim: true,
    delimiter,
    relax_column_count: true,
  });
}

function normalizeColumnNames(
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  if (rows.length === 0) return rows;
  const originalKeys = Object.keys(rows[0]);
  const seen = new Map<string, number>();
  const renames = new Map<string, string>();

  for (const key of originalKeys) {
    const normalized = key.trim() || `열`;
    const count = seen.get(normalized) ?? 0;
    seen.set(normalized, count + 1);
    if (count > 0) {
      renames.set(key, `${normalized}_${count + 1}`);
    } else if (key.trim() === "") {
      renames.set(key, `열${seen.size}`);
    }
  }

  if (renames.size === 0) return rows;

  return rows.map((row) => {
    const newRow: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      newRow[renames.get(key) ?? key] = value;
    }
    return newRow;
  });
}

// ─── Schema inference ───────────────────────────────────────────

function buildSchema(
  rows: Record<string, unknown>[],
  fileName: string,
  fileType: "csv" | "xlsx" | "txt",
  fileSizeBytes: number
): DatasetSchema {
  if (rows.length === 0) {
    return {
      columns: [],
      rowCount: 0,
      fileSizeBytes,
      fileName,
      fileType,
    };
  }

  const columnNames = Object.keys(rows[0]);
  const sampleSize = Math.min(rows.length, 100);
  const sampleRows = rows.slice(0, sampleSize);

  const columns: ColumnInfo[] = columnNames.map((name) => {
    const values = sampleRows.map((r) => r[name]);
    const nullCount = values.filter(
      (v) => v === null || v === undefined || v === ""
    ).length;
    const nonNullValues = values.filter(
      (v) => v !== null && v !== undefined && v !== ""
    );
    const uniqueValues = new Set(nonNullValues.map(String));

    return {
      name,
      inferredType: inferType(nonNullValues),
      sampleValues: Array.from(uniqueValues).slice(0, 5),
      nullCount,
      uniqueCount: uniqueValues.size,
    };
  });

  return {
    columns,
    rowCount: rows.length,
    fileSizeBytes,
    fileName,
    fileType,
  };
}

function inferType(
  values: unknown[]
): "number" | "string" | "date" | "boolean" {
  if (values.length === 0) return "string";

  let numCount = 0;
  let dateCount = 0;
  let boolCount = 0;

  for (const v of values) {
    if (typeof v === "number" || (typeof v === "string" && isNumeric(v))) {
      numCount++;
    } else if (typeof v === "boolean" || isBooleanString(v)) {
      boolCount++;
    } else if (isDateLike(v)) {
      dateCount++;
    }
  }

  const threshold = values.length * 0.7;
  if (numCount >= threshold) return "number";
  if (dateCount >= threshold) return "date";
  if (boolCount >= threshold) return "boolean";
  return "string";
}

function isNumeric(v: unknown): boolean {
  if (typeof v === "number") return true;
  if (typeof v !== "string") return false;
  const s = v.trim().replace(/,/g, "");
  return s !== "" && !isNaN(Number(s));
}

function isBooleanString(v: unknown): boolean {
  if (typeof v === "boolean") return true;
  if (typeof v !== "string") return false;
  return ["true", "false", "yes", "no", "1", "0"].includes(v.toLowerCase());
}

function isDateLike(v: unknown): boolean {
  if (v instanceof Date) return true;
  if (typeof v !== "string") return false;
  // ISO 8601, YYYY-MM-DD, YYYY/MM/DD, MM/DD/YYYY patterns
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(v)) return true;
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(v)) return true;
  const d = new Date(v);
  return !isNaN(d.getTime()) && v.length > 4;
}

// ─── Analysis access ────────────────────────────────────────────

export function getAnalysis(analysisId: string): StoredAnalysis | null {
  return analyses.get(analysisId) ?? null;
}

export function getPreviewRows(
  analysisId: string,
  limit = 100
): Record<string, unknown>[] {
  const analysis = analyses.get(analysisId);
  if (!analysis) return [];
  return analysis.rows.slice(0, limit);
}

// ─── Axis info from AI analysis ─────────────────────────────────

interface AxisInfo {
  columnDescriptions: Record<string, string>;
  statistics: Record<string, { mean?: number; median?: number; min?: number; max?: number; stddev?: number }>;
}

function buildAxisTitle(
  colName: string | null,
  axisInfo: AxisInfo
): { text: string; font: { color: string; size: number } } {
  if (!colName) return { text: "", font: { color: "#8b949e", size: 12 } };

  const desc = axisInfo.columnDescriptions[colName];
  const stats = axisInfo.statistics[colName];

  let title = colName;
  if (desc) {
    title += `  (${desc})`;
  }
  if (stats) {
    const parts: string[] = [];
    if (stats.min != null && stats.max != null) {
      parts.push(`범위: ${formatNum(stats.min)}~${formatNum(stats.max)}`);
    }
    if (stats.mean != null) {
      parts.push(`평균: ${formatNum(stats.mean)}`);
    }
    if (parts.length > 0) {
      title += `<br><sub style="color:#8b949e">${parts.join(" | ")}</sub>`;
    }
  }

  return { text: title, font: { color: "#e6edf3", size: 12 } };
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toFixed(2);
}

// ─── Chart data preparation ────────────────────────────────────

export function prepareChartData(
  analysisId: string,
  config: ChartConfig,
  axisInfo: AxisInfo = { columnDescriptions: {}, statistics: {} }
): { data: unknown[]; layout: Record<string, unknown> } {
  const analysis = analyses.get(analysisId);
  if (!analysis) throw new Error("Analysis not found");

  const rows = analysis.rows;

  // Build rich axis titles with AI descriptions + statistics
  const xTitle = buildAxisTitle(config.xAxis, axisInfo);
  const yTitle = buildAxisTitle(config.yAxis, axisInfo);

  const darkLayout: Record<string, unknown> = {
    paper_bgcolor: "#0d1117",
    plot_bgcolor: "#161b22",
    font: { color: "#e6edf3", size: 12 },
    margin: { t: 50, r: 30, b: 90, l: 90 },
    xaxis: {
      gridcolor: "#21262d",
      zerolinecolor: "#30363d",
      title: xTitle,
      tickfont: { color: "#8b949e", size: 10 },
      linecolor: "#30363d",
      mirror: true,
    },
    yaxis: {
      gridcolor: "#21262d",
      zerolinecolor: "#30363d",
      title: yTitle,
      tickfont: { color: "#8b949e", size: 10 },
      linecolor: "#30363d",
      mirror: true,
    },
    colorway: [
      "#58a6ff",
      "#3fb950",
      "#f85149",
      "#d29922",
      "#bc8cff",
      "#f778ba",
      "#79c0ff",
      "#56d364",
    ],
    showlegend: true,
    legend: { font: { color: "#8b949e" }, bgcolor: "rgba(13,17,23,0.8)" },
  };

  switch (config.chartType) {
    case "line":
      return buildLineChart(rows, config, darkLayout, axisInfo);
    case "bar":
      return buildBarChart(rows, config, darkLayout, axisInfo);
    case "scatter":
      return buildScatterChart(rows, config, darkLayout, axisInfo);
    case "histogram":
      return buildHistogramChart(rows, config, darkLayout, axisInfo);
    case "pie":
      return buildPieChart(rows, config, darkLayout, axisInfo);
    case "heatmap":
      return buildHeatmapChart(rows, config, darkLayout, axisInfo);
    case "box":
      return buildBoxChart(rows, config, darkLayout, axisInfo);
    case "violin":
      return buildViolinChart(rows, config, darkLayout, axisInfo);
    case "regression":
      return buildRegressionChart(rows, config, darkLayout, axisInfo);
    case "correlation":
      return buildCorrelationChart(rows, config, darkLayout, axisInfo);
    case "scatter3d":
      return buildScatter3dChart(rows, config, darkLayout, axisInfo);
    default:
      return buildScatterChart(rows, config, darkLayout, axisInfo);
  }
}

// ─── Chart builders ─────────────────────────────────────────────

function extractColumn(
  rows: Record<string, unknown>[],
  col: string | null
): unknown[] {
  if (!col) return [];
  return rows.map((r) => r[col] ?? null);
}

function toNumbers(values: unknown[]): number[] {
  return values.map((v) => {
    if (typeof v === "number") return v;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  });
}

function buildLineChart(
  rows: Record<string, unknown>[],
  config: ChartConfig,
  layout: Record<string, unknown>,
  _axisInfo: AxisInfo
) {
  const x = extractColumn(rows, config.xAxis);
  const y = toNumbers(extractColumn(rows, config.yAxis));
  const xDesc = _axisInfo.columnDescriptions[config.xAxis ?? ""];
  const yDesc = _axisInfo.columnDescriptions[config.yAxis ?? ""];
  const titleParts = [config.yAxis ?? "데이터"];
  if (yDesc) titleParts.push(`(${yDesc})`);
  titleParts.push("추이");

  return {
    data: [
      {
        type: "scatter",
        mode: "lines+markers",
        x,
        y,
        name: config.yAxis ?? "데이터",
        marker: { size: 4 },
        line: { width: 2 },
        hovertemplate: `${config.xAxis ?? "X"}: %{x}<br>${config.yAxis ?? "Y"}: %{y}<extra></extra>`,
      },
    ],
    layout: { ...layout, title: titleParts.join(" ") },
  };
}

function buildBarChart(
  rows: Record<string, unknown>[],
  config: ChartConfig,
  layout: Record<string, unknown>,
  _axisInfo: AxisInfo
) {
  const x = extractColumn(rows, config.xAxis);
  const y = toNumbers(extractColumn(rows, config.yAxis));
  const aggLabels: Record<string, string> = { sum: "합계", mean: "평균", count: "개수", median: "중앙값" };

  if (config.aggregation !== "none" && config.xAxis) {
    const grouped = groupAndAggregate(rows, config.xAxis, config.yAxis, config.aggregation);
    const aggLabel = aggLabels[config.aggregation] ?? config.aggregation;
    return {
      data: [
        {
          type: "bar",
          x: grouped.labels,
          y: grouped.values,
          name: config.yAxis ?? "데이터",
          hovertemplate: `%{x}<br>${config.yAxis} ${aggLabel}: %{y}<extra></extra>`,
        },
      ],
      layout: { ...layout, title: `${config.yAxis} — ${aggLabel} 기준` },
    };
  }

  return {
    data: [{
      type: "bar", x, y, name: config.yAxis ?? "데이터",
      hovertemplate: `${config.xAxis ?? "X"}: %{x}<br>${config.yAxis ?? "Y"}: %{y}<extra></extra>`,
    }],
    layout: { ...layout, title: `${config.yAxis} 막대 차트` },
  };
}

function buildScatterChart(
  rows: Record<string, unknown>[],
  config: ChartConfig,
  layout: Record<string, unknown>,
  _axisInfo: AxisInfo
) {
  const x = toNumbers(extractColumn(rows, config.xAxis));
  const y = toNumbers(extractColumn(rows, config.yAxis));
  const marker: Record<string, unknown> = { size: 6, opacity: 0.7 };

  if (config.colorBy) {
    const colorDesc = _axisInfo.columnDescriptions[config.colorBy];
    marker.color = extractColumn(rows, config.colorBy);
    marker.colorscale = "Viridis";
    marker.showscale = true;
    marker.colorbar = {
      title: { text: colorDesc ? `${config.colorBy}\n(${colorDesc})` : config.colorBy, font: { color: "#8b949e", size: 10 } },
      tickfont: { color: "#8b949e", size: 9 },
    };
  }
  if (config.sizeBy) {
    marker.size = toNumbers(extractColumn(rows, config.sizeBy));
    marker.sizemode = "area";
    marker.sizeref = 0.1;
  }

  return {
    data: [{
      type: "scatter", mode: "markers", x, y, marker,
      hovertemplate: `${config.xAxis}: %{x}<br>${config.yAxis}: %{y}<extra></extra>`,
    }],
    layout: { ...layout, title: `${config.xAxis} vs ${config.yAxis}` },
  };
}

function buildHistogramChart(
  rows: Record<string, unknown>[],
  config: ChartConfig,
  layout: Record<string, unknown>,
  _axisInfo: AxisInfo
) {
  const x = toNumbers(extractColumn(rows, config.xAxis));
  const xDesc = _axisInfo.columnDescriptions[config.xAxis ?? ""];
  const yAxisObj = (layout.yaxis as Record<string, unknown>) ?? {};

  return {
    data: [{
      type: "histogram", x, name: config.xAxis ?? "데이터",
      hovertemplate: `${config.xAxis}: %{x}<br>빈도: %{y}<extra></extra>`,
    }],
    layout: {
      ...layout,
      title: xDesc ? `${config.xAxis} 분포 (${xDesc})` : `${config.xAxis} 분포`,
      yaxis: {
        ...yAxisObj,
        title: { text: "빈도 (Count)", font: { color: "#e6edf3", size: 12 } },
        tickfont: { color: "#8b949e", size: 10 },
        gridcolor: "#21262d",
        zerolinecolor: "#30363d",
      },
    },
  };
}

function buildPieChart(
  rows: Record<string, unknown>[],
  config: ChartConfig,
  layout: Record<string, unknown>,
  _axisInfo: AxisInfo
) {
  const labels = extractColumn(rows, config.xAxis).map(String);
  const valueCounts = new Map<string, number>();
  for (const label of labels) {
    valueCounts.set(label, (valueCounts.get(label) ?? 0) + 1);
  }
  const xDesc = _axisInfo.columnDescriptions[config.xAxis ?? ""];

  return {
    data: [
      {
        type: "pie",
        labels: Array.from(valueCounts.keys()),
        values: Array.from(valueCounts.values()),
        hole: 0.3,
        textfont: { color: "#e6edf3" },
        hovertemplate: `%{label}<br>개수: %{value}<br>비율: %{percent}<extra></extra>`,
      },
    ],
    layout: {
      ...layout,
      title: xDesc ? `${config.xAxis} 비율 (${xDesc})` : `${config.xAxis} 비율`,
      annotations: [{
        text: `총 ${rows.length}건`,
        showarrow: false,
        font: { size: 11, color: "#8b949e" },
      }],
    },
  };
}

function buildHeatmapChart(
  rows: Record<string, unknown>[],
  config: ChartConfig,
  layout: Record<string, unknown>,
  _axisInfo: AxisInfo
) {
  // Build a pivot table: xAxis categories as columns, yAxis values
  const numericCols = Object.keys(rows[0] ?? {}).filter((col) => {
    const sample = rows.slice(0, 10).map((r) => r[col]);
    return sample.some((v) => typeof v === "number");
  });

  const z = numericCols.map((col) => toNumbers(extractColumn(rows, col)));
  const x = numericCols;
  const y = rows.slice(0, 50).map((_, i) => `행 ${i + 1}`);

  return {
    data: [
      {
        type: "heatmap",
        z: z[0]
          ? z.map((col) => col.slice(0, 50))
          : [[0]],
        x: y,
        y: x,
        colorscale: "Viridis",
      },
    ],
    layout: { ...layout, title: "히트맵" },
  };
}

function buildBoxChart(
  rows: Record<string, unknown>[],
  config: ChartConfig,
  layout: Record<string, unknown>,
  _axisInfo: AxisInfo
) {
  const y = toNumbers(extractColumn(rows, config.yAxis));
  const yDesc = _axisInfo.columnDescriptions[config.yAxis ?? ""];
  const titleSuffix = yDesc ? ` (${yDesc})` : "";

  const data: unknown[] = [
    { type: "box", y, name: config.yAxis ?? "데이터", boxpoints: "outliers" },
  ];

  if (config.colorBy) {
    const groups = extractColumn(rows, config.colorBy).map(String);
    const groupSet = [...new Set(groups)];
    const colorDesc = _axisInfo.columnDescriptions[config.colorBy] ?? "";
    const groupedData = groupSet.map((g) => ({
      type: "box",
      y: y.filter((_, i) => groups[i] === g),
      name: g,
      boxpoints: "outliers",
    }));
    return {
      data: groupedData,
      layout: {
        ...layout,
        title: `${config.yAxis}${titleSuffix} 박스 플롯`,
        xaxis: {
          ...((layout.xaxis as object) ?? {}),
          title: { text: colorDesc ? `${config.colorBy} (${colorDesc})` : config.colorBy, font: { color: "#e6edf3", size: 12 } },
        },
      },
    };
  }

  return {
    data,
    layout: { ...layout, title: `${config.yAxis}${titleSuffix} 박스 플롯` },
  };
}

function buildViolinChart(
  rows: Record<string, unknown>[],
  config: ChartConfig,
  layout: Record<string, unknown>,
  _axisInfo: AxisInfo
) {
  const y = toNumbers(extractColumn(rows, config.yAxis));
  const yDesc = _axisInfo.columnDescriptions[config.yAxis ?? ""];
  const titleSuffix = yDesc ? ` (${yDesc})` : "";

  if (config.colorBy) {
    const groups = extractColumn(rows, config.colorBy).map(String);
    const groupSet = [...new Set(groups)];
    const groupedData = groupSet.map((g) => ({
      type: "violin",
      y: y.filter((_, i) => groups[i] === g),
      name: g,
      box: { visible: true },
      meanline: { visible: true },
    }));
    return {
      data: groupedData,
      layout: { ...layout, title: `${config.yAxis}${titleSuffix} 바이올린 플롯` },
    };
  }

  return {
    data: [
      {
        type: "violin",
        y,
        name: config.yAxis ?? "데이터",
        box: { visible: true },
        meanline: { visible: true },
      },
    ],
    layout: { ...layout, title: `${config.yAxis} 바이올린 플롯` },
  };
}

function buildRegressionChart(
  rows: Record<string, unknown>[],
  config: ChartConfig,
  layout: Record<string, unknown>,
  _axisInfo: AxisInfo
) {
  const x = toNumbers(extractColumn(rows, config.xAxis));
  const y = toNumbers(extractColumn(rows, config.yAxis));

  // Simple linear regression
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, xi, i) => a + xi * y[i], 0);
  const sumX2 = x.reduce((a, xi) => a + xi * xi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const xSorted = [...x].sort((a, b) => a - b);
  const regrLine = xSorted.map((xi) => slope * xi + intercept);

  // R² calculation
  const yMean = sumY / n;
  const ssTot = y.reduce((a, yi) => a + (yi - yMean) ** 2, 0);
  const ssRes = y.reduce((a, yi, i) => a + (yi - (slope * x[i] + intercept)) ** 2, 0);
  const r2 = 1 - ssRes / ssTot;

  return {
    data: [
      { type: "scatter", mode: "markers", x, y, name: "데이터", marker: { size: 6, opacity: 0.6 } },
      {
        type: "scatter",
        mode: "lines",
        x: xSorted,
        y: regrLine,
        name: `회귀선 (R²=${r2.toFixed(3)})`,
        line: { color: "#f85149", width: 2 },
      },
    ],
    layout: { ...layout, title: `${config.xAxis} vs ${config.yAxis} (회귀 분석)` },
  };
}

function buildCorrelationChart(
  rows: Record<string, unknown>[],
  _config: ChartConfig,
  layout: Record<string, unknown>,
  _axisInfo: AxisInfo
) {
  // Build correlation matrix for all numeric columns
  const numericCols = Object.keys(rows[0] ?? {}).filter((col) => {
    const vals = rows.slice(0, 20).map((r) => r[col]);
    return vals.some((v) => typeof v === "number" || (typeof v === "string" && isNumeric(v)));
  });

  const data: number[][] = numericCols.map((col) =>
    toNumbers(extractColumn(rows, col))
  );

  const n = numericCols.length;
  const corrMatrix: number[][] = Array.from({ length: n }, () =>
    Array(n).fill(0)
  );

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      corrMatrix[i][j] = pearsonCorr(data[i], data[j]);
    }
  }

  return {
    data: [
      {
        type: "heatmap",
        z: corrMatrix,
        x: numericCols,
        y: numericCols,
        colorscale: "RdBu",
        zmin: -1,
        zmax: 1,
        text: corrMatrix.map((row) => row.map((v) => v.toFixed(2))),
        texttemplate: "%{text}",
        textfont: { color: "#e6edf3" },
      },
    ],
    layout: { ...layout, title: "상관 행렬" },
  };
}

function buildScatter3dChart(
  rows: Record<string, unknown>[],
  config: ChartConfig,
  layout: Record<string, unknown>,
  _axisInfo: AxisInfo
) {
  const x = toNumbers(extractColumn(rows, config.xAxis));
  const y = toNumbers(extractColumn(rows, config.yAxis));
  const zCol = config.colorBy;
  const z = zCol
    ? toNumbers(extractColumn(rows, zCol))
    : x.map((_, i) => i);

  const xDesc = _axisInfo.columnDescriptions[config.xAxis ?? ""];
  const yDesc = _axisInfo.columnDescriptions[config.yAxis ?? ""];
  const zDesc = zCol ? _axisInfo.columnDescriptions[zCol] : undefined;

  const axisStyle = { gridcolor: "#21262d", backgroundcolor: "#161b22", showbackground: true };

  return {
    data: [
      {
        type: "scatter3d",
        mode: "markers",
        x,
        y,
        z,
        marker: { size: 3, opacity: 0.7, color: z, colorscale: "Viridis", showscale: true,
          colorbar: { title: { text: zCol ?? "Z", font: { color: "#8b949e", size: 10 } }, tickfont: { color: "#8b949e", size: 9 } },
        },
        hovertemplate: `${config.xAxis}: %{x}<br>${config.yAxis}: %{y}<br>${zCol ?? "Z"}: %{z}<extra></extra>`,
      },
    ],
    layout: {
      ...layout,
      title: "3D 산점도",
      scene: {
        xaxis: { ...axisStyle, title: { text: xDesc ? `${config.xAxis}\n(${xDesc})` : (config.xAxis ?? "X"), font: { color: "#e6edf3", size: 11 } } },
        yaxis: { ...axisStyle, title: { text: yDesc ? `${config.yAxis}\n(${yDesc})` : (config.yAxis ?? "Y"), font: { color: "#e6edf3", size: 11 } } },
        zaxis: { ...axisStyle, title: { text: zDesc ? `${zCol}\n(${zDesc})` : (zCol ?? "Z"), font: { color: "#e6edf3", size: 11 } } },
        bgcolor: "#161b22",
      },
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function pearsonCorr(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n === 0) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? 0 : num / denom;
}

function groupAndAggregate(
  rows: Record<string, unknown>[],
  groupCol: string,
  valueCol: string | null,
  agg: "sum" | "mean" | "count" | "median"
): { labels: string[]; values: number[] } {
  if (!valueCol) return { labels: [], values: [] };

  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const key = String(row[groupCol] ?? "");
    const val = Number(row[valueCol] ?? 0);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(isNaN(val) ? 0 : val);
  }

  const labels: string[] = [];
  const values: number[] = [];

  for (const [label, vals] of groups) {
    labels.push(label);
    switch (agg) {
      case "sum":
        values.push(vals.reduce((a, b) => a + b, 0));
        break;
      case "mean":
        values.push(vals.reduce((a, b) => a + b, 0) / vals.length);
        break;
      case "count":
        values.push(vals.length);
        break;
      case "median": {
        const sorted = [...vals].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        values.push(
          sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid]
        );
        break;
      }
    }
  }

  return { labels, values };
}
