"use client";

import { useState, useRef, useCallback } from "react";
import { useAnalysisStore } from "@/store/analysis-store";
import { useSessionStore } from "@/store/session-store";

export function DataUploadZone() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const setUploadResult = useAnalysisStore((s) => s.setUploadResult);
  const setError = useAnalysisStore((s) => s.setError);
  const provider = useSessionStore((s) => s.provider);
  const model = useSessionStore((s) => s.model);

  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setUploadProgress(`"${file.name}" 업로드 중...`);
      setError(null);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("provider", provider);
        formData.append("model", model);

        const res = await fetch("http://localhost:3001/api/data/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "업로드 실패");
        }

        const data = await res.json();
        setUploadResult({
          analysisId: data.analysisId,
          schema: data.schema,
          preview: data.preview,
        });
        setUploadProgress("");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "업로드 실패";
        setError(message);
        setUploadProgress("");
      } finally {
        setUploading(false);
      }
    },
    [provider, model, setUploadResult, setError]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const handleElectronSelect = useCallback(async () => {
    const filePath = await window.electronAPI?.selectDataFile();
    if (!filePath) return;

    // Read file from path via fetch (Electron can access local files)
    // We need to create a File object from the path
    const fileName = filePath.split("/").pop() ?? filePath.split("\\").pop() ?? "file";

    try {
      const response = await fetch(`file://${filePath}`);
      const blob = await response.blob();
      const file = new File([blob], fileName);
      uploadFile(file);
    } catch {
      // Fallback: use file input
      fileInputRef.current?.click();
    }
  }, [uploadFile]);

  const handleClick = useCallback(() => {
    if (window.electronAPI?.selectDataFile) {
      handleElectronSelect();
    } else {
      fileInputRef.current?.click();
    }
  }, [handleElectronSelect]);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        className={`w-full max-w-lg p-12 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
          isDragging
            ? "border-accent-blue bg-accent-blue/5"
            : "border-panel-border hover:border-gray-500 hover:bg-panel-hover/30"
        }`}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-accent-purple/10 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-accent-purple"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
          </div>

          {uploading ? (
            <>
              <div className="w-full bg-panel-border rounded-full h-1.5">
                <div className="bg-accent-purple h-1.5 rounded-full animate-pulse w-2/3" />
              </div>
              <p className="text-sm text-gray-400">{uploadProgress}</p>
            </>
          ) : (
            <>
              <div>
                <p className="text-gray-200 font-medium">
                  데이터 파일을 드래그하거나 클릭하여 선택
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  CSV, Excel (.xlsx), TXT 파일 지원 (최대 50MB)
                </p>
              </div>

              <div className="flex gap-2">
                {["CSV", "XLSX", "TXT"].map((ext) => (
                  <span
                    key={ext}
                    className="px-2 py-0.5 text-[10px] rounded bg-panel-header text-gray-400 border border-panel-border"
                  >
                    .{ext.toLowerCase()}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.txt,.tsv"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    </div>
  );
}
