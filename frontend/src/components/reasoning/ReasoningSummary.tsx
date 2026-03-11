"use client";

import { formatTime } from "@/lib/utils";

interface ReasoningSummaryProps {
  summary: string;
  context: string;
  timestamp: number;
}

export function ReasoningSummary({
  summary,
  context,
  timestamp,
}: ReasoningSummaryProps) {
  return (
    <div className="p-2 rounded bg-panel-header border border-panel-border">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-accent-purple font-semibold uppercase">
          추론
        </span>
        <span className="text-[10px] text-gray-600">
          {formatTime(timestamp)}
        </span>
      </div>
      <p className="text-xs text-gray-300 leading-relaxed">{summary}</p>
      {context && (
        <p className="text-[10px] text-gray-500 mt-1 italic">{context}</p>
      )}
    </div>
  );
}
