"use client";

import { useState, useRef, useCallback } from "react";
import { useSessionStore } from "@/store/session-store";
import type { ClientMessage } from "@my-ai-console/shared";

interface PromptInputProps {
  send: (msg: ClientMessage) => void;
}

export function PromptInput({ send }: PromptInputProps) {
  const [prompt, setPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const connected = useSessionStore((s) => s.connected);
  const activeConsoleId = useSessionStore((s) => s.activeConsoleId);
  const activeData = useSessionStore((s) =>
    s.activeConsoleId ? s.sessionData[s.activeConsoleId] : null
  );
  const model = useSessionStore((s) => s.model);
  const updateSessionData = useSessionStore((s) => s.updateSessionData);

  const stage = activeData?.stage ?? "idle";
  const workspacePath = activeData?.workspacePath ?? "";
  const isRunning = stage !== "idle" && stage !== "completed" && stage !== "error";
  const noWorkspace = !workspacePath.trim();

  const handleSubmit = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed || !connected || isRunning || noWorkspace || !activeConsoleId) return;

    updateSessionData(activeConsoleId, () => ({
      responseText: "",
      responseStreaming: false,
    }));
    const isNew = activeConsoleId.startsWith("new-");
    send({
      type: "prompt:send",
      sessionId: isNew ? undefined : activeConsoleId,
      prompt: trimmed,
      workspacePath,
      model,
    });
    setPrompt("");
  }, [prompt, connected, isRunning, noWorkspace, activeConsoleId, workspacePath, model, send, updateSessionData]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // isComposing: 한국어/일본어/중국어 IME 조합 중에는 Enter를 무시
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="p-3 border-b border-panel-border bg-panel-header">
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            noWorkspace
              ? "먼저 왼쪽 사이드바에서 작업 폴더를 선택하세요"
              : isRunning
                ? "에이전트 작업 중..."
                : "코딩 프롬프트를 입력하세요 (Enter로 전송, Shift+Enter로 줄바꿈)"
          }
          disabled={!connected || isRunning || noWorkspace}
          rows={2}
          className="flex-1 bg-panel-bg border border-panel-border rounded px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:border-accent-blue focus:outline-none resize-none disabled:opacity-50 font-mono"
        />
        <button
          onClick={handleSubmit}
          disabled={!connected || !prompt.trim() || isRunning || noWorkspace}
          className="px-4 py-2 bg-accent-blue text-white text-sm font-medium rounded hover:bg-accent-blue/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors self-end"
        >
          {isRunning ? "작업 중..." : "전송"}
        </button>
      </div>
      <div className="flex items-center justify-between mt-1.5 text-[10px] text-gray-600">
        <span>
          작업 폴더: <span className={noWorkspace ? "text-accent-orange" : "text-gray-500"}>{workspacePath || "선택되지 않음"}</span>
        </span>
        {activeConsoleId && !activeConsoleId.startsWith("new-") && (
          <span>
            세션: <span className="text-gray-500">{activeConsoleId.slice(0, 8)}</span>
          </span>
        )}
      </div>
    </div>
  );
}
