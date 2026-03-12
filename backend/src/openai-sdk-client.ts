/**
 * OpenAI SDK client: uses the openai npm package to run an agent loop
 * with Chat Completions + function calling.
 *
 * Falls back to this when the Codex CLI is unavailable but OPENAI_API_KEY is set.
 */

import { v4 as uuid } from "uuid";
import { eventBus } from "./event-bus.js";
import { OPENAI_TOOL_DEFINITIONS, executeTool } from "./sdk-tools.js";

export interface OpenAiSdkSessionOptions {
  sessionId: string;
  prompt: string;
  workspacePath: string;
  model?: string;
}

const MAX_AGENT_TURNS = 50;

export async function runOpenAiSdkSession(
  options: OpenAiSdkSessionOptions
): Promise<void> {
  const { sessionId, prompt, workspacePath, model } = options;
  const selectedModel = model ?? "o4-mini";
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 설정되지 않았습니다");
  }

  // Dynamic import to avoid crash if openai package is not installed
  let OpenAI: any;
  try {
    const mod = await import("openai");
    OpenAI = mod.default ?? mod.OpenAI ?? mod;
  } catch {
    throw new Error(
      "openai 패키지가 설치되지 않았습니다. `npm install openai`를 실행해주세요."
    );
  }

  const client = new OpenAI({ apiKey });

  eventBus.emit({
    type: "session:created",
    sessionId,
    workspacePath,
    model: selectedModel,
    provider: "codex",
    timestamp: Date.now(),
  });

  eventBus.emit({
    type: "stage:change",
    sessionId,
    timestamp: Date.now(),
    stage: "thinking",
    description: "OpenAI SDK 실행 중...",
  });

  const koreanInstruction =
    "중요: 모든 응답, 계획, 추론 요약, 설명을 한국어로 작성해주세요. " +
    "코드와 기술 용어는 영어 그대로 두되, 설명과 대화는 반드시 한국어로 해주세요.";

  const systemPrompt =
    `당신은 코딩 에이전트입니다. 사용자의 작업 폴더는 ${workspacePath}입니다. ` +
    `제공된 도구를 사용하여 파일을 읽고, 쓰고, 수정하고, 명령을 실행할 수 있습니다. ` +
    `작업이 완료되면 결과를 요약해주세요.\n\n${koreanInstruction}`;

  const messages: any[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt },
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  try {
    for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
      const response = await client.chat.completions.create({
        model: selectedModel,
        messages,
        tools: OPENAI_TOOL_DEFINITIONS,
        tool_choice: "auto",
      });

      const choice = response.choices?.[0];
      if (!choice) break;

      const assistantMessage = choice.message;
      messages.push(assistantMessage);

      // Track tokens
      if (response.usage) {
        totalInputTokens += response.usage.prompt_tokens ?? 0;
        totalOutputTokens += response.usage.completion_tokens ?? 0;

        eventBus.emit({
          type: "token:update",
          sessionId,
          timestamp: Date.now(),
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalCostUsd: 0,
          contextBudgetRemaining: -1,
        });
      }

      // Emit text content
      if (assistantMessage.content) {
        eventBus.emit({
          type: "agent:response",
          sessionId,
          timestamp: Date.now(),
          content: assistantMessage.content,
          partial: true,
        });
        eventBus.emit({
          type: "stage:change",
          sessionId,
          timestamp: Date.now(),
          stage: "coding",
          description: "OpenAI 응답 중...",
        });
      }

      // Check for tool calls
      const toolCalls = assistantMessage.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        // No more tool calls → agent is done
        break;
      }

      // Execute each tool call
      for (const tc of toolCalls) {
        const toolName = tc.function.name;
        let args: Record<string, any>;
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = {};
        }

        const toolId = tc.id;
        const toolStartTime = Date.now();

        eventBus.emit({
          type: "tool:call",
          sessionId,
          timestamp: Date.now(),
          toolName,
          toolId,
          parameters: args,
        });

        // Emit stage-specific events
        if (toolName === "read_file") {
          eventBus.emit({
            type: "stage:change",
            sessionId,
            timestamp: Date.now(),
            stage: "coding",
            description: `파일 읽는 중: ${args.path}`,
          });
        } else if (toolName === "write_file") {
          eventBus.emit({
            type: "stage:change",
            sessionId,
            timestamp: Date.now(),
            stage: "coding",
            description: `파일 작성 중: ${args.path}`,
          });
        } else if (toolName === "edit_file") {
          eventBus.emit({
            type: "stage:change",
            sessionId,
            timestamp: Date.now(),
            stage: "coding",
            description: `파일 수정 중: ${args.path}`,
          });
        } else if (toolName === "run_command") {
          eventBus.emit({
            type: "stage:change",
            sessionId,
            timestamp: Date.now(),
            stage: "testing",
            description: `명령어 실행 중: ${String(args.command ?? "").slice(0, 50)}`,
          });
        }

        const result = await executeTool(sessionId, toolName, args, workspacePath);
        const toolDuration = Date.now() - toolStartTime;

        eventBus.emit({
          type: "tool:result",
          sessionId,
          timestamp: Date.now(),
          toolId,
          toolName,
          result: result.slice(0, 500),
          success: !result.startsWith("Error"),
          durationMs: toolDuration,
        });

        // Add tool result to messages for next iteration
        messages.push({
          role: "tool",
          tool_call_id: toolId,
          content: result.slice(0, 10000),
        });
      }
    }

    // Done
    eventBus.emit({
      type: "agent:response",
      sessionId,
      timestamp: Date.now(),
      content: "",
      partial: false,
    });

    eventBus.emit({
      type: "stage:change",
      sessionId,
      timestamp: Date.now(),
      stage: "completed",
      description: "세션 완료",
    });

    eventBus.emit({
      type: "session:completed",
      sessionId,
      timestamp: Date.now(),
      summary: "완료",
    });
  } catch (err) {
    eventBus.emit({
      type: "agent:response",
      sessionId,
      timestamp: Date.now(),
      content: "",
      partial: false,
    });

    eventBus.emit({
      type: "stage:change",
      sessionId,
      timestamp: Date.now(),
      stage: "error",
      description: `OpenAI SDK 오류: ${err instanceof Error ? err.message : String(err)}`,
    });

    eventBus.emit({
      type: "session:completed",
      sessionId,
      timestamp: Date.now(),
      summary: `오류: ${err instanceof Error ? err.message : String(err)}`,
    });

    throw err;
  }
}
