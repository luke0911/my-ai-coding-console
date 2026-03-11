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

function formatResetTime(epochSeconds: number): string {
  if (!epochSeconds) return "";
  const date = new Date(epochSeconds * 1000);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  if (diffMs <= 0) return "곧 재설정";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}시간 ${minutes}분 후 재설정`;
  return `${minutes}분 후 재설정`;
}

function UsageBarItem({ label, percent, resetTime }: UsageBar) {
  const color = barColor(percent);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-gray-300 font-medium">{label}</span>
        <span className={`text-[11px] font-medium ${color.text}`}>
          {Math.round(percent)}%
        </span>
      </div>
      <div className="w-full h-2 bg-gray-700/40 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color.bg}`}
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>
      {resetTime && (
        <div className="text-[10px] text-gray-600 mt-0.5">{resetTime}</div>
      )}
    </div>
  );
}

export function TokenDashboard() {
  const provider = useSessionStore((s) => s.provider);
  const accountUsage = useSessionStore((s) => s.accountUsage);
  const requestUsageRefresh = useSessionStore((s) => s.requestUsageRefresh);
  const codexRateLimit = useSessionStore((s) => s.codexRateLimit);
  const activeData = useSessionStore((s) =>
    s.activeConsoleId ? s.sessionData[s.activeConsoleId] : null
  );

  const claudeBars = useMemo(
    () => parseUsageBars(accountUsage.lines),
    [accountUsage.lines]
  );

  // Codex usage bars from rate limit data
  const codexBars: UsageBar[] = useMemo(() => {
    const bars: UsageBar[] = [];
    if (codexRateLimit.primaryResetsAt > 0 || codexRateLimit.primaryUsedPercent > 0) {
      bars.push({
        label: "5시간 한도",
        percent: codexRateLimit.primaryUsedPercent,
        resetTime: formatResetTime(codexRateLimit.primaryResetsAt),
      });
    }
    if (codexRateLimit.secondaryResetsAt > 0 || codexRateLimit.secondaryUsedPercent > 0) {
      bars.push({
        label: "주간 한도",
        percent: codexRateLimit.secondaryUsedPercent,
        resetTime: formatResetTime(codexRateLimit.secondaryResetsAt),
      });
    }
    return bars;
  }, [codexRateLimit]);

  const tokens = activeData?.tokens;

  if (provider === "codex") {
    return (
      <div className="p-3 border-b border-panel-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500">Codex 사용량</span>
        </div>

        {codexBars.length > 0 ? (
          <div className="space-y-3">
            {codexBars.map((bar, i) => (
              <UsageBarItem key={i} {...bar} />
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-gray-600 py-1">
            Codex 세션 실행 후 사용량이 표시됩니다.
          </div>
        )}

        {/* Token counts for current session */}
        {tokens && (tokens.inputTokens > 0 || tokens.outputTokens > 0) && (
          <div className="mt-2 pt-2 border-t border-panel-border space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-gray-500">입력 토큰</span>
              <span className="text-gray-400">{tokens.inputTokens.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-gray-500">출력 토큰</span>
              <span className="text-gray-400">{tokens.outputTokens.toLocaleString()}</span>
            </div>
            {tokens.cacheReadTokens > 0 && (
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-500">캐시 토큰</span>
                <span className="text-gray-400">{tokens.cacheReadTokens.toLocaleString()}</span>
              </div>
            )}
            {tokens.contextBudgetRemaining >= 0 && (
              <div className="mt-1">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-gray-500">컨텍스트</span>
                  <span className="text-[10px] text-gray-400">
                    {Math.round(tokens.contextBudgetRemaining * 100)}% 남음
                  </span>
                </div>
                <div className="w-full h-1.5 bg-gray-700/40 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent-blue transition-all duration-500"
                    style={{ width: `${Math.max(tokens.contextBudgetRemaining * 100, 2)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Claude provider
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

      {claudeBars.length > 0 ? (
        <div className="space-y-3">
          {claudeBars.map((bar, i) => (
            <UsageBarItem key={i} {...bar} />
          ))}

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
