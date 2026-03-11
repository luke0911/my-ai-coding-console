"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useSessionStore } from "@/store/session-store";
import { formatTime } from "@/lib/utils";
import type { ServerEvent } from "@my-ai-console/shared";

/**
 * LiveStream: displays the real-time event stream from the agent.
 *
 * All events and response chunks are shown in chronological order.
 * Auto-scroll only when the user is at the bottom — if they scroll up
 * to read earlier content, auto-scroll pauses and a "scroll to bottom"
 * button appears.
 */

const EVENT_ICONS: Partial<Record<string, string>> = {
  "agent:thinking": "💭",
  "agent:response": "💬",
  "agent:plan": "📋",
  "agent:reasoning": "🧠",
  "tool:call": "🔧",
  "tool:result": "✅",
  "file:read": "📖",
  "file:write": "📝",
  "file:diff": "📊",
  "command:execute": "⚡",
  "command:output": "  ",
  "command:complete": "✔️",
  "test:run": "🧪",
  "test:result": "📈",
  "approval:request": "⚠️",
  "approval:response": "👍",
  "hook:event": "🪝",
  "stage:change": "▶️",
  "session:created": "🚀",
  "session:completed": "🏁",
  "session:error": "❌",
};

const EVENT_COLORS: Partial<Record<string, string>> = {
  "agent:thinking": "text-accent-blue",
  "agent:response": "text-gray-200",
  "agent:plan": "text-accent-purple",
  "agent:reasoning": "text-accent-purple",
  "tool:call": "text-accent-blue",
  "tool:result": "text-accent-green",
  "file:read": "text-gray-400",
  "file:write": "text-accent-green",
  "file:diff": "text-accent-orange",
  "command:execute": "text-accent-orange",
  "command:output": "text-gray-500",
  "command:complete": "text-accent-green",
  "test:run": "text-accent-orange",
  "test:result": "text-accent-green",
  "approval:request": "text-accent-orange",
  "session:error": "text-accent-red",
  "session:completed": "text-accent-green",
  "stage:change": "text-accent-blue",
};

function renderEventContent(event: ServerEvent): string {
  switch (event.type) {
    case "agent:thinking":
      return "생각 중...";
    case "agent:response":
      return event.partial ? event.content : "[응답 완료]";
    case "agent:plan":
      return `계획: ${event.plan.split("\n")[0]}...`;
    case "agent:reasoning":
      return event.summary;
    case "tool:call":
      return `${event.toolName}(${Object.keys(event.parameters).join(", ")})`;
    case "tool:result":
      return `${event.toolName}: ${event.success ? "성공" : "실패"} (${event.durationMs}ms)`;
    case "file:read":
      return `읽기: ${event.filePath} (${event.lineCount}줄)`;
    case "file:write":
      return `쓰기: ${event.filePath}`;
    case "file:diff":
      return `변경: ${event.filePath} (${event.hunks.length}개 변경)`;
    case "command:execute":
      return `$ ${event.command}`;
    case "command:output":
      return event.output.trim();
    case "command:complete":
      return `종료 코드 ${event.exitCode} (${event.durationMs}ms)`;
    case "test:run":
      return `테스트 실행: ${event.testSuite}`;
    case "test:result":
      return `${event.passed} 통과, ${event.failed} 실패`;
    case "token:update":
      return `토큰: ${event.inputTokens}입력 / ${event.outputTokens}출력 ($${event.totalCostUsd.toFixed(4)})`;
    case "approval:request":
      return `승인 필요: ${event.description}`;
    case "approval:response":
      return event.approved ? "승인됨" : "거부됨";
    case "hook:event":
      return `${event.hookName} (${event.hookType}): ${event.result ?? "ok"}`;
    case "stage:change":
      return event.description;
    case "session:created":
      return `세션 시작 (${event.model})`;
    case "session:resumed":
      return "세션 재개";
    case "session:completed":
      return `완료: ${event.summary}`;
    case "session:error":
      return `오류: ${event.error}`;
    default:
      return JSON.stringify(event);
  }
}

/** Events to show in the timeline (filter noise) */
function shouldShowEvent(e: ServerEvent): boolean {
  if (e.type === "token:update") return false;
  if (e.type === "command:output") return false;
  return true;
}

