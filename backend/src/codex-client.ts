/**
 * OpenAI Codex CLI client.
 *
 * Spawns `codex exec --json --full-auto "prompt"` and parses JSONL output.
 * Maps Codex events to our eventBus events for the frontend.
 */

import { spawn, execSync, type ChildProcess } from "child_process";
import { v4 as uuid } from "uuid";
import { eventBus } from "./event-bus.js";

export interface CodexSessionOptions {
  sessionId: string;
  prompt: string;
  workspacePath: string;
  model?: string;
}

export async function runCodexSession(options: CodexSessionOptions): Promise<void> {
  const { sessionId, prompt, workspacePath, model } = options;
  const selectedModel = model ?? "o4-mini";

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
    description: "Codex CLI 실행 중...",
  });

  const koreanInstruction =
    "중요: 모든 응답, 계획, 추론 요약, 설명을 한국어로 작성해주세요. " +
    "코드와 기술 용어는 영어 그대로 두되, 설명과 대화는 반드시 한국어로 해주세요.";

  const fullPrompt = `${koreanInstruction}\n\n${prompt}`;

  let codexPath = "codex";
  try {
    const findCmd = process.platform === "win32" ? "where codex" : "which codex";
    codexPath = execSync(findCmd, { encoding: "utf-8" }).trim().split("\n")[0];
  } catch {
    // fallback
  }

  const args = [
    "exec",
    "--json",
    "--full-auto",
    "--skip-git-repo-check",
    "--model", selectedModel,
    fullPrompt,
  ];

  return new Promise<void>((resolve, reject) => {
    console.log(`[Codex] CLI 실행: codex exec --json ...`);
    console.log(`[Codex] 작업 폴더: ${workspacePath}`);

    const cliProcess = spawn(codexPath, args, {
      cwd: workspacePath,
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
      env: { ...process.env },
    });

    let stdoutBuffer = "";
    let stderrBuffer = "";

    cliProcess.stdout!.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed);
          processCodexEvent(sessionId, event);
        } catch {
          // Non-JSON line — treat as response text
          eventBus.emit({
            type: "agent:response",
            sessionId,
            timestamp: Date.now(),
            content: trimmed + "\n",
            partial: true,
          });
        }
      }
    });

    cliProcess.stderr!.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
      console.error(`[Codex:stderr] ${chunk.toString().trim()}`);
    });

    cliProcess.on("close", (code) => {
      if (stdoutBuffer.trim()) {
        try {
          const event = JSON.parse(stdoutBuffer.trim());
          processCodexEvent(sessionId, event);
        } catch {
          // ignore
        }
      }

      console.log(`[Codex] CLI 종료 (exit code: ${code})`);

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
        stage: code === 0 ? "completed" : "error",
        description: code === 0 ? "세션 완료" : `오류 (exit ${code})`,
      });

      eventBus.emit({
        type: "session:completed",
        sessionId,
        timestamp: Date.now(),
        summary: code === 0 ? "완료" : stderrBuffer.trim() || "오류 발생",
      });

      code === 0 ? resolve() : reject(new Error(stderrBuffer.trim() || `exit ${code}`));
    });

    cliProcess.on("error", (err) => {
      reject(new Error(`Codex CLI 실행 실패: ${err.message}`));
    });

    cliProcess.stdin!.end();
  });
}

/**
 * Process a single JSONL event from Codex CLI.
 *
 * Codex JSONL format:
 *   { type: "event_msg", payload: { type: "agent_message" | "token_count" | "agent_reasoning" | ... } }
 *   { type: "response_item", payload: { type: "message" | "function_call" | "function_call_output" | "reasoning" | ... } }
 *   { type: "session_meta" | "turn_context", ... }
 */
