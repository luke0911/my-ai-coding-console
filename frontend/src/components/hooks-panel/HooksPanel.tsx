"use client";

import { useSessionStore } from "@/store/session-store";
import { formatTime } from "@/lib/utils";

export function HooksPanel({ sessionId }: { sessionId: string }) {
  const hookEvents = useSessionStore((s) => s.sessionData[sessionId]?.hookEvents ?? []);

  return (
    <div className="p-3 space-y-1">
      {hookEvents.length === 0 ? (
        <div className="text-xs text-gray-600 italic">
          아직 훅 이벤트가 없습니다. 훅은 파일 쓰기, 명령어 실행,
          세션 생명주기 이벤트 시 실행됩니다.
        </div>
      ) : (
        hookEvents.map((event, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-xs py-0.5 hover:bg-panel-hover rounded px-1"
          >
            <span className="text-gray-600 w-16 text-right flex-shrink-0">
              {formatTime(event.timestamp)}
            </span>
            <span
              className={`w-8 text-center flex-shrink-0 ${
                event.hookType === "pre"
                  ? "text-accent-orange"
                  : "text-accent-green"
              }`}
            >
              {event.hookType}
            </span>
            <span className="text-accent-blue">{event.hookName}</span>
            {event.result && (
              <span className="text-gray-500 truncate">{event.result}</span>
            )}
          </div>
        ))
      )}
    </div>
  );
}