/** Is this a response chunk that should be rendered inline? */
function isResponseChunk(e: ServerEvent): boolean {
  return e.type === "agent:response" && e.partial === true;
}

export function LiveStream({ sessionId }: { sessionId: string }) {
  const events = useSessionStore((s) => s.sessionData[sessionId]?.events ?? []);
  const responseText = useSessionStore((s) => s.sessionData[sessionId]?.responseText ?? "");
  const responseStreaming = useSessionStore((s) => s.sessionData[sessionId]?.responseStreaming ?? false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 50;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setIsAtBottom(atBottom);
  }, []);

  // Auto-scroll only when user is at bottom
  useEffect(() => {
    if (isAtBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length, responseText, isAtBottom]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setIsAtBottom(true);
    }
  }, []);

  // Build display items: interleave response blocks with events
  const displayItems: Array<
    | { kind: "event"; event: ServerEvent; index: number }
    | { kind: "response"; text: string; streaming: boolean }
  > = [];

  let responseAccumulated = "";

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    if (isResponseChunk(event)) {
      // Accumulate response text
      responseAccumulated += (event as any).content;
      continue;
    }

    // If we have accumulated response text, flush it before this event
    if (responseAccumulated) {
      displayItems.push({
        kind: "response",
        text: responseAccumulated,
        streaming: false,
      });
      responseAccumulated = "";
    }

    if (shouldShowEvent(event)) {
      displayItems.push({ kind: "event", event, index: i });
    }
  }

  // Flush any remaining response text (including currently streaming)
  if (responseAccumulated || responseText) {
    // Use the store's responseText as the final source of truth
    displayItems.push({
      kind: "response",
      text: responseText || responseAccumulated,
      streaming: responseStreaming,
    });
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto p-3 font-mono text-xs space-y-1"
      >
        {displayItems.map((item, i) => {
          if (item.kind === "response") {
            return (
              <div
                key={`resp-${i}`}
                className="py-1.5 px-2 bg-panel-header/50 rounded border-l-2 border-accent-blue"
              >
                <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed break-words">
                  {item.text}
                  {item.streaming && (
                    <span className="inline-block w-1.5 h-3.5 bg-accent-blue ml-0.5 animate-pulse-slow align-text-bottom" />
                  )}
                </div>
              </div>
            );
          }

          const event = item.event;
          const icon = EVENT_ICONS[event.type] ?? "  ";
          const color = EVENT_COLORS[event.type] ?? "text-gray-500";
          const content = renderEventContent(event);

          // Style certain event types differently
          const isStageChange = event.type === "stage:change";
          const isError = event.type === "session:error";
          const isComplete = event.type === "session:completed";

          return (
            <div
              key={`evt-${item.index}`}
              className={`flex items-start gap-2 py-0.5 rounded px-1 ${
                isStageChange
                  ? "bg-accent-blue/5 border-l-2 border-accent-blue/30 pl-2"
                  : isError
                    ? "bg-accent-red/10 border-l-2 border-accent-red pl-2"
                    : isComplete
                      ? "bg-accent-green/10 border-l-2 border-accent-green pl-2"
                      : "hover:bg-panel-hover"
              } ${color}`}
            >
              <span className="text-gray-600 flex-shrink-0 w-14 text-right text-[10px] pt-0.5">
                {formatTime(event.timestamp)}
              </span>
              <span className="flex-shrink-0 w-5 text-center">
                {icon}
              </span>
              <span className="break-all flex-1">{content}</span>
            </div>
          );
        })}

        {displayItems.length === 0 && (
          <div className="text-gray-600 italic text-center py-8">
            프롬프트를 보내 코딩 세션을 시작하세요.
            <br />
            이벤트가 실시간으로 스트리밍됩니다.
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      {!isAtBottom && displayItems.length > 0 && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-3 right-5 px-3 py-1.5 bg-accent-blue text-white text-xs rounded-full shadow-lg hover:bg-accent-blue/80 transition-colors flex items-center gap-1"
        >
          <span>↓</span>
          <span>최신으로</span>
        </button>
      )}
    </div>
  );
}
