"use client";

import { useAnalysisStore } from "@/store/analysis-store";
import type { ChartType } from "@my-ai-console/shared";

interface ChartTypeOption {
  type: ChartType;
  label: string;
  icon: string;
  description: string;
  category: "basic" | "statistical";
}

const CHART_TYPES: ChartTypeOption[] = [
  // Basic
  {
    type: "line",
    label: "라인 차트",
    icon: "\u2571",
    description: "시계열 데이터, 추이 변화",
    category: "basic",
  },
  {
    type: "bar",
    label: "막대 차트",
    icon: "\u2587",
    description: "카테고리별 비교",
    category: "basic",
  },
  {
    type: "scatter",
    label: "산점도",
    icon: "\u00B7",
    description: "두 변수 간 관계",
    category: "basic",
  },
  {
    type: "histogram",
    label: "히스토그램",
    icon: "\u2583",
    description: "데이터 분포",
    category: "basic",
  },
  {
    type: "pie",
    label: "원형 차트",
    icon: "\u25D4",
    description: "비율, 구성 비교",
    category: "basic",
  },
  {
    type: "heatmap",
    label: "히트맵",
    icon: "\u25A3",
    description: "매트릭스 시각화",
    category: "basic",
  },
  {
    type: "box",
    label: "박스 플롯",
    icon: "\u229E",
    description: "사분위수, 이상값",
    category: "basic",
  },
  // Statistical
  {
    type: "violin",
    label: "바이올린 플롯",
    icon: "\u2B2D",
    description: "분포 형태 + 통계",
    category: "statistical",
  },
  {
    type: "regression",
    label: "회귀선",
    icon: "\u2572",
    description: "선형 회귀 분석",
    category: "statistical",
  },
  {
    type: "correlation",
    label: "상관 행렬",
    icon: "\u25A6",
    description: "변수 간 상관관계",
    category: "statistical",
  },
  {
    type: "scatter3d",
    label: "3D 산점도",
    icon: "\u25C7",
    description: "3차원 데이터 분포",
    category: "statistical",
  },
];

export function ChartTypeSelector() {
  const chartConfig = useAnalysisStore((s) => s.chartConfig);
  const setChartConfig = useAnalysisStore((s) => s.setChartConfig);
  const aiAnalysis = useAnalysisStore((s) => s.aiAnalysis);

  const suggestedTypes = new Set(
    aiAnalysis?.suggestedCharts.map((s) => s.chartType) ?? []
  );

  const basicCharts = CHART_TYPES.filter((c) => c.category === "basic");
  const statCharts = CHART_TYPES.filter((c) => c.category === "statistical");

  const handleSelect = (type: ChartType) => {
    setChartConfig({ chartType: type });

    // Auto-fill axes from AI suggestion if available
    const suggestion = aiAnalysis?.suggestedCharts.find(
      (s) => s.chartType === type
    );
    if (suggestion) {
      setChartConfig({
        chartType: type,
        xAxis: suggestion.xAxis || null,
        yAxis: suggestion.yAxis || null,
      });
    }
  };

  return (
    <div className="bg-panel-bg border border-panel-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-panel-header border-b border-panel-border">
        <span className="text-xs font-medium text-gray-300">
          시각화 프로그램 선택
        </span>
      </div>

      <div className="p-3 space-y-3">
        {/* Basic charts */}
        <div>
          <p className="text-[10px] text-gray-500 mb-2 uppercase tracking-wider">
            기본 차트
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {basicCharts.map((chart) => (
              <ChartCard
                key={chart.type}
                chart={chart}
                selected={chartConfig.chartType === chart.type}
                suggested={suggestedTypes.has(chart.type)}
                onClick={() => handleSelect(chart.type)}
              />
            ))}
          </div>
        </div>

        {/* Statistical charts */}
        <div>
          <p className="text-[10px] text-gray-500 mb-2 uppercase tracking-wider">
            통계 차트
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {statCharts.map((chart) => (
              <ChartCard
                key={chart.type}
                chart={chart}
                selected={chartConfig.chartType === chart.type}
                suggested={suggestedTypes.has(chart.type)}
                onClick={() => handleSelect(chart.type)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChartCard({
  chart,
  selected,
  suggested,
  onClick,
}: {
  chart: ChartTypeOption;
  selected: boolean;
  suggested: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative p-2 rounded border text-left transition-all ${
        selected
          ? "border-accent-purple bg-accent-purple/10"
          : suggested
            ? "border-accent-blue/50 bg-accent-blue/5 hover:border-accent-blue"
            : "border-panel-border hover:border-gray-500 hover:bg-panel-hover/30"
      }`}
    >
      {suggested && (
        <span className="absolute -top-1 -right-1 px-1 py-0 text-[8px] rounded bg-accent-blue text-white">
          AI
        </span>
      )}
      <div className="text-lg text-center mb-1 text-gray-300">{chart.icon}</div>
      <p className="text-[10px] font-medium text-gray-300 text-center">
        {chart.label}
      </p>
      <p className="text-[9px] text-gray-500 text-center mt-0.5">
        {chart.description}
      </p>
    </button>
  );
}
