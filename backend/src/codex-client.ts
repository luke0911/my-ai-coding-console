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
  resumeThreadId?: string;
}

/** Maps our sessionId → Codex thread_id for resume */
const codexThreadIds = new Map<string, string>();

export function getCodexThreadId(sessionId: string): string | undefined {
  return codexThreadIds.get(sessionId);
}

export async function runCodexSession(options: CodexSessionOptions): Promise<void> {
  const { sessionId, prompt, workspacePath, model, resumeThreadId } = options;
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

  const extraPaths = [
    `${process.env.HOME}/.nvm/versions/node/${process.version}/bin`,
    "/usr/local/bin",
    "/opt/homebrew/bin",
    `${process.env.HOME}/.local/bin`,
  ].join(":");
  const enrichedPath = `${extraPaths}:${process.env.PATH ?? ""}`;

  let codexPath = "codex";
  try {
    const findCmd = process.platform === "win32" ? "where codex" : "which codex";
    codexPath = execSync(findCmd, {
      encoding: "utf-8",
      env: { ...process.env, PATH: enrichedPath },
    }).trim().split("\n")[0];
  } catch {
    // fallback
  }

  // Resume existing thread or start new exec
  const args = resumeThreadId
    ? [
        "resume",
        "--json",
        "--full-auto",
        "--skip-git-repo-check",
        resumeThreadId,
        fullPrompt,
      ]
    : [
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
      env: { ...process.env, PATH: enrichedPath },
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
          console.log(`[Codex:stdout] type=${event.type} payload.type=${event.payload?.type ?? "N/A"}`);
          processCodexEvent(sessionId, event);
        } catch {
          // Non-JSON line — treat as response text
          console.log(`[Codex:stdout:text] ${trimmed.slice(0, 120)}`);
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
 * Process a single JSONL event from `codex exec --json` stdout.
 *
 * Actual stdout format:
 *   { type: "thread.started", thread_id: "..." }
 *   { type: "turn.started" }
 *   { type: "item.started", item: { id, type, ... } }
 *   { type: "item.completed", item: { id, type: "agent_message" | "command_execution" | "file_change", ... } }
 *   { type: "turn.completed", usage: { input_tokens, cached_input_tokens, output_tokens } }
 */
function processCodexEvent(sessionId: string, event: any): void {
  const type = event.type;

  // ── Thread started: save thread_id for resume ──
  if (type === "thread.started" && event.thread_id) {
    codexThreadIds.set(sessionId, event.thread_id);
    console.log(`[Codex] Thread started: ${event.thread_id} → session ${sessionId}`);
  }

  // ── Turn started: agent is thinking ──
  if (type === "turn.started") {
    eventBus.emit({
      type: "stage:change",
      sessionId,
      timestamp: Date.now(),
      stage: "thinking",
      description: "Codex 생각 중...",
    });
  }

  // ── Item events (started / completed) ──
  if (type === "item.started" || type === "item.completed") {
    const item = event.item;
    if (!item) return;

    // Agent text response
    if (item.type === "agent_message" && item.text) {
      eventBus.emit({
        type: "agent:response",
        sessionId,
        timestamp: Date.now(),
        content: item.text + "\n",
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

    // Command execution
    if (item.type === "command_execution") {
      const cmdId = item.id ?? uuid();
      if (type === "item.started") {
        eventBus.emit({
          type: "tool:call",
          sessionId,
          timestamp: Date.now(),
          toolName: "shell_command",
          toolId: cmdId,
          parameters: { command: item.command ?? "" },
        });
        eventBus.emit({
          type: "command:execute",
          sessionId,
          timestamp: Date.now(),
          command: item.command ?? "",
          commandId: cmdId,
        });
        eventBus.emit({
          type: "stage:change",
          sessionId,
          timestamp: Date.now(),
          stage: "coding",
          description: `명령 실행 중...`,
        });
      }
      if (type === "item.completed" && item.aggregated_output) {
        eventBus.emit({
          type: "command:output",
          sessionId,
          timestamp: Date.now(),
          commandId: cmdId,
          output: item.aggregated_output,
          stream: "stdout",
        });
        if (item.exit_code != null) {
          eventBus.emit({
            type: "command:complete",
            sessionId,
            timestamp: Date.now(),
            commandId: cmdId,
            exitCode: item.exit_code,
            durationMs: 0,
          });
        }
      }
    }

    // File change
    if (item.type === "file_change" && type === "item.completed") {
      const changes = item.changes ?? [];
      for (const change of changes) {
        eventBus.emit({
          type: "file:write",
          sessionId,
          timestamp: Date.now(),
          filePath: change.path ?? "",
          content: "",
        });
      }
    }
  }

  // ── Turn completed: token usage ──
  if (type === "turn.completed" && event.usage) {
    const u = event.usage;
    eventBus.emit({
      type: "token:update",
      sessionId,
      timestamp: Date.now(),
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cacheReadTokens: u.cached_input_tokens ?? 0,
      cacheWriteTokens: 0,
      totalCostUsd: 0,
      contextBudgetRemaining: -1,
    });
  }
}

export function isCodexAvailable(): boolean {
  const extraPaths = [
    `${process.env.HOME}/.nvm/versions/node/${process.version}/bin`,
    "/usr/local/bin",
    "/opt/homebrew/bin",
    `${process.env.HOME}/.local/bin`,
  ].join(":");
  const env = { ...process.env, PATH: `${extraPaths}:${process.env.PATH ?? ""}` };
  try {
    execSync("codex --version", { stdio: "pipe", env });
    return true;
  } catch {
    return false;
  }
}
