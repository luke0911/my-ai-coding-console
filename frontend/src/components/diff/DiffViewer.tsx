"use client";

import { useRef, useEffect } from "react";
import { useSessionStore, type CodeChange } from "@/store/session-store";
import { truncatePath, formatTime } from "@/lib/utils";

/**
 * CodeChanges: scrollable list of code change cards.
 *
 * Shows each file edit/write as a card with before/after code snippets,
 * similar to a GitHub commit diff view.
 */

export function DiffViewer({ sessionId }: { sessionId: string }) {
  const codeChanges = useSessionStore(
    (s) => s.sessionData[sessionId]?.codeChanges ?? []
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [codeChanges.length]);

  if (codeChanges.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-600 italic">
        아직 코드 변경이 없습니다. 파일을 수정하면 여기에 표시됩니다.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {codeChanges.map((change, i) => (
        <ChangeCard key={i} change={change} index={i + 1} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function ChangeCard({ change, index }: { change: CodeChange; index: number }) {
  const fileName = change.filePath.split("/").pop() ?? change.filePath;

  return (
    <div className="border border-panel-border rounded-lg overflow-hidden bg-[#161b22]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-panel-header border-b border-panel-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">#{index}</span>
          <span
            className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
              change.type === "edit"
                ? "bg-accent-orange/15 text-accent-orange"
                : "bg-accent-green/15 text-accent-green"
            }`}
          >
            {change.type === "edit" ? "수정" : "생성"}
          </span>
          <span className="text-xs text-gray-300 font-mono">{fileName}</span>
        </div>
        <span className="text-[10px] text-gray-600">
          {formatTime(change.timestamp)}
        </span>
      </div>

      {/* File path */}
      <div className="px-3 py-1 text-[10px] text-gray-500 font-mono border-b border-panel-border/50">
        {truncatePath(change.filePath, 80)}
      </div>

      {/* Content */}
      {change.type === "edit" && change.oldString && change.newString ? (
        <EditDiff oldString={change.oldString} newString={change.newString} />
      ) : change.type === "write" && change.content ? (
        <WritePreview content={change.content} />
      ) : (
        <div className="px-3 py-2 text-xs text-gray-500 italic">
          변경 내용 없음
        </div>
      )}
    </div>
  );
}

function EditDiff({
  oldString,
  newString,
}: {
  oldString: string;
  newString: string;
}) {
  const oldLines = oldString.split("\n");
  const newLines = newString.split("\n");

  return (
    <div className="text-xs font-mono leading-5">
      {/* Removed lines */}
      <div className="border-b border-panel-border/30">
        {oldLines.map((line, i) => (
          <div
            key={`old-${i}`}
            className="px-3 bg-red-500/10 text-red-400/90"
          >
            <span className="inline-block w-5 text-right mr-2 text-red-500/50 select-none">
              -
            </span>
            {line || " "}
          </div>
        ))}
      </div>
      {/* Added lines */}
      <div>
        {newLines.map((line, i) => (
          <div
            key={`new-${i}`}
            className="px-3 bg-green-500/10 text-green-400/90"
          >
            <span className="inline-block w-5 text-right mr-2 text-green-500/50 select-none">
              +
            </span>
            {line || " "}
          </div>
        ))}
      </div>
    </div>
  );
}

function WritePreview({ content }: { content: string }) {
  const lines = content.split("\n");
  const previewLines = lines.slice(0, 20);
  const hasMore = lines.length > 20;

  return (
    <div className="text-xs font-mono leading-5">
      {previewLines.map((line, i) => (
        <div
          key={i}
          className="px-3 bg-green-500/5 text-green-400/80"
        >
          <span className="inline-block w-5 text-right mr-2 text-green-500/30 select-none">
            +
          </span>
          {line || " "}
        </div>
      ))}
      {hasMore && (
        <div className="px-3 py-1.5 text-[10px] text-gray-500 italic bg-panel-header">
          ... {lines.length - 20}줄 더
        </div>
      )}
    </div>
  );
}
