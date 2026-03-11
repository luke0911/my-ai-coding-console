"use client";

import { useSessionStore } from "@/store/session-store";
import { ConsoleTabs } from "@/components/console/ConsoleTabs";
import { PromptInput } from "@/components/prompt/PromptInput";
import { LiveStream } from "@/components/stream/LiveStream";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { FileViewer } from "@/components/files/FileViewer";
import { FileTimeline } from "@/components/timeline/FileTimeline";
import { UsagePanel } from "@/components/tokens/UsagePanel";
import type { ClientMessage } from "@my-ai-console/shared";

interface CenterPanelProps {
  send: (msg: ClientMessage) => void;
}

export function CenterPanel({ send }: CenterPanelProps) {
  const selectedPanel = useSessionStore((s) => s.selectedPanel);
  const setSelectedPanel = useSessionStore((s) => s.setSelectedPanel);
  const activeConsoleId = useSessionStore((s) => s.activeConsoleId);
  const sessionData = useSessionStore((s) => s.sessionData);

  const activeData = activeConsoleId ? sessionData[activeConsoleId] : null;
  const codeChangesCount = activeData?.codeChanges?.length ?? 0;
  const currentFile = activeData?.currentFile ?? null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden border-r border-panel-border">
      {/* Console tabs */}
      <ConsoleTabs />

      {/* Prompt input */}
      <PromptInput send={send} />

      {/* Panel tabs */}
      <div className="flex items-center gap-0.5 px-2 bg-panel-header border-b border-panel-border">
        {(["stream", "diff", "file", "usage"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setSelectedPanel(tab)}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
              selectedPanel === tab
                ? "border-accent-blue text-accent-blue"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab === "stream" && "실시간 스트림"}
            {tab === "diff" &&
              `코드 변경${codeChangesCount > 0 ? ` (${codeChangesCount})` : ""}`}
            {tab === "file" &&
              `파일${currentFile ? ` (${currentFile.path.split("/").pop()})` : ""}`}
            {tab === "usage" && "사용량"}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-hidden flex flex-col relative">
        {selectedPanel === "stream" && activeConsoleId && (
          <LiveStream sessionId={activeConsoleId} />
        )}
        {selectedPanel === "diff" && activeConsoleId && (
          <DiffViewer sessionId={activeConsoleId} />
        )}
        {selectedPanel === "file" && activeConsoleId && (
          <FileViewer sessionId={activeConsoleId} />
        )}
        {/* UsagePanel always mounted so webview persists for scraping */}
        <div
          className={
            selectedPanel === "usage"
              ? "flex-1 flex flex-col"
              : "absolute w-0 h-0 overflow-hidden"
          }
        >
          <UsagePanel />
        </div>
        {!activeConsoleId && selectedPanel !== "usage" && (
          <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
            콘솔이 없습니다. + 버튼으로 새 콘솔을 만드세요.
          </div>
        )}
      </div>

      {/* File change timeline */}
      {activeConsoleId && <FileTimeline sessionId={activeConsoleId} />}
    </div>
  );
}
