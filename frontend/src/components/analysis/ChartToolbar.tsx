"use client";

import { useAnalysisStore } from "@/store/analysis-store";

export function ChartToolbar() {
  const chartData = useAnalysisStore((s) => s.chartData);
  const resetAnalysis = useAnalysisStore((s) => s.resetAnalysis);
  const setChartReady = useAnalysisStore((s) => s.setChartReady);

  if (!chartData) return null;

  const handleReset = () => {
    setChartReady(null, null);
  };

  const handleNewFile = () => {
    resetAnalysis();
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleReset}
        className="px-3 py-1.5 text-[11px] text-gray-400 bg-panel-header border border-panel-border rounded hover:text-gray-200 hover:bg-panel-hover transition-colors"
      >
        차트 설정 변경
      </button>
      <button
        onClick={handleNewFile}
        className="px-3 py-1.5 text-[11px] text-gray-400 bg-panel-header border border-panel-border rounded hover:text-gray-200 hover:bg-panel-hover transition-colors"
      >
        새 파일 분석
      </button>
    </div>
  );
}
