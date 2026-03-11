"use client";

import { useRef, useEffect } from "react";
import { useSessionStore } from "@/store/session-store";

/**
 * TerminalPanel: displays command output in a terminal-style view.
 *
 * Design decision: Using a simple pre-formatted text area instead of xterm.js
 * for the MVP. xterm.js provides better rendering for ANSI escape codes,
 * but the simple approach works well for displaying captured output.
 *
 * Extension point: Replace the <pre> with an xterm.js Terminal instance
 * for full ANSI color support and interactive terminal features.
 */

export function TerminalPanel({ sessionId }: { sessionId: string }) {
  const terminalOutput = useSessionStore((s) => s.sessionData[sessionId]?.terminalOutput ?? "");
  const scrollRef = useRef<HTMLPreElement>(null);

  // Auto-scroll on new output
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  return (
    <div className="h-full bg-[#0a0e14] p-2 overflow-hidden">
      <pre
        ref={scrollRef}
        className="h-full overflow-y-auto text-xs text-gray-300 font-mono whitespace-pre-wrap leading-relaxed"
      >
        {terminalOutput || (
          <span className="text-gray-600 italic">
            명령어 실행 시 터미널 출력이 여기에 표시됩니다...
          </span>
        )}
      </pre>
    </div>
  );
}
