"use client";

import { useWebSocket } from "@/hooks/useWebSocket";
import { Sidebar } from "@/components/layout/Sidebar";
import { CenterPanel } from "@/components/layout/CenterPanel";
import { RightPanel } from "@/components/layout/RightPanel";
import { BottomPanel } from "@/components/layout/BottomPanel";
import { ApprovalDialog } from "@/components/approval/ApprovalDialog";
import { useSessionStore } from "@/store/session-store";

export default function Home() {
  const { send, reconnect, reconnecting, reconnectCount } = useWebSocket();
  const connected = useSessionStore((s) => s.connected);
  const activeConsoleId = useSessionStore((s) => s.activeConsoleId);

  // Collect pending approvals across all open sessions
  const firstApproval = useSessionStore((s) => {
    for (const id of s.openConsoles) {
      const data = s.sessionData[id];
      if (data?.pendingApprovals?.length > 0) {
        return { sessionId: id, approval: data.pendingApprovals[0] };
      }
    }
    return null;
  });

  return (
    <div className="flex flex-col h-screen">
      {/* Connection status bar */}
      <header
        className="flex items-center justify-between h-9 pl-20 pr-4 bg-panel-header border-b border-panel-border text-xs flex-shrink-0"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div className="flex items-center gap-2">
          <span className="font-bold text-accent-blue">AI 코딩 콘솔</span>
          <span className="text-gray-500">v1.0</span>
        </div>
        <div className="flex items-center gap-3" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <div className="flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full ${
                connected
                  ? "bg-accent-green"
                  : reconnecting
                    ? "bg-accent-orange animate-pulse"
                    : "bg-accent-red animate-pulse-slow"
              }`}
            />
            <span className="text-gray-400">
              {connected
                ? "연결됨"
                : reconnecting
                  ? `재연결 중${reconnectCount > 0 ? ` (${reconnectCount}회)` : "..."}`
                  : "연결 끊김"}
            </span>
            {!connected && !reconnecting && (
              <button
                onClick={reconnect}
                className="ml-1 px-2 py-0.5 text-[10px] bg-accent-blue/20 text-accent-blue rounded hover:bg-accent-blue/30 transition-colors"
              >
                재연결
              </button>
            )}
            {!connected && reconnecting && (
              <button
                onClick={reconnect}
                className="ml-1 px-2 py-0.5 text-[10px] bg-accent-orange/20 text-accent-orange rounded hover:bg-accent-orange/30 transition-colors"
              >
                다시 시도
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main layout: sidebar + center + right */}
      <div className="flex flex-1 overflow-auto">
        <div className="flex min-w-[900px] w-full h-full">
        <Sidebar send={send} />

        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Center + Right panels */}
          <div className="flex flex-1 overflow-hidden">
            <CenterPanel send={send} />
            <RightPanel sessionId={activeConsoleId} />
          </div>

          {/* Bottom panel */}
          <BottomPanel sessionId={activeConsoleId} />
        </div>
      </div>
      </div>

      {/* Approval dialog overlay */}
      {firstApproval && (
        <ApprovalDialog
          sessionId={firstApproval.sessionId}
          approval={firstApproval.approval}
          send={send}
        />
      )}
    </div>
  );
}
