"use client";

import { useSessionStore } from "@/store/session-store";
import { formatTime } from "@/lib/utils";
import type { ClientMessage } from "@my-ai-console/shared";

interface SessionListProps {
  send: (msg: ClientMessage) => void;
}

export function SessionList({ send }: SessionListProps) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeConsoleId = useSessionStore((s) => s.activeConsoleId);
  const openConsoles = useSessionStore((s) => s.openConsoles);
  const openConsole = useSessionStore((s) => s.openConsole);
  const setActiveConsole = useSessionStore((s) => s.setActiveConsole);

  const handleResume = (sessionId: string) => {
    if (openConsoles.includes(sessionId)) {
      setActiveConsole(sessionId);
    } else {
      openConsole(sessionId);
      send({ type: "session:resume", sessionId });
    }
  };

  const handleRefresh = () => {
    send({ type: "session:list" });
  };

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-xs text-gray-500">세션 목록</div>
        <button
          onClick={handleRefresh}
          className="text-[10px] text-gray-600 hover:text-gray-400"
        >
          새로고침
        </button>
      </div>

      <div className="space-y-1">
        {sessions.length === 0 ? (
          <div className="text-xs text-gray-600 italic">아직 세션 없음</div>
        ) : (
          sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => handleResume(session.id)}
              className={`w-full text-left p-2 rounded text-xs transition-colors ${
                session.id === activeConsoleId
                  ? "bg-accent-blue/10 border border-accent-blue/30"
                  : openConsoles.includes(session.id)
                    ? "bg-accent-blue/5 border border-accent-blue/10"
                    : "bg-panel-bg hover:bg-panel-hover border border-transparent"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-gray-300 font-medium">
                  {session.id.slice(0, 8)}
                </span>
                <span className="text-[10px] text-gray-600">
                  {formatTime(session.lastActiveAt)}
                </span>
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                프롬프트 {session.promptCount}개{" "}
                &middot; 파일 {session.changedFiles.length}개
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
