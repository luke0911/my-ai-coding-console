"use client";

import { useAnalysisStore } from "@/store/analysis-store";
import type { ColumnStatistics } from "@my-ai-console/shared";

function StatValue({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span>
      {label}:{" "}
      <span className={color}>{value.toFixed(2)}</span>
    </span>
  );
}

function ColumnStats({ stats }: { stats: ColumnStatistics }) {
  return (
    <div className="flex gap-2 text-[10px] text-gray-500 flex-wrap">
      {stats.mean != null && <StatValue label="평균" value={stats.mean} color="text-accent-blue" />}
      {stats.median != null && <StatValue label="중앙" value={stats.median} color="text-accent-blue" />}
      {stats.min != null && <StatValue label="최소" value={stats.min} color="text-accent-green" />}
      {stats.max != null && <StatValue label="최대" value={stats.max} color="text-accent-red" />}
      {stats.stddev != null && <StatValue label="표준편차" value={stats.stddev} color="text-accent-orange" />}
    </div>
  );
}

export function AnalysisSummary() {
  const schema = useAnalysisStore((s) => s.schema);
  const aiAnalysis = useAnalysisStore((s) => s.aiAnalysis);
  const aiAnalysisLoading = useAnalysisStore((s) => s.aiAnalysisLoading);

  if (!schema) return null;

  return (
    <div className="bg-panel-bg border border-panel-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-panel-header border-b border-panel-border">
        <span className="text-xs font-medium text-gray-300">AI 분석 결과</span>
        {aiAnalysisLoading && (
          <span className="text-[10px] text-accent-purple animate-pulse">
            분석 중...
          </span>
        )}
      </div>

      <div className="p-3">
        {aiAnalysisLoading && !aiAnalysis && (
          <div className="space-y-3">
            {schema.columns.slice(0, 4).map((col) => (
              <div
                key={col.name}
                className="h-12 bg-panel-hover/30 rounded animate-pulse"
              />
            ))}
          </div>
        )}

        {aiAnalysis && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {schema.columns.map((col) => {
                const desc = aiAnalysis.columnDescriptions[col.name];
                const stats = aiAnalysis.statistics[col.name];

                return (
                  <div
                    key={col.name}
                    className="p-2 bg-panel-hover/20 rounded border border-panel-border/50"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-medium text-gray-200">
                        {col.name}
                      </span>
                      <span className="text-[9px] text-gray-500">
                        ({col.inferredType})
                      </span>
                    </div>
                    {desc && (
                      <p className="text-[11px] text-gray-400 mb-1">{desc}</p>
                    )}
                    {stats && <ColumnStats stats={stats} />}
                  </div>
                );
              })}
            </div>

            {aiAnalysis.dataQualityNotes.length > 0 && (
              <div className="space-y-1">
                {aiAnalysis.dataQualityNotes.map((note, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-1.5 text-[11px] text-accent-orange"
                  >
                    <span className="flex-shrink-0 mt-0.5">!</span>
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!aiAnalysisLoading && !aiAnalysis && (
          <p className="text-xs text-gray-500">
            AI 분석을 사용하려면 API 키를 설정하세요.
          </p>
        )}
      </div>
    </div>
  );
}
