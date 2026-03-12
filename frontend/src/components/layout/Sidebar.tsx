"use client";

import { useState } from "react";
import { useSessionStore } from "@/store/session-store";
import { TokenDashboard } from "@/components/tokens/TokenDashboard";
import { truncatePath } from "@/lib/utils";
import { PROVIDER_MODELS } from "@my-ai-console/shared";
import type { ClientMessage, CodingProvider } from "@my-ai-console/shared";

const PROVIDER_LABELS: Record<CodingProvider, string> = {
  claude: "Claude Code",
  codex: "OpenAI Codex",
};

const STAGE_COLORS: Record<string, string> = {
  idle: "text-gray-500",
  thinking: "text-accent-blue",
  planning: "text-accent-purple",
  coding: "text-accent-green",
  testing: "text-accent-orange",
  reviewing: "text-accent-blue",
  completed: "text-accent-green",
  error: "text-accent-red",
  waiting_approval: "text-accent-orange",
};

const STAGE_LABELS: Record<string, string> = {
  idle: "대기 중",
  thinking: "생각 중...",
  planning: "계획 수립 중...",
  coding: "코딩 중...",
  testing: "테스트 중...",
  reviewing: "검토 중...",
  completed: "완료",
  error: "오류",
  waiting_approval: "승인 대기 중",
};

interface SidebarProps {
  send: (msg: ClientMessage) => void;
}