function processCodexEvent(sessionId: string, event: any): void {
  const topType = event.type;
  const payload = event.payload;
  if (!payload) return;

  const payloadType = payload.type;

  // ── event_msg events ──
  if (topType === "event_msg") {
    // Agent text response (streaming)
    if (payloadType === "agent_message" && payload.message) {
      eventBus.emit({
        type: "agent:response",
        sessionId,
        timestamp: Date.now(),
        content: payload.message + "\n",
        partial: true,
      });
      eventBus.emit({
        type: "stage:change",
        sessionId,
        timestamp: Date.now(),
        stage: "coding",
        description: "Codex 응답 중...",
      });
    }

    // Agent reasoning
    if (payloadType === "agent_reasoning" && payload.summary) {
      eventBus.emit({
        type: "agent:reasoning",
        sessionId,
        timestamp: Date.now(),
        summary: payload.summary,
        context: payload.context ?? "",
      });
    }

    // Token count + rate limits
    if (payloadType === "token_count") {
      const info = payload.info;
      const rateLimits = payload.rate_limits;

      if (info?.total_token_usage) {
        const usage = info.total_token_usage;
        eventBus.emit({
          type: "token:update",
          sessionId,
          timestamp: Date.now(),
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          cacheReadTokens: usage.cached_input_tokens ?? 0,
          cacheWriteTokens: 0,
          totalCostUsd: 0,
          contextBudgetRemaining: info.model_context_window
            ? 1 - (usage.total_tokens / info.model_context_window)
            : -1,
        });
      }

      if (rateLimits) {
        eventBus.emit({
          type: "codex:rate_limit",
          sessionId,
          timestamp: Date.now(),
          primaryUsedPercent: rateLimits.primary?.used_percent ?? 0,
          primaryWindowMinutes: rateLimits.primary?.window_minutes ?? 0,
          primaryResetsAt: rateLimits.primary?.resets_at ?? 0,
          secondaryUsedPercent: rateLimits.secondary?.used_percent ?? 0,
          secondaryWindowMinutes: rateLimits.secondary?.window_minutes ?? 0,
          secondaryResetsAt: rateLimits.secondary?.resets_at ?? 0,
        });
      }
    }
  }

  // ── response_item events ──
  if (topType === "response_item") {
    // Text message content
    if (payloadType === "message") {
      const content = payload.content ?? [];
      for (const part of content) {
        if (part.type === "output_text" && part.text) {
          eventBus.emit({
            type: "agent:response",
            sessionId,
            timestamp: Date.now(),
            content: part.text + "\n",
            partial: true,
          });
          eventBus.emit({
            type: "stage:change",
            sessionId,
            timestamp: Date.now(),
            stage: "coding",
            description: "Codex 응답 중...",
          });
        }
      }
    }

    // Function call (tool use)
    if (payloadType === "function_call") {
      const toolName = payload.name ?? "unknown";
      let toolInput: Record<string, unknown> = {};
      try {
        toolInput = typeof payload.arguments === "string"
          ? JSON.parse(payload.arguments)
          : (payload.arguments ?? {});
      } catch {
        toolInput = { raw: payload.arguments };
      }

      eventBus.emit({
        type: "tool:call",
        sessionId,
        timestamp: Date.now(),
        toolName,
        toolId: payload.call_id ?? uuid(),
        parameters: toolInput,
      });

      eventBus.emit({
        type: "stage:change",
        sessionId,
        timestamp: Date.now(),
        stage: "coding",
        description: `도구 실행: ${toolName}`,
      });

      // Map shell commands
      if (toolName === "shell_command" || toolName === "shell" || toolName === "bash") {
        const cmdId = uuid();
        eventBus.emit({
          type: "command:execute",
          sessionId,
          timestamp: Date.now(),
          command: String(toolInput.command ?? toolInput.cmd ?? ""),
          commandId: cmdId,
        });
      }

      // Map file writes
      if (toolName === "write" || toolName === "create_file") {
        eventBus.emit({
          type: "file:write",
          sessionId,
          timestamp: Date.now(),
          filePath: String(toolInput.path ?? toolInput.file_path ?? ""),
          content: String(toolInput.content ?? toolInput.contents ?? ""),
        });
      }

      // Map file edits
      if (toolName === "edit" || toolName === "apply_diff" || toolName === "replace") {
        eventBus.emit({
          type: "file:edit",
          sessionId,
          timestamp: Date.now(),
          filePath: String(toolInput.path ?? toolInput.file_path ?? ""),
          oldString: String(toolInput.old_string ?? toolInput.search ?? ""),
          newString: String(toolInput.new_string ?? toolInput.replace ?? ""),
        });
      }
    }

    // Custom tool call (MCP etc.)
    if (payloadType === "custom_tool_call") {
      eventBus.emit({
        type: "tool:call",
        sessionId,
        timestamp: Date.now(),
        toolName: payload.name ?? "custom_tool",
        toolId: payload.call_id ?? uuid(),
        parameters: payload.arguments ?? {},
      });
    }
  }
}

export function isCodexAvailable(): boolean {
  try {
    execSync("codex --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
