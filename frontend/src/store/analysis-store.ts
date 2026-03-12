/**
 * Zustand store for data analysis mode state.
 * Separate from session-store to avoid polluting coding console state.
 */

import { create } from "zustand";
import type {
  DatasetSchema,
  AiAnalysisResult,
  ChartConfig,
  ChartType,
} from "@my-ai-console/shared";

interface AnalysisStore {
  // Mode
  analysisMode: boolean;
  setAnalysisMode: (mode: boolean) => void;

  // Data
  analysisId: string | null;
  schema: DatasetSchema | null;
  previewRows: Record<string, unknown>[];

  // AI analysis
  aiAnalysisLoading: boolean;
  aiAnalysis: AiAnalysisResult | null;

  // Chart
  chartConfig: ChartConfig;
  setChartConfig: (config: Partial<ChartConfig>) => void;
  chartData: unknown | null;
  chartLayout: unknown | null;
  chartLoading: boolean;
  setChartLoading: (loading: boolean) => void;

  // Actions
  resetAnalysis: () => void;
  setUploadResult: (result: {
    analysisId: string;
    schema: DatasetSchema;
    preview: Record<string, unknown>[];
  }) => void;
  setAiAnalysisLoading: (loading: boolean) => void;
  setAiAnalysis: (result: AiAnalysisResult) => void;
  setChartReady: (data: unknown, layout: unknown) => void;

  // Error
  error: string | null;
  setError: (error: string | null) => void;
}

const DEFAULT_CHART_CONFIG: ChartConfig = {
  chartType: "scatter",
  xAxis: null,
  yAxis: null,
  colorBy: null,
  sizeBy: null,
  aggregation: "none",
};

export const useAnalysisStore = create<AnalysisStore>((set) => ({
  analysisMode: false,
  setAnalysisMode: (mode) => set({ analysisMode: mode }),

  analysisId: null,
  schema: null,
  previewRows: [],

  aiAnalysisLoading: false,
  aiAnalysis: null,

  chartConfig: { ...DEFAULT_CHART_CONFIG },
  setChartConfig: (config) =>
    set((s) => ({ chartConfig: { ...s.chartConfig, ...config } })),

  chartData: null,
  chartLayout: null,
  chartLoading: false,
  setChartLoading: (loading) => set({ chartLoading: loading }),

  resetAnalysis: () =>
    set({
      analysisId: null,
      schema: null,
      previewRows: [],
      aiAnalysis: null,
      aiAnalysisLoading: false,
      chartData: null,
      chartLayout: null,
      chartLoading: false,
      chartConfig: { ...DEFAULT_CHART_CONFIG },
      error: null,
    }),

  setUploadResult: (result) =>
    set({
      analysisId: result.analysisId,
      schema: result.schema,
      previewRows: result.preview,
      error: null,
    }),

  setAiAnalysisLoading: (loading) => set({ aiAnalysisLoading: loading }),

  setAiAnalysis: (result) =>
    set({ aiAnalysis: result, aiAnalysisLoading: false }),

  setChartReady: (data, layout) =>
    set({ chartData: data, chartLayout: layout, chartLoading: false }),

  error: null,
  setError: (error) => set({ error }),
}));