export function Sidebar({ send }: SidebarProps) {
  const mockMode = useSessionStore((s) => s.mockMode);
  const activeConsoleId = useSessionStore((s) => s.activeConsoleId);
  const activeData = useSessionStore((s) =>
    s.activeConsoleId ? s.sessionData[s.activeConsoleId] : null
  );
  const updateSessionData = useSessionStore((s) => s.updateSessionData);
  const model = useSessionStore((s) => s.model);
  const setModel = useSessionStore((s) => s.setModel);
  const provider = useSessionStore((s) => s.provider);
  const setProvider = useSessionStore((s) => s.setProvider);
  const providerAvailability = useSessionStore((s) => s.providerAvailability);
  const approvalConfig = useSessionStore((s) => s.approvalConfig);

  const stage = activeData?.stage ?? "idle";
  const fileChanges = activeData?.fileChanges ?? [];
  const toolActivities = activeData?.toolActivities ?? {};
  const workspacePath = activeData?.workspacePath ?? "";

  return (
    <aside className="w-64 flex-shrink-0 border-r border-panel-border bg-panel-header flex flex-col overflow-hidden">
      {/* Auth status */}
      <AuthSection send={send} mockMode={mockMode} provider={provider} />

      {/* Provider, Model & workspace */}
      <div className="p-3 border-b border-panel-border">
        <div className="text-xs text-gray-500 mb-1">프로바이더</div>
        <div className="flex gap-1 mb-2">
          {(["claude", "codex"] as CodingProvider[]).map((p) => {
            const available = providerAvailability[p];
            const active = provider === p;
            return (
              <button
                key={p}
                onClick={() => {
                  setProvider(p);
                  // Auto-select first model for this provider
                  const firstModel = PROVIDER_MODELS.find((m) => m.provider === p);
                  if (firstModel) setModel(firstModel.id);
                  // Also update active session's provider
                  if (activeConsoleId) {
                    updateSessionData(activeConsoleId, () => ({ provider: p }));
                  }
                }}
                disabled={!available}
                className={`flex-1 text-[10px] px-1.5 py-1 rounded transition-colors ${
                  active
                    ? "bg-accent-blue/20 text-accent-blue border border-accent-blue/40"
                    : available
                      ? "bg-panel-bg text-gray-500 border border-panel-border hover:text-gray-300 hover:border-gray-600"
                      : "bg-panel-bg text-gray-700 border border-panel-border cursor-not-allowed opacity-50"
                }`}
                title={available ? PROVIDER_LABELS[p] : `${PROVIDER_LABELS[p]} (미설치)`}
              >
                {p === "claude" ? "Claude" : "Codex"}
                {!available && <span className="ml-0.5 text-accent-orange">!</span>}
              </button>
            );
          })}
        </div>

        <div className="text-xs text-gray-500 mb-1">모델</div>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full text-xs bg-panel-bg border border-panel-border rounded px-2 py-1.5 text-accent-blue font-medium focus:border-accent-blue focus:outline-none cursor-pointer appearance-none"
        >
          {PROVIDER_MODELS.filter((m) => m.provider === provider).map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        {mockMode && (
          <span className="text-[10px] bg-accent-orange/20 text-accent-orange px-1.5 py-0.5 rounded mt-1 inline-block">
            모의 모드
          </span>
        )}
        <div className="text-xs text-gray-500 mt-2 mb-1">작업 폴더</div>
        <div className="flex gap-1">
          <input
            type="text"
            value={workspacePath}
            onChange={(e) => {
              if (activeConsoleId) updateSessionData(activeConsoleId, () => ({ workspacePath: e.target.value }));
            }}
            className="flex-1 min-w-0 text-xs bg-panel-bg border border-panel-border rounded px-2 py-1 text-gray-300 focus:border-accent-blue focus:outline-none"
            placeholder="/path/to/workspace"
          />
          <button
            onClick={async () => {
              const folder = await window.electronAPI?.selectFolder();
              if (folder && activeConsoleId) updateSessionData(activeConsoleId, () => ({ workspacePath: folder }));
            }}
            className="px-2 py-1 text-xs bg-panel-bg border border-panel-border rounded text-gray-400 hover:text-accent-blue hover:border-accent-blue transition-colors flex-shrink-0"
            title="폴더 선택"
          >
            ...
          </button>
        </div>
        <div className="text-[10px] text-gray-600 mt-1 truncate">
          {workspacePath || "폴더를 선택하세요"}
        </div>
      </div>

      {/* Stage indicator */}
      <div className="p-3 border-b border-panel-border">
        <div className="text-xs text-gray-500 mb-1">현재 단계</div>
        <div className={`text-sm font-medium ${STAGE_COLORS[stage] ?? "text-gray-400"}`}>
          {stage !== "idle" && (
            <span className="inline-block w-2 h-2 rounded-full bg-current mr-2 animate-pulse-slow" />
          )}
          {STAGE_LABELS[stage] ?? stage}
        </div>
      </div>

      {/* Approval mode toggle */}
      <div className="p-3 border-b border-panel-border">
        <div className="text-xs text-gray-500 mb-1">승인 모드</div>
        <div className="flex gap-1">
          <button
            onClick={() =>
              send({ type: "config:update", approvalMode: "auto" })
            }
            className={`text-xs px-2 py-1 rounded ${
              approvalConfig.mode === "auto"
                ? "bg-accent-green/20 text-accent-green"
                : "bg-panel-bg text-gray-500 hover:text-gray-300"
            }`}
          >
            자동
          </button>
          <button
            onClick={() =>
              send({ type: "config:update", approvalMode: "manual" })
            }
            className={`text-xs px-2 py-1 rounded ${
              approvalConfig.mode === "manual"
                ? "bg-accent-orange/20 text-accent-orange"
                : "bg-panel-bg text-gray-500 hover:text-gray-300"
            }`}
          >
            수동
          </button>
        </div>
      </div>

      {/* Token dashboard */}
      <TokenDashboard />

      {/* Changed files */}
      <div className="p-3 border-b border-panel-border flex-shrink-0">
        <div className="text-xs text-gray-500 mb-1.5">
          변경된 파일 ({fileChanges.length})
        </div>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {fileChanges.length === 0 ? (
            <div className="text-xs text-gray-600">아직 변경 없음</div>
          ) : (
            fileChanges.map((fc) => (
              <div
                key={fc.filePath}
                className="text-xs flex items-center gap-1.5 hover:bg-panel-hover rounded px-1 py-0.5 cursor-pointer"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    fc.changeType === "created"
                      ? "bg-accent-green"
                      : fc.changeType === "deleted"
                        ? "bg-accent-red"
                        : "bg-accent-orange"
                  }`}
                />
                <span className="text-gray-300 truncate">
                  {truncatePath(fc.filePath, 30)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Tool activity */}
      <div className="p-3 border-b border-panel-border flex-shrink-0">
        <div className="text-xs text-gray-500 mb-1.5">도구 활동</div>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {Object.keys(toolActivities).length === 0 ? (
            <div className="text-xs text-gray-600">도구 호출 없음</div>
          ) : (
            Object.values(toolActivities).map((ta) => (
              <div
                key={ta.toolName}
                className="text-xs flex items-center justify-between"
              >
                <span className="text-accent-blue">{ta.toolName}</span>
                <span className="text-gray-500">
                  {ta.callCount}x &middot;{" "}
                  {ta.avgDurationMs > 0 ? `${Math.round(ta.avgDurationMs)}ms` : "..."}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

    </aside>
  );
}

/**
 * Auth section: shows both providers at a glance with connection status.
 * "발급받기" links are always visible. A "설정" button reopens the welcome dialog.
 */
function AuthSection({
  send,
  mockMode,
}: {
  send: (msg: ClientMessage) => void;
  mockMode: boolean;
  provider: CodingProvider;
}) {
  const [anthropicInput, setAnthropicInput] = useState("");
  const [openaiInput, setOpenaiInput] = useState("");
  const [showClaudeInput, setShowClaudeInput] = useState(false);
  const [showCodexInput, setShowCodexInput] = useState(false);
  const connectionDetail = useSessionStore((s) => s.connectionDetail);
  const hasStoredKeys = useSessionStore((s) => s.hasStoredKeys);
  const setShowWelcomeDialog = useSessionStore((s) => s.setShowWelcomeDialog);

  const claudeConnected = connectionDetail.claudeCli || connectionDetail.claudeSdk;
  const codexConnected = connectionDetail.codexCli || connectionDetail.codexSdk;

  const claudeMethod = connectionDetail.claudeCli
    ? "CLI"
    : hasStoredKeys.anthropic
      ? "API (저장됨)"
      : connectionDetail.claudeSdk
        ? "API"
        : null;

  const codexMethod = connectionDetail.codexCli
    ? "CLI"
    : hasStoredKeys.openai
      ? "API (저장됨)"
      : connectionDetail.codexSdk
        ? "API"
        : null;

  return (
    <div className="p-3 border-b border-panel-border">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-500">인증</span>
        <button
          onClick={() => setShowWelcomeDialog(true)}
          className="text-[10px] text-accent-blue hover:text-accent-blue/80 transition-colors"
        >
          설정
        </button>
      </div>

      {/* Claude row */}
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            claudeConnected ? "bg-accent-green" : "bg-gray-600"
          }`}
        />
        <span className="text-[11px] text-gray-300 flex-shrink-0">Claude</span>
        {claudeConnected ? (
          <>
            <span className="text-[10px] text-gray-500 ml-auto">
              {claudeMethod}
            </span>
            {hasStoredKeys.anthropic && !connectionDetail.claudeCli && (
              <button
                onClick={() => {
                  send({ type: "apikey:set", apiKey: "" });
                }}
                className="text-[10px] text-gray-600 hover:text-gray-400 ml-1"
                title="키 해제"
              >
                &times;
              </button>
            )}
          </>
        ) : (
          <div className="flex items-center gap-1.5 ml-auto">
            {!showClaudeInput ? (
              <button
                onClick={() => setShowClaudeInput(true)}
                className="text-[10px] text-gray-500 hover:text-gray-300"
              >
                키 입력
              </button>
            ) : null}
            <span className="text-gray-700">|</span>
            <button
              onClick={() =>
                window.electronAPI?.openExternal(
                  "https://console.anthropic.com/settings/keys"
                )
              }
              className="text-[10px] text-accent-blue hover:text-accent-blue/80"
            >
              발급받기
            </button>
          </div>
        )}
      </div>
      {showClaudeInput && !claudeConnected && (
        <div className="flex gap-1 mb-1.5 ml-3">
          <input
            type="password"
            value={anthropicInput}
            onChange={(e) => setAnthropicInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const key = anthropicInput.trim();
                if (key) {
                  send({ type: "apikey:set", apiKey: key });
                  setAnthropicInput("");
                  setShowClaudeInput(false);
                }
              }
            }}
            className="flex-1 min-w-0 text-[11px] bg-panel-bg border border-panel-border rounded px-1.5 py-0.5 text-gray-300 focus:border-accent-blue focus:outline-none"
            placeholder="sk-ant-..."
            autoFocus
          />
          <button
            onClick={() => {
              const key = anthropicInput.trim();
              if (key) {
                send({ type: "apikey:set", apiKey: key });
                setAnthropicInput("");
                setShowClaudeInput(false);
              }
            }}
            disabled={!anthropicInput.trim()}
            className="px-1.5 py-0.5 text-[10px] bg-accent-blue text-white rounded hover:bg-accent-blue/80 disabled:opacity-30 flex-shrink-0"
          >
            설정
          </button>
        </div>
      )}

      {/* Codex row */}
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            codexConnected ? "bg-accent-green" : "bg-gray-600"
          }`}
        />
        <span className="text-[11px] text-gray-300 flex-shrink-0">Codex</span>
        {codexConnected ? (
          <>
            <span className="text-[10px] text-gray-500 ml-auto">
              {codexMethod}
            </span>
            {hasStoredKeys.openai && !connectionDetail.codexCli && (
              <button
                onClick={() => {
                  send({ type: "openaikey:set", apiKey: "" });
                }}
                className="text-[10px] text-gray-600 hover:text-gray-400 ml-1"
                title="키 해제"
              >
                &times;
              </button>
            )}
          </>
        ) : (
          <div className="flex items-center gap-1.5 ml-auto">
            {!showCodexInput ? (
              <button
                onClick={() => setShowCodexInput(true)}
                className="text-[10px] text-gray-500 hover:text-gray-300"
              >
                키 입력
              </button>
            ) : null}
            <span className="text-gray-700">|</span>
            <button
              onClick={() =>
                window.electronAPI?.openExternal(
                  "https://platform.openai.com/api-keys"
                )
              }
              className="text-[10px] text-accent-blue hover:text-accent-blue/80"
            >
              발급받기
            </button>
          </div>
        )}
      </div>
      {showCodexInput && !codexConnected && (
        <div className="flex gap-1 mb-1.5 ml-3">
          <input
            type="password"
            value={openaiInput}
            onChange={(e) => setOpenaiInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const key = openaiInput.trim();
                if (key) {
                  send({ type: "openaikey:set", apiKey: key });
                  setOpenaiInput("");
                  setShowCodexInput(false);
                }
              }
            }}
            className="flex-1 min-w-0 text-[11px] bg-panel-bg border border-panel-border rounded px-1.5 py-0.5 text-gray-300 focus:border-accent-blue focus:outline-none"
            placeholder="sk-..."
            autoFocus
          />
          <button
            onClick={() => {
              const key = openaiInput.trim();
              if (key) {
                send({ type: "openaikey:set", apiKey: key });
                setOpenaiInput("");
                setShowCodexInput(false);
              }
            }}
            disabled={!openaiInput.trim()}
            className="px-1.5 py-0.5 text-[10px] bg-accent-blue text-white rounded hover:bg-accent-blue/80 disabled:opacity-30 flex-shrink-0"
          >
            설정
          </button>
        </div>
      )}

      {mockMode && (
        <div className="mt-1">
          <span className="text-[10px] bg-accent-orange/20 text-accent-orange px-1.5 py-0.5 rounded">
            모의 모드
          </span>
        </div>
      )}
    </div>
  );
}
