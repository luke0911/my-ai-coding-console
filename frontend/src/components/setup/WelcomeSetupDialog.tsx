"use client";

import { useState } from "react";
import { useSessionStore } from "@/store/session-store";
import type { ClientMessage } from "@my-ai-console/shared";

interface WelcomeSetupDialogProps {
  send: (msg: ClientMessage) => void;
}

export function WelcomeSetupDialog({ send }: WelcomeSetupDialogProps) {
  const setShowWelcomeDialog = useSessionStore((s) => s.setShowWelcomeDialog);
  const connectionDetail = useSessionStore((s) => s.connectionDetail);
  const hasStoredKeys = useSessionStore((s) => s.hasStoredKeys);

  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicSet, setAnthropicSet] = useState(false);
  const [openaiSet, setOpenaiSet] = useState(false);

  const claudeConnected = connectionDetail.claudeCli || connectionDetail.claudeSdk || anthropicSet || hasStoredKeys.anthropic;
  const codexConnected = connectionDetail.codexCli || connectionDetail.codexSdk || openaiSet || hasStoredKeys.openai;
  const anyConnected = claudeConnected || codexConnected;

  const handleAnthropicSubmit = () => {
    const key = anthropicKey.trim();
    if (!key) return;
    send({ type: "apikey:set", apiKey: key });
    setAnthropicSet(true);
    setAnthropicKey("");
  };

  const handleOpenAiSubmit = () => {
    const key = openaiKey.trim();
    if (!key) return;
    send({ type: "openaikey:set", apiKey: key });
    setOpenaiSet(true);
    setOpenaiKey("");
  };

  const handleSkip = () => {
    setShowWelcomeDialog(false);
  };

  const handleStart = () => {
    setShowWelcomeDialog(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-panel-header border border-panel-border rounded-xl shadow-2xl w-[440px] max-w-[95vw] overflow-hidden">
        {/* Header */}
        <div className="p-5 pb-3">
          <h2 className="text-base font-bold text-gray-200">
            AI 코딩 콘솔 시작하기
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            최소 하나의 프로바이더를 설정하세요
          </p>
        </div>

        {/* Provider cards */}
        <div className="px-5 space-y-3">
          {/* Claude (Anthropic) */}
          <div className="border border-panel-border rounded-lg p-3 bg-panel-bg/50">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    claudeConnected ? "bg-accent-green" : "bg-gray-600"
                  }`}
                />
                <span className="text-sm font-medium text-gray-300">
                  Claude (Anthropic)
                </span>
              </div>
              {claudeConnected && (
                <span className="text-[10px] text-accent-green bg-accent-green/10 px-1.5 py-0.5 rounded">
                  {connectionDetail.claudeCli
                    ? "CLI"
                    : hasStoredKeys.anthropic
                      ? "API (저장됨)"
                      : "API"}
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-500 mb-2">
              Claude Sonnet, Opus 등
            </p>

            {!claudeConnected ? (
              <>
                <div className="flex gap-1">
                  <input
                    type="password"
                    value={anthropicKey}
                    onChange={(e) => setAnthropicKey(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleAnthropicSubmit()
                    }
                    className="flex-1 min-w-0 text-xs bg-panel-bg border border-panel-border rounded px-2 py-1.5 text-gray-300 focus:border-accent-blue focus:outline-none placeholder:text-gray-600"
                    placeholder="sk-ant-..."
                  />
                  <button
                    onClick={handleAnthropicSubmit}
                    disabled={!anthropicKey.trim()}
                    className="px-3 py-1.5 text-xs bg-accent-blue text-white rounded hover:bg-accent-blue/80 disabled:opacity-30 flex-shrink-0 transition-colors"
                  >
                    설정
                  </button>
                </div>
                <div className="mt-1.5 text-right">
                  <button
                    onClick={() =>
                      window.electronAPI?.openExternal(
                        "https://console.anthropic.com/settings/keys"
                      )
                    }
                    className="text-[10px] text-accent-blue hover:text-accent-blue/80 transition-colors"
                  >
                    API 키 발급받기 &rarr;
                  </button>
                </div>
              </>
            ) : (
              <div className="text-[10px] text-gray-500">설정 완료</div>
            )}
          </div>

          {/* OpenAI (Codex) */}
          <div className="border border-panel-border rounded-lg p-3 bg-panel-bg/50">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    codexConnected ? "bg-accent-green" : "bg-gray-600"
                  }`}
                />
                <span className="text-sm font-medium text-gray-300">
                  OpenAI (Codex)
                </span>
              </div>
              {codexConnected && (
                <span className="text-[10px] text-accent-green bg-accent-green/10 px-1.5 py-0.5 rounded">
                  {connectionDetail.codexCli
                    ? "CLI"
                    : hasStoredKeys.openai
                      ? "API (저장됨)"
                      : "API"}
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-500 mb-2">
              GPT-5 Codex, o4-mini 등
            </p>

            {!codexConnected ? (
              <>
                <div className="flex gap-1">
                  <input
                    type="password"
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleOpenAiSubmit()
                    }
                    className="flex-1 min-w-0 text-xs bg-panel-bg border border-panel-border rounded px-2 py-1.5 text-gray-300 focus:border-accent-blue focus:outline-none placeholder:text-gray-600"
                    placeholder="sk-..."
                  />
                  <button
                    onClick={handleOpenAiSubmit}
                    disabled={!openaiKey.trim()}
                    className="px-3 py-1.5 text-xs bg-accent-blue text-white rounded hover:bg-accent-blue/80 disabled:opacity-30 flex-shrink-0 transition-colors"
                  >
                    설정
                  </button>
                </div>
                <div className="mt-1.5 text-right">
                  <button
                    onClick={() =>
                      window.electronAPI?.openExternal(
                        "https://platform.openai.com/api-keys"
                      )
                    }
                    className="text-[10px] text-accent-blue hover:text-accent-blue/80 transition-colors"
                  >
                    API 키 발급받기 &rarr;
                  </button>
                </div>
              </>
            ) : (
              <div className="text-[10px] text-gray-500">설정 완료</div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 pt-4 flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
          >
            건너뛰기 (모의 모드)
          </button>
          <button
            onClick={handleStart}
            disabled={!anyConnected}
            className="px-4 py-1.5 text-xs font-medium bg-accent-blue text-white rounded-lg hover:bg-accent-blue/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            시작하기
          </button>
        </div>
      </div>
    </div>
  );
}
