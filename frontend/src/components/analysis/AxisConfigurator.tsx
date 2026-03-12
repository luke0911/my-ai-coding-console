"use client";

import { useCallback } from "react";
import { useAnalysisStore } from "@/store/analysis-store";
import type { ChartType, ChartConfig } from "@my-ai-console/shared";

const AGGREGATIONS = [
  { value: "none", label: "없음" },
  { value: "sum", label: "합계" },
  { value: "mean", label: "평균" },
  { value: "count", label: "개수" },
  { value: "median", label: "중앙값" },
] as const;

/** Chart types that don't need Y axis */
const NO_Y_AXIS: ChartType[] = ["histogram", "pie", "correlation", "heatmap"];
/** Chart types that use a Z axis (colorBy becomes Z) */
const HAS_Z_AXIS: ChartType[] = ["scatter3d"];
/** Chart types that support colorBy grouping */
const SUPPORTS_COLOR: ChartType[] = ["scatter", "box", "violin", "scatter3d"];
/** Chart types that support sizeBy */
const SUPPORTS_SIZE: ChartType[] = ["scatter"];
/** Chart types that support aggregation */
const SUPPORTS_AGG: ChartType[] = ["bar", "line"];

export function AxisConfigurator() {
  const schema = useAnalysisStore((s) => s.schema);
  const chartConfig = useAnalysisStore((s) => s.chartConfig);
  const setChartConfig = useAnalysisStore((s) => s.setChartConfig);
  const aiAnalysis = useAnalysisStore((s) => s.aiAnalysis);
  const analysisId = useAnalysisStore((s) => s.analysisId);
  const setChartReady = useAnalysisStore((s) => s.setChartReady);
  const setChartLoading = useAnalysisStore((s) => s.setChartLoading);
  const setError = useAnalysisStore((s) => s.setError);

  const columns = schema?.columns ?? [];
  const numericCols = columns.filter((c) => c.inferredType === "number");
  const allColNames = columns.map((c) => c.name);
  const numericColNames = numericCols.map((c) => c.name);

  const { chartType } = chartConfig;
  const needsY = !NO_Y_AXIS.includes(chartType);
  const hasZ = HAS_Z_AXIS.includes(chartType);
  const supportsColor = SUPPORTS_COLOR.includes(chartType);
  const supportsSize = SUPPORTS_SIZE.includes(chartType);
  const supportsAgg = SUPPORTS_AGG.includes(chartType);

  // Find AI suggestion for this chart type
  const suggestion = aiAnalysis?.suggestedCharts.find(
    (s) => s.chartType === chartType
  );

  const handleGenerateChart = useCallback(async () => {
    if (!analysisId) return;

    setChartLoading(true);
    setError(null);

    try {
      const res = await fetch("http://localhost:3001/api/data/prepare-chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId,
          ...chartConfig,
          aiColumnDescriptions: aiAnalysis?.columnDescriptions ?? {},
          aiStatistics: aiAnalysis?.statistics ?? {},
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "차트 생성 실패");
      }

      const { chartData, chartLayout } = await res.json();
      setChartReady(chartData, chartLayout);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "차트 생성 실패";
      setError(message);
      setChartLoading(false);
    }
  }, [analysisId, chartConfig, setChartReady, setChartLoading, setError]);

  if (!schema) return null;

  return (
    <div className="bg-panel-bg border border-panel-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-panel-header border-b border-panel-border">
        <span className="text-xs font-medium text-gray-300">축 설정</span>
      </div>

      <div className="p-3 space-y-3">
        {/* AI suggestion chip */}
        {suggestion && (
          <div className="flex items-center gap-2 px-2 py-1.5 bg-accent-blue/5 border border-accent-blue/20 rounded text-[11px]">
            <span className="text-accent-blue font-medium">AI 제안:</span>
            <span className="text-gray-400">{suggestion.reason}</span>
            <button
              onClick={() =>
                setChartConfig({
                  xAxis: suggestion.xAxis || null,
                  yAxis: suggestion.yAxis || null,
                })
              }
              className="ml-auto px-2 py-0.5 text-[10px] bg-accent-blue/20 text-accent-blue rounded hover:bg-accent-blue/30 transition-colors"
            >
              적용
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {/* X Axis */}
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">
              {hasZ ? "X축" : "X축 (가로)"}
            </label>
            <select
              value={chartConfig.xAxis ?? ""}
              onChange={(e) =>
                setChartConfig({ xAxis: e.target.value || null })
              }
              className="w-full px-2 py-1.5 text-xs bg-panel-header border border-panel-border rounded text-gray-300 focus:border-accent-blue focus:outline-none"
            >
              <option value="">선택하세요</option>
              {allColNames.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </div>

          {/* Y Axis */}
          {needsY && (
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">
                Y축 (세로)
              </label>
              <select
                value={chartConfig.yAxis ?? ""}
                onChange={(e) =>
                  setChartConfig({ yAxis: e.target.value || null })
                }
                className="w-full px-2 py-1.5 text-xs bg-panel-header border border-panel-border rounded text-gray-300 focus:border-accent-blue focus:outline-none"
              >
                <option value="">선택하세요</option>
                {(chartType === "bar" || chartType === "line"
                  ? numericColNames
                  : allColNames
                ).map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Z axis / Color By */}
          {(supportsColor || hasZ) && (
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">
                {hasZ ? "Z축" : "색상 구분"}
              </label>
              <select
                value={chartConfig.colorBy ?? ""}
                onChange={(e) =>
                  setChartConfig({ colorBy: e.target.value || null })
                }
                className="w-full px-2 py-1.5 text-xs bg-panel-header border border-panel-border rounded text-gray-300 focus:border-accent-blue focus:outline-none"
              >
                <option value="">없음</option>
                {allColNames.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Size By */}
          {supportsSize && (
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">
                크기 기준
              </label>
              <select
                value={chartConfig.sizeBy ?? ""}
                onChange={(e) =>
                  setChartConfig({ sizeBy: e.target.value || null })
                }
                className="w-full px-2 py-1.5 text-xs bg-panel-header border border-panel-border rounded text-gray-300 focus:border-accent-blue focus:outline-none"
              >
                <option value="">없음</option>
                {numericColNames.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Aggregation */}
          {supportsAgg && (
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">
                집계 방식
              </label>
              <select
                value={chartConfig.aggregation}
                onChange={(e) =>
                  setChartConfig({
                    aggregation: e.target.value as ChartConfig["aggregation"],
                  })
                }
                className="w-full px-2 py-1.5 text-xs bg-panel-header border border-panel-border rounded text-gray-300 focus:border-accent-blue focus:outline-none"
              >
                {AGGREGATIONS.map((agg) => (
                  <option key={agg.value} value={agg.value}>
                    {agg.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerateChart}
          disabled={!chartConfig.xAxis && chartType !== "correlation" && chartType !== "heatmap"}
          className="w-full py-2 text-xs font-medium rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-accent-purple hover:bg-accent-purple/80 text-white"
        >
          차트 생성
        </button>
      </div>
    </div>
  );
}
