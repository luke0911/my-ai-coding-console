/**
 * Claude SDK client: uses @anthropic-ai/claude-agent-sdk query() to run
 * Claude Code agent directly, without needing the CLI installed.
 *
 * Falls back to this when the CLI is unavailable but ANTHROPIC_API_KEY is set.
 */

import { v4 as uuid } from "uuid";
import { eventBus } from "./event-bus.js";
import { emitToolSpecificEvents } from "./claude-client.js";

export interface ClaudeSdkSessionOptions {
  sessionId: string;
  prompt: string;
  workspacePath: string;
  model?: string;
  resumeSessionId?: string;
}

/** Maps our sessionId → SDK session_id for resume */
const sdkSessionIds = new Map<string, string>();

export function getSdkSessionId(sessionId: string): string | undefined {
  return sdkSessionIds.get(sessionId);
}

export async function runClaudeSdkSession(
  options: ClaudeSdkSessionOptions
): Promise<void> {
  const { sessionId, prompt, workspacePath, model, resumeSessionId } = options;
  const selectedModel = model ?? "claude-sonnet-4-5-20250929";
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다");
  }

  // Dynamic import to avoid crash if the package has issues
  const { query } = await import("@anthropic-ai/claude-agent-sdk");

  if (!resumeSessionId) {
    eventBus.emit({
      type: "session:created",
      sessionId,
      workspacePath,
      model: selectedModel,
      provider: "claude",
      timestamp: Date.now(),
    });
  }

  eventBus.emit({
    type: "stage:change",
    sessionId,
    timestamp: Date.now(),
    stage: "thinking",
    description: resumeSessionId ? "대화 이어가는 중 (SDK)..." : "Claude SDK 실행 중...",
  });

  const koreanInstruction =
    "중요: 모든 응답, 계획, 추론 요약, 설명을 한국어로 작성해주세요. " +
    "코드와 기술 용어는 영어 그대로 두되, 설명과 대화는 반드시 한국어로 해주세요.";

  const fullPrompt = `${koreanInstruction}\n\n${prompt}`;

  const q = query({
    prompt: fullPrompt,
    options: {
      model: selectedModel,
      cwd: workspacePath,
      maxTurns: 50,
      permissionMode: "bypassPermissions" as any,
      allowDangerouslySkipPermissions: true,
      resume: resumeSessionId,
      env: { ...process.env, ANTHROPIC_API_KEY: apiKey },
    },
  });

  let currentToolId: string | null = null;
  let toolStartTime = 0;

  try {
    for await (const message of q) {
      switch (message.type) {
        case "system": {
          if (message.subtype === "init") {
            sdkSessionIds.set(sessionId, message.session_id);
            eventBus.emit({
              type: "stage:change",
              sessionId,
              timestamp: Date.now(),
              stage: "coding",
              description: "Claude SDK 세션 시작됨",
            });
          }
          break;
        }

        case "assistant": {
          const msg = message.message;
          if (!msg || !msg.content) break;

          for (const block of msg.content as any[]) {
            if (block.type === "text" && block.text) {
              eventBus.emit({
                type: "agent:response",
                sessionId,
                timestamp: Date.now(),
                content: block.text,
                partial: true,
              });
            }

            if (block.type === "tool_use") {
              currentToolId = block.id;
              toolStartTime = Date.now();

              eventBus.emit({
                type: "tool:call",
                sessionId,
                timestamp: Date.now(),
                toolName: block.name,
                toolId: block.id,
                parameters: block.input ?? {},
              });

              emitToolSpecificEvents(sessionId, block.name, block.input ?? {});
            }

            if (block.type === "tool_result") {
              const toolDuration = currentToolId ? Date.now() - toolStartTime : 0;
              const content = Array.isArray(block.content)
                ? block.content
                    .map((c: any) => (c.type === "text" ? c.text : ""))
                    .join("")
                : typeof block.content === "string"
                  ? block.content
                  : "";

              eventBus.emit({
                type: "tool:result",
                sessionId,
                timestamp: Date.now(),
                toolId: currentToolId ?? block.tool_use_id ?? "",
                toolName: "",
                result: content.slice(0, 500),
                success: !block.is_error,
                durationMs: toolDuration,
              });

              currentToolId = null;
              toolStartTime = 0;
            }
          }

          // Token update
          if (msg.usage) {
            eventBus.emit({
              type: "token:update",
              sessionId,
              timestamp: Date.now(),
              inputTokens: (msg.usage as any).input_tokens ?? 0,
              outputTokens: (msg.usage as any).output_tokens ?? 0,
              cacheReadTokens: (msg.usage as any).cache_read_input_tokens ?? 0,
              cacheWriteTokens: (msg.usage as any).cache_creation_input_tokens ?? 0,
              totalCostUsd: 0,
              contextBudgetRemaining: -1,
            });
          }
          break;
        }

        case "result": {
          const isSuccess = message.subtype === "success";

          eventBus.emit({
            type: "agent:response",
            sessionId,
            timestamp: Date.now(),
            content: "",
            partial: false,
          });

          if (message.usage) {
            eventBus.emit({
              type: "token:update",
              sessionId,
              timestamp: Date.now(),
              inputTokens: message.usage.input_tokens ?? 0,
              outputTokens: message.usage.output_tokens ?? 0,
              cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
              cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
              totalCostUsd: message.total_cost_usd ?? 0,
              contextBudgetRemaining: -1,
            });
          }

          eventBus.emit({
            type: "stage:change",
            sessionId,
            timestamp: Date.now(),
            stage: isSuccess ? "completed" : "error",
            description: isSuccess ? "세션 완료" : `오류: ${message.subtype}`,
          });

          eventBus.emit({
            type: "session:completed",
            sessionId,
            timestamp: Date.now(),
            summary: isSuccess
              ? (message as any).result ?? "완료"
              : "오류 발생",
          });
          break;
        }
      }
    }
  } catch (err) {
    eventBus.emit({
      type: "stage:change",
      sessionId,
      timestamp: Date.now(),
      stage: "error",
      description: `SDK 오류: ${err instanceof Error ? err.message : String(err)}`,
    });

    eventBus.emit({
      type: "session:completed",
      sessionId,
      timestamp: Date.now(),
      summary: `SDK 오류: ${err instanceof Error ? err.message : String(err)}`,
    });

    throw err;
  }
}
