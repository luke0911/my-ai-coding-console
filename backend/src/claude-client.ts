/**
 * Claude client: spawns the Claude Code CLI directly as a child process.
 *
 * Uses `claude --print --output-format stream-json` which outputs
 * newline-delimited JSON messages. This works with OAuth (Claude Max)
 * without needing an API key.
 */

import { spawn, execSync, type ChildProcess } from "child_process";
import { v4 as uuid } from "uuid";
import { eventBus } from "./event-bus.js";
import { hookManager } from "./hooks.js";

export interface ClaudeSessionOptions {
  sessionId?: string;
  prompt: string;
  workspacePath: string;
  model?: string;
  resumeSessionId?: string;
}

export interface ClaudeSession {
  id: string;
  status: "running" | "completed" | "error";
  startedAt: number;
  cliSessionId?: string;
  process?: ChildProcess;
}

const activeSessions = new Map<string, ClaudeSession>();

/**
 * Runs a Claude coding session by spawning the CLI.
 * Note: Routing (CLI vs SDK vs Mock) is handled by session-manager.
 */
export async function runClaudeSession(
  options: ClaudeSessionOptions
): Promise<ClaudeSession> {
  const sessionId = options.sessionId ?? uuid();
  const session: ClaudeSession = {
    id: sessionId,
    status: "running",
    startedAt: Date.now(),
  };

  activeSessions.set(sessionId, session);

  try {
    await runCLISession(session, options.prompt, options.workspacePath, options.model, options.resumeSessionId);
    session.status = "completed";
  } catch (err) {
    session.status = "error";
    eventBus.emit({
      type: "session:error",
      sessionId,
      timestamp: Date.now(),
      error: err instanceof Error ? err.message : String(err),
      recoverable: false,
    });
  }

  return session;
}

/**
 * Spawn `claude --print --output-format stream-json` and parse output.
 */
async function runCLISession(
  session: ClaudeSession,
  prompt: string,
  workspacePath: string,
  model?: string,
  resumeSessionId?: string
): Promise<void> {
  const sessionId = session.id;
  const selectedModel = model ?? "claude-sonnet-4-5-20250929";

  if (!resumeSessionId) {
    eventBus.emit({
      type: "session:created",
      sessionId,
      workspacePath,
      model: selectedModel,
      provider: "claude",
      timestamp: Date.now(),
    });
    await hookManager.run(sessionId, "post", "session_create", { sessionId, workspacePath });
  }

  eventBus.emit({
    type: "stage:change",
    sessionId,
    timestamp: Date.now(),
    stage: "thinking",
    description: resumeSessionId ? "대화 이어가는 중..." : "Claude CLI 실행 중...",
  });

  // Korean instruction prepended to prompt
  const koreanInstruction =
    "중요: 모든 응답, 계획, 추론 요약, 설명을 한국어로 작성해주세요. " +
    "코드와 기술 용어는 영어 그대로 두되, 설명과 대화는 반드시 한국어로 해주세요.";

  const fullPrompt = `${koreanInstruction}\n\n${prompt}`;

  // Build CLI arguments
  const args: string[] = [
    "--print",
    "--verbose",
    "--output-format", "stream-json",
    "--model", selectedModel,
    "--max-turns", "50",
    "--dangerously-skip-permissions",
  ];

  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
  }

  // The prompt is the last positional argument
  args.push(fullPrompt);

  return new Promise<void>((resolve, reject) => {
    console.log(`[Claude] CLI 실행: claude ${args.slice(0, 5).join(" ")}...`);
    console.log(`[Claude] 작업 폴더: ${workspacePath}`);

    // Find the claude CLI path
    let claudePath = "claude";
    try {
      const findCmd = process.platform === "win32" ? "where claude" : "which claude";
      claudePath = execSync(findCmd, { encoding: "utf-8" }).trim().split("\n")[0];
    } catch {
      // fallback to "claude" and hope it's in PATH
    }

    const cliProcess = spawn(claudePath, args, {
      cwd: workspacePath,
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
      env: {
        ...process.env,
      },
    });

    session.process = cliProcess;

    let stderrBuffer = "";
    let stdoutBuffer = "";
    let currentToolId: string | null = null;
    let toolStartTime = 0;

    cliProcess.stdout!.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();

      // Process complete JSON lines
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? ""; // Keep incomplete last line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const message = JSON.parse(trimmed);
          processMessage(sessionId, session, message, currentToolId, toolStartTime, (tid, tst) => {
            currentToolId = tid;
            toolStartTime = tst;
          });
        } catch {
          // Not JSON, might be regular output
          console.log(`[Claude:stdout] ${trimmed}`);
        }
      }
    });

    cliProcess.stderr!.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
      console.error(`[Claude:stderr] ${chunk.toString().trim()}`);
    });

    cliProcess.on("close", async (code) => {
      // Process any remaining buffer
      if (stdoutBuffer.trim()) {
        try {
          const message = JSON.parse(stdoutBuffer.trim());
          processMessage(sessionId, session, message, currentToolId, toolStartTime, () => {});
        } catch {
          // ignore
        }
      }

      console.log(`[Claude] CLI 종료 (exit code: ${code})`);

      if (code === 0) {
        await hookManager.run(sessionId, "post", "session_complete", { sessionId });
        resolve();
      } else {
        const errorMsg = stderrBuffer.trim() || `CLI가 종료 코드 ${code}로 종료되었습니다`;
        reject(new Error(errorMsg));
      }
    });

    cliProcess.on("error", (err) => {
      reject(new Error(`CLI 실행 실패: ${err.message}`));
    });

    // Close stdin immediately since we pass prompt as argument
    cliProcess.stdin!.end();
  });
}

