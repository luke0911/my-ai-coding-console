/**
 * Aider CLI client.
 *
 * Spawns `aider --message "prompt" --yes --model <model>` and parses text output.
 * Supports GPT-4o, Gemini, DeepSeek, Claude, and many other models via LiteLLM.
 */

import { spawn, execSync } from "child_process";
import { v4 as uuid } from "uuid";
import { eventBus } from "./event-bus.js";

export interface AiderSessionOptions {
  sessionId: string;
  prompt: string;
  workspacePath: string;
  model?: string;
}

export async function runAiderSession(options: AiderSessionOptions): Promise<void> {
  const { sessionId, prompt, workspacePath, model } = options;
  const selectedModel = model ?? "gpt-4o";

  eventBus.emit({
    type: "session:created",
    sessionId,
    workspacePath,
    model: selectedModel,
    provider: "aider",
    timestamp: Date.now(),
  });

  eventBus.emit({
    type: "stage:change",
    sessionId,
    timestamp: Date.now(),
    stage: "thinking",
    description: "Aider 실행 중...",
  });

  const koreanInstruction =
    "중요: 모든 응답, 계획, 추론 요약, 설명을 한국어로 작성해주세요. " +
    "코드와 기술 용어는 영어 그대로 두되, 설명과 대화는 반드시 한국어로 해주세요.";

  const fullPrompt = `${koreanInstruction}\n\n${prompt}`;

  let aiderPath = "aider";
  try {
    const findCmd = process.platform === "win32" ? "where aider" : "which aider";
    aiderPath = execSync(findCmd, { encoding: "utf-8" }).trim().split("\n")[0];
  } catch {
    // fallback
  }

  const args = [
    "--message", fullPrompt,
    "--yes",
    "--no-auto-commits",
    "--stream",
    "--model", selectedModel,
  ];

  return new Promise<void>((resolve, reject) => {
    console.log(`[Aider] CLI 실행: aider --message ... --model ${selectedModel}`);
    console.log(`[Aider] 작업 폴더: ${workspacePath}`);

    const cliProcess = spawn(aiderPath, args, {
      cwd: workspacePath,
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
      env: { ...process.env },
    });

    let stderrBuffer = "";
    const parser = new AiderOutputParser(sessionId);

    cliProcess.stdout!.on("data", (chunk: Buffer) => {
      parser.feed(chunk.toString());
    });

    cliProcess.stderr!.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString();
      const msg = chunk.toString().trim();
      if (msg) console.error(`[Aider:stderr] ${msg}`);
    });

    cliProcess.on("close", (code) => {
      parser.flush();
      console.log(`[Aider] CLI 종료 (exit code: ${code})`);

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
      reject(new Error(`Aider 실행 실패: ${err.message}`));
    });

    cliProcess.stdin!.end();
  });
}

/**
 * Parses Aider's plain-text streaming output into structured events.
 *
 * Aider output patterns:
 * - Regular text: agent response
 * - "<<<<<<< SEARCH" ... "=======" ... ">>>>>>> REPLACE": edit blocks
 * - Lines starting with + or - in diff context: file changes
 */
class AiderOutputParser {
  private sessionId: string;
  private buffer = "";
  private inEditBlock = false;
  private currentFilePath = "";
  private searchContent = "";
  private replaceContent = "";
  private phase: "none" | "search" | "replace" = "none";
  private emittedStage = false;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  feed(text: string): void {
    this.buffer += text;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      this.processLine(line);
    }
  }

  flush(): void {
    if (this.buffer.trim()) {
      this.processLine(this.buffer);
      this.buffer = "";
    }
    if (this.inEditBlock) {
      this.emitEditBlock();
    }
  }

  private processLine(line: string): void {
    // Detect edit block markers
    if (line.includes("<<<<<<< SEARCH")) {
      this.inEditBlock = true;
      this.phase = "search";
      this.searchContent = "";
      this.replaceContent = "";
      return;
    }

    if (line.includes("=======") && this.inEditBlock) {
      this.phase = "replace";
      return;
    }

    if (line.includes(">>>>>>> REPLACE")) {
      this.emitEditBlock();
      this.inEditBlock = false;
      this.phase = "none";
      return;
    }

    // Inside edit block
    if (this.inEditBlock) {
      if (this.phase === "search") {
        this.searchContent += (this.searchContent ? "\n" : "") + line;
      } else if (this.phase === "replace") {
        this.replaceContent += (this.replaceContent ? "\n" : "") + line;
      }
      return;
    }

    // Detect file path lines (aider outputs file paths before edits)
    const filePathMatch = line.match(/^(?:Editing|Creating|Updating)\s+(.+)$/);
    if (filePathMatch) {
      this.currentFilePath = filePathMatch[1].trim();

      if (!this.emittedStage) {
        eventBus.emit({
          type: "stage:change",
          sessionId: this.sessionId,
          timestamp: Date.now(),
          stage: "coding",
          description: `파일 수정 중: ${this.currentFilePath}`,
        });
        this.emittedStage = true;
      }
      return;
    }

    // Regular text output → agent response
    if (line.trim()) {
      eventBus.emit({
        type: "agent:response",
        sessionId: this.sessionId,
        timestamp: Date.now(),
        content: line + "\n",
        partial: true,
      });

      if (!this.emittedStage) {
        eventBus.emit({
          type: "stage:change",
          sessionId: this.sessionId,
          timestamp: Date.now(),
          stage: "coding",
          description: "Aider 응답 중...",
        });
        this.emittedStage = true;
      }
    }
  }

  private emitEditBlock(): void {
    if (!this.searchContent && !this.replaceContent) return;

    const filePath = this.currentFilePath || "unknown";

    eventBus.emit({
      type: "file:edit",
      sessionId: this.sessionId,
      timestamp: Date.now(),
      filePath,
      oldString: this.searchContent,
      newString: this.replaceContent,
    });

    eventBus.emit({
      type: "tool:call",
      sessionId: this.sessionId,
      timestamp: Date.now(),
      toolName: "Edit",
      toolId: uuid(),
      parameters: {
        file_path: filePath,
        old_string: this.searchContent.slice(0, 100),
        new_string: this.replaceContent.slice(0, 100),
      },
    });
  }
}

export function isAiderAvailable(): boolean {
  try {
    execSync("aider --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
