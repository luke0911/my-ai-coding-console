/**
 * Data analysis event types and shared interfaces.
 */

// ─── Domain types ───────────────────────────────────────────────

export type ChartType =
  | "line"
  | "bar"
  | "scatter"
  | "histogram"
  | "pie"
  | "heatmap"
  | "box"
  | "violin"
  | "regression"
  | "correlation"
  | "scatter3d";

export interface ColumnInfo {
  name: string;
  inferredType: "number" | "string" | "date" | "boolean";
  sampleValues: string[];
  nullCount: number;
  uniqueCount: number;
}

export interface DatasetSchema {
  columns: ColumnInfo[];
  rowCount: number;
  fileSizeBytes: number;
  fileName: string;
  fileType: "csv" | "xlsx" | "txt";
}

export interface ColumnStatistics {
  mean?: number;
  median?: number;
  min?: number;
  max?: number;
  stddev?: number;
  mode?: string;
}

export interface ChartSuggestion {
  chartType: ChartType;
  reason: string;
  xAxis: string;
  yAxis: string;
  priority: number;
}

export interface AiAnalysisResult {
  columnDescriptions: Record<string, string>;
  statistics: Record<string, ColumnStatistics>;
  suggestedCharts: ChartSuggestion[];
  dataQualityNotes: string[];
}

export interface ChartConfig {
  chartType: ChartType;
  xAxis: string | null;
  yAxis: string | null;
  colorBy: string | null;
  sizeBy: string | null;
  aggregation: "none" | "sum" | "mean" | "count" | "median";
}

// ─── Analysis events ────────────────────────────────────────────

export interface AnalysisUploadCompleteEvent {
  type: "analysis:upload:complete";
  analysisId: string;
  timestamp: number;
  schema: DatasetSchema;
  preview: Record<string, unknown>[];
}

export interface AnalysisAiThinkingEvent {
  type: "analysis:ai:thinking";
  analysisId: string;
  timestamp: number;
}

export interface AnalysisAiResultEvent {
  type: "analysis:ai:result";
  analysisId: string;
  timestamp: number;
  result: AiAnalysisResult;
}

export interface AnalysisChartReadyEvent {
  type: "analysis:chart:ready";
  analysisId: string;
  timestamp: number;
  chartData: unknown;
  chartLayout: unknown;
}

export interface AnalysisErrorEvent {
  type: "analysis:error";
  analysisId: string;
  timestamp: number;
  error: string;
  phase: "upload" | "parse" | "ai" | "chart";
}

export type AnalysisEvent =
  | AnalysisUploadCompleteEvent
  | AnalysisAiThinkingEvent
  | AnalysisAiResultEvent
  | AnalysisChartReadyEvent
  | AnalysisErrorEvent;
