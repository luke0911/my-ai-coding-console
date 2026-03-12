"use client";

import { useAnalysisStore } from "@/store/analysis-store";
import { DataUploadZone } from "./DataUploadZone";
import { DataPreview } from "./DataPreview";
import { AnalysisSummary } from "./AnalysisSummary";
import { ChartTypeSelector } from "./ChartTypeSelector";
import { AxisConfigurator } from "./AxisConfigurator";
import { ChartCanvas } from "./ChartCanvas";
import { ChartToolbar } from "./ChartToolbar";

export function DataAnalysisPanel() {
  const schema = useAnalysisStore((s) => s.schema);
  const aiAnalysis = useAnalysisStore((s) => s.aiAnalysis);
  const aiAnalysisLoading = useAnalysisStore((s) => s.aiAnalysisLoading);
  const chartData = useAnalysisStore((s) => s.chartData);
  const error = useAnalysisStore((s) => s.error);
  const setError = useAnalysisStore((s) => s.setError);
  const resetAnalysis = useAnalysisStore((s) => s.resetAnalysis);

  if (!schema) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {error && (
          <div className="flex items-center justify-between px-3 py-2 bg-accent-red/10 border-b border-accent-red/20">
            <span className="text-xs text-accent-red">{error}</span>
            <button onClick={() => setError(null)} className="text-xs text-accent-red hover:text-red-300 ml-2">x</button>
          </div>
        )}
        <DataUploadZone />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {error && (
        <div className="flex items-center justify-between px-3 py-2 bg-accent-red/10 border-b border-accent-red/20">
          <span className="text-xs text-accent-red">{error}</span>
          <button onClick={() => setError(null)} className="text-xs text-accent-red hover:text-red-300 ml-2">x</button>
        </div>
      )}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-200">{schema.fileName}</span>
            <span className="text-[10px] text-gray-500">
              {schema.rowCount.toLocaleString()}행 x {schema.columns.length}열
            </span>
            <span className="px-1.5 py-0.5 text-[9px] rounded bg-accent-purple/10 text-accent-purple border border-accent-purple/20">
              {schema.fileType.toUpperCase()}
            </span>
          </div>
          <button onClick={resetAnalysis} className="px-2 py-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
            다른 파일 선택
          </button>
        </div>
        <DataPreview />
        <AnalysisSummary />
        {(aiAnalysis || !aiAnalysisLoading) && <ChartTypeSelector />}
        {(aiAnalysis || !aiAnalysisLoading) && <AxisConfigurator />}
        {chartData ? (
          <>
            <ChartToolbar />
            <ChartCanvas />
          </>
        ) : (
          <ChartCanvas />
        )}
      </div>
    </div>
  );
}
