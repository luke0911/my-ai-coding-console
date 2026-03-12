"use client";

import { useSessionStore } from "@/store/session-store";
import { useAnalysisStore } from "@/store/analysis-store";

const STAGE_DOTS: Record<string, string> = {
  thinking: "bg-accent-blue",
  planning: "bg-accent-purple",
  coding: "bg-accent-green",
  testing: "bg-accent-orange",
  reviewing: "bg-accent-blue",
  waiting_approval: "bg-accent-orange",
};

const STAGE_LABELS: Record<string, string> = {
  thinking: "생각 중",
  planning: "계획 중",
  coding: "코딩 중",
  testing: "테스트 중",
  reviewing: "검토 중",
  completed: "완료",
  error: "오류",
  waiting_approval: "승인 대기",
};

export function ConsoleTabs() {
  const openConsoles = useSessionStore((s) => s.openConsoles);
  const activeConsoleId = useSessionStore((s) => s.activeConsoleId);
  const sessionData = useSessionStore((s) => s.sessionData);
  const setActiveConsole = useSessionStore((s) => s.setActiveConsole);
  const closeConsole = useSessionStore((s) => s.closeConsole);
  const createNewConsole = useSessionStore((s) => s.createNewConsole);

  const analysisMode = useAnalysisStore((s) => s.analysisMode);
  const setAnalysisMode = useAnalysisStore((s) => s.setAnalysisMode);

  const handleConsoleClick = (consoleId: string) => {
    setAnalysisMode(false);
    setActiveConsole(consoleId);
  };

  return (
    <div className="flex items-center bg-panel-header border-b border-panel-border overflow-x-auto flex-shrink-0">
      {openConsoles.map((consoleId, idx) => {
        const data = sessionData[consoleId];
        const stage = data?.stage ?? "idle";
        const isActive = consoleId === activeConsoleId && !analysisMode;
        const isNew = consoleId.startsWith("new-");
        const dotClass = STAGE_DOTS[stage];
        const stageLabel = STAGE_LABELS[stage];
        const wp = data?.workspacePath;
        const folderName = wp ? wp.split("/").pop() || wp : "";

        return (
          <div
            key={consoleId}
            onClick={() => handleConsoleClick(consoleId)}
            className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-b-2 transition-colors min-w-0 flex-shrink-0 ${
              isActive
                ? "border-accent-blue text-gray-200 bg-panel-bg"
                : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-panel-bg/50"
            }`}
          >
            {dotClass && (
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse-slow ${dotClass}`}
              />
            )}
            {stage === "completed" && (
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-accent-green" />
            )}
            {stage === "error" && (
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-accent-red" />
            )}
            <span className="whitespace-nowrap">
              {isNew ? `콘솔 ${idx + 1}` : `콘솔 ${consoleId.slice(0, 6)}`}
            </span>
            {folderName && (
              <span className="text-[10px] text-gray-600 truncate max-w-[80px]">
                {folderName}
              </span>
            )}
            {stageLabel && (
              <span className="text-[10px] text-gray-500 whitespace-nowrap">
                {stageLabel}
              </span>
            )}
            {openConsoles.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeConsole(consoleId);
                }}
                className="ml-0.5 w-4 h-4 flex items-center justify-center rounded text-gray-600 hover:text-gray-300 hover:bg-panel-hover opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              >
                x
              </button>
            )}
          </div>
        );
      })}

      {/* Data Analysis tab */}
      <div
        onClick={() => setAnalysisMode(true)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-b-2 transition-colors flex-shrink-0 ${
          analysisMode
            ? "border-accent-purple text-gray-200 bg-panel-bg"
            : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-panel-bg/50"
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-accent-purple" />
        <span className="whitespace-nowrap">데이터 분석</span>
      </div>

      <button
        onClick={() => createNewConsole()}
        className="px-2.5 py-1.5 text-gray-600 hover:text-accent-blue transition-colors flex-shrink-0 text-sm"
        title="새 콘솔 열기"
      >
        +
      </button>
    </div>
  );
}
