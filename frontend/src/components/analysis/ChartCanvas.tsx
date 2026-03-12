"use client";

import dynamic from "next/dynamic";
import { useAnalysisStore } from "@/store/analysis-store";

// Lazy-load Plotly to avoid SSR issues and reduce initial bundle
const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-gray-500 text-xs">
      차트 로딩 중...
    </div>
  ),
});

export function ChartCanvas() {
  const chartData = useAnalysisStore((s) => s.chartData);
  const chartLayout = useAnalysisStore((s) => s.chartLayout);
  const chartLoading = useAnalysisStore((s) => s.chartLoading);

  if (chartLoading) {
    return (
      <div className="bg-panel-bg border border-panel-border rounded-lg p-8 flex items-center justify-center">
        <div className="flex items-center gap-2 text-xs text-accent-purple">
          <div className="w-4 h-4 border-2 border-accent-purple border-t-transparent rounded-full animate-spin" />
          차트 생성 중...
        </div>
      </div>
    );
  }

  if (!chartData || !chartLayout) return null;

  return (
    <div className="bg-panel-bg border border-panel-border rounded-lg overflow-hidden">
      <div className="w-full" style={{ minHeight: 400 }}>
        <Plot
          data={chartData as Plotly.Data[]}
          layout={{
            ...(chartLayout as Partial<Plotly.Layout>),
            autosize: true,
            height: 450,
          }}
          config={{
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ["sendDataToCloud", "lasso2d", "select2d"],
            toImageButtonOptions: {
              format: "png",
              filename: "chart",
              height: 800,
              width: 1200,
              scale: 2,
            },
          }}
          style={{ width: "100%", height: "100%" }}
          useResizeHandler
        />
      </div>
    </div>
  );
}
