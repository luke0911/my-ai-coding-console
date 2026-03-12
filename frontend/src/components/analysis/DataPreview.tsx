"use client";

import { useAnalysisStore } from "@/store/analysis-store";

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  number: { label: "숫자", color: "text-accent-blue bg-accent-blue/10" },
  string: { label: "문자열", color: "text-accent-green bg-accent-green/10" },
  date: { label: "날짜", color: "text-accent-orange bg-accent-orange/10" },
  boolean: { label: "부울", color: "text-accent-purple bg-accent-purple/10" },
};

export function DataPreview() {
  const schema = useAnalysisStore((s) => s.schema);
  const previewRows = useAnalysisStore((s) => s.previewRows);

  if (!schema || previewRows.length === 0) return null;

  const columns = schema.columns;

  return (
    <div className="bg-panel-bg border border-panel-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-panel-header border-b border-panel-border">
        <span className="text-xs font-medium text-gray-300">
          데이터 미리보기
        </span>
        <span className="text-[10px] text-gray-500">
          전체 {schema.rowCount.toLocaleString()}행 중{" "}
          {Math.min(previewRows.length, 100)}행
        </span>
      </div>

      <div className="overflow-auto max-h-64">
        <table className="w-full text-xs">
          <thead>
            <tr className="sticky top-0 bg-panel-header z-10">
              <th className="px-2 py-1.5 text-left text-gray-500 font-normal border-b border-panel-border w-8">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col.name}
                  className="px-2 py-1.5 text-left font-medium text-gray-300 border-b border-panel-border whitespace-nowrap"
                >
                  <div className="flex items-center gap-1.5">
                    <span>{col.name}</span>
                    <span
                      className={`px-1 py-0.5 rounded text-[9px] ${
                        TYPE_BADGES[col.inferredType]?.color ?? "text-gray-500"
                      }`}
                    >
                      {TYPE_BADGES[col.inferredType]?.label ?? col.inferredType}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.slice(0, 100).map((row, i) => (
              <tr
                key={i}
                className="hover:bg-panel-hover/50 transition-colors"
              >
                <td className="px-2 py-1 text-gray-600 border-b border-panel-border/50">
                  {i + 1}
                </td>
                {columns.map((col) => (
                  <td
                    key={col.name}
                    className="px-2 py-1 text-gray-400 border-b border-panel-border/50 max-w-[200px] truncate"
                    title={String(row[col.name] ?? "")}
                  >
                    {row[col.name] === null || row[col.name] === undefined ? (
                      <span className="text-gray-600 italic">null</span>
                    ) : (
                      String(row[col.name])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
