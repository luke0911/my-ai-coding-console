"use client";

import { useState } from "react";
import { useSessionStore } from "@/store/session-store";
import { TerminalPanel } from "@/components/terminal/TerminalPanel";
import { HooksPanel } from "@/components/hooks-panel/HooksPanel";
import { formatTime } from "@/lib/utils";

type BottomTab = "terminal" | "tests" | "commands" | "hooks";

export function BottomPanel({ sessionId }: { sessionId: string | null }) {
  const [activeTab, setActiveTab] = useState<BottomTab>("terminal");
  const [collapsed, setCollapsed] = useState(false);

  const data = useSessionStore((s) =>
    sessionId ? s.sessionData[sessionId] : null
  );
  const testResults = data?.testResults ?? [];
  const commands = data?.commands ?? [];
  const hookEvents = data?.hookEvents ?? [];

  if (collapsed) {
    return (
      <div
        className="h-7 bg-panel-header border-t border-panel-border flex items-center px-3 cursor-pointer hover:bg-panel-hover"
        onClick={() => setCollapsed(false)}
      >
        <span className="text-xs text-gray-500">
          터미널 &middot; 테스트 ({testResults.length}) &middot; 명령어 (
          {commands.length}) &middot; 훅 ({hookEvents.length})
          <span className="ml-2 text-gray-600">[클릭하여 펼치기]</span>
        </span>
      </div>
    );
  }

  return (
    <div className="h-52 flex flex-col border-t border-panel-border bg-panel-bg flex-shrink-0">
      {/* Tabs */}
      <div className="flex items-center bg-panel-header border-b border-panel-border">
        {(
          [
            { key: "terminal", label: "터미널" },
            { key: "tests", label: `테스트 (${testResults.length})` },
            { key: "commands", label: `명령어 (${commands.length})` },
            { key: "hooks", label: `훅 (${hookEvents.length})` },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === key
                ? "border-accent-blue text-accent-blue"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setCollapsed(true)}
          className="px-2 py-1 text-xs text-gray-500 hover:text-gray-300"
        >
          접기
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === "terminal" && sessionId && <TerminalPanel sessionId={sessionId} />}

        {activeTab === "tests" && (
          <div className="p-3 space-y-2">
            {testResults.length === 0 ? (
              <div className="text-xs text-gray-600 italic">
                아직 테스트 결과가 없습니다
              </div>
            ) : (
              testResults.map((tr, i) => (
                <div
                  key={i}
                  className="p-2 rounded bg-panel-header border border-panel-border"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-300">
                      {tr.testSuite}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {formatTime(tr.timestamp)}
                    </span>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className="text-accent-green">
                      {tr.passed}개 통과
                    </span>
                    {tr.failed > 0 && (
                      <span className="text-accent-red">
                        {tr.failed}개 실패
                      </span>
                    )}
                    {tr.skipped > 0 && (
                      <span className="text-gray-500">
                        {tr.skipped}개 건너뜀
                      </span>
                    )}
                  </div>
                  {tr.output && (
                    <div className="mt-1 text-xs text-gray-400">
                      {tr.output}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "commands" && (
          <div className="p-3 space-y-2">
            {commands.length === 0 ? (
              <div className="text-xs text-gray-600 italic">
                아직 실행된 명령어가 없습니다
              </div>
            ) : (
              commands.map((cmd) => (
                <div
                  key={cmd.commandId}
                  className="p-2 rounded bg-panel-header border border-panel-border"
                >
                  <div className="flex items-center justify-between mb-1">
                    <code className="text-xs text-accent-blue">
                      $ {cmd.command}
                    </code>
                    <span
                      className={`text-[10px] ${
                        cmd.exitCode === null
                          ? "text-accent-orange"
                          : cmd.exitCode === 0
                            ? "text-accent-green"
                            : "text-accent-red"
                      }`}
                    >
                      {cmd.exitCode === null
                        ? "실행 중..."
                        : `종료 ${cmd.exitCode}`}
                      {cmd.durationMs !== null && ` (${cmd.durationMs}ms)`}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "hooks" && sessionId && <HooksPanel sessionId={sessionId} />}
      </div>
    </div>
  );
}