/**
 * Process a single JSON message from the CLI stream.
 */
function processMessage(
  sessionId: string,
  session: ClaudeSession,
  message: any,
  currentToolId: string | null,
  toolStartTime: number,
  setTool: (id: string | null, time: number) => void
): void {
  switch (message.type) {
    case "system": {
      if (message.subtype === "init") {
        session.cliSessionId = message.session_id;
        eventBus.emit({
          type: "stage:change",
          sessionId,
          timestamp: Date.now(),
          stage: "coding",
          description: "Claude 세션 시작됨",
        });
      }
      break;
    }

    case "assistant": {
      const msg = message.message;
      if (!msg || !msg.content) break;

      for (const block of msg.content) {
        if (block.type === "text" && block.text) {
          eventBus.emit({
            type: "agent:response",
            sessionId,
            timestamp: Date.now(),
            content: block.text,
            partial: true,
          });
          extractAndEmitReasoning(sessionId, block.text);
        }

        if (block.type === "tool_use") {
          setTool(block.id, Date.now());

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
            ? block.content.map((c: any) => (c.type === "text" ? c.text : "")).join("")
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

          setTool(null, 0);
        }
      }

      // Token update from usage
      if (msg.usage) {
        eventBus.emit({
          type: "token:update",
          sessionId,
          timestamp: Date.now(),
          inputTokens: msg.usage.input_tokens ?? 0,
          outputTokens: msg.usage.output_tokens ?? 0,
          cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: msg.usage.cache_creation_input_tokens ?? 0,
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
        summary: message.result ?? (isSuccess ? "완료" : "오류 발생"),
      });
      break;
    }
  }
}

/**
 * Map specific tool calls to file/command events for the UI.
 */
export function emitToolSpecificEvents(
  sessionId: string,
  toolName: string,
  input: Record<string, unknown>
): void {
  switch (toolName) {
    case "Read": {
      eventBus.emit({
        type: "stage:change",
        sessionId,
        timestamp: Date.now(),
        stage: "coding",
        description: `파일 읽는 중: ${input.file_path}`,
      });
      break;
    }

    case "Write": {
      eventBus.emit({
        type: "stage:change",
        sessionId,
        timestamp: Date.now(),
        stage: "coding",
        description: `파일 작성 중: ${input.file_path}`,
      });
      eventBus.emit({
        type: "file:write",
        sessionId,
        timestamp: Date.now(),
        filePath: String(input.file_path ?? ""),
        content: String(input.content ?? ""),
      });
      hookManager.run(sessionId, "post", "file_write", {
        filePath: input.file_path,
      });
      break;
    }

    case "Edit": {
      eventBus.emit({
        type: "stage:change",
        sessionId,
        timestamp: Date.now(),
        stage: "coding",
        description: `파일 수정 중: ${input.file_path}`,
      });
      eventBus.emit({
        type: "file:edit",
        sessionId,
        timestamp: Date.now(),
        filePath: String(input.file_path ?? ""),
        oldString: String(input.old_string ?? ""),
        newString: String(input.new_string ?? ""),
      });
      break;
    }

    case "Bash": {
      const cmdId = uuid();
      eventBus.emit({
        type: "stage:change",
        sessionId,
        timestamp: Date.now(),
        stage: "testing",
        description: `명령어 실행 중: ${String(input.command ?? "").slice(0, 50)}`,
      });
      eventBus.emit({
        type: "command:execute",
        sessionId,
        timestamp: Date.now(),
        command: String(input.command ?? ""),
        commandId: cmdId,
      });
      break;
    }
  }
}

/**
 * Extract reasoning hints from Claude's text output.
 */
function extractAndEmitReasoning(sessionId: string, text: string): void {
  const planPatterns = [
    /(?:계획|단계|순서|방법|접근|전략)[\s:：]\s*\n((?:\s*\d+\..+\n?)+)/,
    /(?:Plan|Steps|Approach)[\s:：]\s*\n((?:\s*\d+\..+\n?)+)/i,
  ];

  for (const pattern of planPatterns) {
    const match = text.match(pattern);
    if (match) {
      eventBus.emit({
        type: "agent:plan",
        sessionId,
        timestamp: Date.now(),
        plan: match[1].trim(),
        nextAction: match[1].trim().split("\n")[0].replace(/^\d+\.\s*/, ""),
      });
      break;
    }
  }

  if (text.length > 50) {
    const reasoningPatterns = [
      /(.{20,}(?:이유는|왜냐하면|때문에|하기 위해|먼저|분석|확인).{10,})/,
    ];
    for (const pattern of reasoningPatterns) {
      const match = text.match(pattern);
      if (match) {
        eventBus.emit({
          type: "agent:reasoning",
          sessionId,
          timestamp: Date.now(),
          summary: match[1].trim().slice(0, 200),
          context: "",
        });
        break;
      }
    }
  }
}

export function getCliSessionId(sessionId: string): string | undefined {
  return activeSessions.get(sessionId)?.cliSessionId;
}

