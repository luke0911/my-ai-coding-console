"use client";

import { useMemo } from "react";
import { useSessionStore } from "@/store/session-store";

interface UsageBar {
  label: string;
  percent: number;
  resetTime: string;
}

/** Parse scraped text lines from claude.ai/settings/usage into structured bars. */
function parseUsageBars(lines: string[]): UsageBar[] {
  const bars: UsageBar[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match lines like "16% 사용됨", "6%", "0% 사용됨"
    const percentMatch = line.match(/^(\d+)%/);
    if (!percentMatch) continue;
    // Skip description lines that happen to contain %
    if (line.includes("알아보기") || line.includes("한도에")) continue;

    const percent = parseInt(percentMatch[1], 10);
    let label = "";
    let resetTime = "";

    // Look backwards to find the label and reset time
    for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
      const prev = lines[j].trim();
      if (!prev || prev.length <= 1) continue;
      if (/^\d+%/.test(prev) || prev.includes("사용됨")) continue;

      if (prev.includes("재설정")) {
        if (!resetTime) resetTime = prev;
      } else if (
        !prev.includes("한도") &&
        !prev.includes("알아보기") &&
        !prev.includes("플랜 사용량") &&
        prev.length >= 2
      ) {
        if (!label) label = prev;
      }
    }

    if (label) {
      bars.push({ label, percent, resetTime });
    }
  }

  return bars;
}

function barColor(percent: number): { text: string; bg: string } {
  if (percent < 50) return { text: "text-accent-blue", bg: "bg-accent-blue" };
  if (percent < 80) return { text: "text-accent-orange", bg: "bg-accent-orange" };
  return { text: "text-accent-red", bg: "bg-accent-red" };
}

export function TokenDashboard() {
  const accountUsage = useSessionStore((s) => s.accountUsage);
  const requestUsageRefresh = useSessionStore((s) => s.requestUsageRefresh);

  const bars = useMemo(
    () => parseUsageBars(accountUsage.lines),
    [accountUsage.lines]
  );

  return (
    <div className="p-3 border-b border-panel-border">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">사용량</span>
        <button
          onClick={requestUsageRefresh}
          className="text-[10px] text-accent-blue hover:text-accent-blue/80 underline underline-offset-2"
        >
          새로고침
        </button>
      </div>

      {bars.length > 0 ? (
        <div className="space-y-3">
          {bars.map((bar, i) => {
            const color = barColor(bar.percent);
            return (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-gray-300 font-medium">
                    {bar.label}
                  </span>
                  <span className={`text-[11px] font-medium ${color.text}`}>
                    {bar.percent}%
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-700/40 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${color.bg}`}
                    style={{ width: `${Math.max(bar.percent, 2)}%` }}
                  />
                </div>
                {bar.resetTime && (
                  <div className="text-[10px] text-gray-600 mt-0.5">
                    {bar.resetTime}
                  </div>
                )}
              </div>
            );
          })}

          {accountUsage.scrapedAt > 0 && (
            <div className="text-[10px] text-gray-600 text-right pt-1">
              {new Date(accountUsage.scrapedAt).toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              기준
            </div>
          )}
        </div>
      ) : (
        <div className="text-[11px] text-gray-600 py-2 leading-relaxed">
          사용량 패널에서 claude.ai 로그인 후 데이터가 표시됩니다.
        </div>
      )}
    </div>
  );
}
