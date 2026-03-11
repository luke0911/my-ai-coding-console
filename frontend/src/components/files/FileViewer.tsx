"use client";

import { useSessionStore } from "@/store/session-store";
import { getFileExtension, extToLanguage } from "@/lib/utils";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.default),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full text-xs text-gray-600">편집기 로딩 중...</div> }
);

export function FileViewer({ sessionId }: { sessionId: string }) {
  const currentFile = useSessionStore((s) => s.sessionData[sessionId]?.currentFile ?? null);

  if (!currentFile) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-600 italic">
        선택된 파일 없음. 에이전트가 파일을 읽거나 쓸 때 여기에 표시됩니다.
      </div>
    );
  }

  const ext = getFileExtension(currentFile.path);
  const language = extToLanguage(ext);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 text-xs text-gray-400 bg-panel-header border-b border-panel-border">
        {currentFile.path}
      </div>
      <div className="flex-1">
        <MonacoEditor
          value={currentFile.content}
          language={language}
          theme="vs-dark"
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
          }}
        />
      </div>
    </div>
  );
}
