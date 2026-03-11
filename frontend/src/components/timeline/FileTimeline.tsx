"use client";

import { useSessionStore } from "@/store/session-store";
import { formatTime, truncatePath } from "@/lib/utils";

/**
 * FileTimeline: horizontal timeline showing file changes in chronological order.
 * Clicking a file change switches the center panel to the diff view.
 */

export function FileTimeline({ sessionId }: { sessionId: string }) {
  const fileChanges = useSessionStore((s) => s.sessionData[sessionId]?.fileChanges ?? []);
  const diffs = useSessionStore((s) => s.sessionData[sessionId]?.diffs ?? []);
  const updateSessionData = useSessionStore((s) => s.updateSessionData);
  const setSelectedPanel = useSessionStore((s) => s.setSelectedPanel);

  if (fileChanges.length === 0) return null;

  return (
    <div className="border-t border-panel-border bg-panel-header px-3 py-2 overflow-x-auto">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500 flex-shrink-0">
          파일 변경:
        </span>
        <div className="flex items-center gap-1">
          {fileChanges.map((fc, i) => {
            const hasDiff = diffs.some((d) => d.filePath === fc.filePath);
            return (
              <button
                key={i}
                onClick={() => {
                  if (hasDiff) {
                    const diff = diffs.find((d) => d.filePath === fc.filePath);
                    if (diff) {
                      updateSessionData(sessionId, () => ({ selectedDiff: diff }));
                      setSelectedPanel("diff");
                    }
                  }
                }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors ${
                  hasDiff
                    ? "bg-accent-orange/10 text-accent-orange hover:bg-accent-orange/20 cursor-pointer"
                    : "bg-accent-green/10 text-accent-green"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    fc.changeType === "created"
                      ? "bg-accent-green"
                      : fc.changeType === "deleted"
                        ? "bg-accent-red"
                        : "bg-accent-orange"
                  }`}
                />
                {truncatePath(fc.filePath, 20)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
