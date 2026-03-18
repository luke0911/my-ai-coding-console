/**
 * Session manager: handles session lifecycle, persistence, and event log storage.
 *
 * Design: Sessions are stored in-memory with optional JSON file persistence.
 * Each session accumulates its event log, so sessions can be reviewed and resumed.
 * Session metadata (tokens, cost, changed files) is updated as events flow through.
 */

import { v4 as uuid } from "uuid";
import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import type {
  ServerEvent,
  SessionStage,
  SessionInfo,
  ToolActivity,
  FileChange,
} from "@my-ai-console/shared";
import type { CodingProvider } from "@my-ai-console/shared";
import { eventBus } from "./event-bus.js";
import { runClaudeSession, getCliSessionId } from "./claude-client.js";
import { runCodexSession, getCodexThreadId, isCodexAvailable } from "./codex-client.js";
import { runClaudeSdkSession, getSdkSessionId } from "./claude-sdk-client.js";
import { runOpenAiSdkSession } from "./openai-sdk-client.js";
import { runMockSession } from "./mock-mode.js";
import { execSync } from "child_process";

function isClaudeCliAvailable(): boolean {
  try {
    execSync("claude --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

interface SessionState {
  info: SessionInfo;
  eventLog: ServerEvent[];
  toolActivities: Map<string, ToolActivity>;
  fileChanges: Map<string, FileChange>;
}

const sessions = new Map<string, SessionState>();

const DATA_DIR = path.join(homedir(), ".ai-console-data");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function saveSession(state: SessionState) {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, `session-${state.info.id}.json`);
  const data = {
    info: state.info,
    eventLog: state.eventLog,
    toolActivities: Array.from(state.toolActivities.entries()),
    fileChanges: Array.from(state.fileChanges.entries()),
  };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function loadSession(sessionId: string): SessionState | null {
  const filePath = path.join(DATA_DIR, `session-${sessionId}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return {
      info: raw.info,
      eventLog: raw.eventLog ?? [],
      toolActivities: new Map(raw.toolActivities ?? []),
      fileChanges: new Map(raw.fileChanges ?? []),
    };
  } catch {
    return null;
  }
}

function loadAllSessions(): SessionInfo[] {
  ensureDataDir();
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.startsWith("session-"));
  const infos: SessionInfo[] = [];
  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf-8"));
      infos.push(raw.info);
    } catch {
      // Skip corrupt files
    }
  }
  return infos.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

/**
 * Subscribe to EventBus events for a session, updating state and metadata.
 * Returns an unsubscribe function (auto-called on session:completed/error).
 */
function subscribeToSessionEvents(sessionId: string, state: SessionState): () => void {
  const unsubscribe = eventBus.subscribe((event) => {
    if (!("sessionId" in event) || event.sessionId !== sessionId) return;

    state.eventLog.push(event);
    state.info.lastActiveAt = Date.now();

    switch (event.type) {
      case "stage:change":
        state.info.stage = event.stage;
        break;

      case "token:update":
        state.info.totalInputTokens = event.inputTokens;
        state.info.totalOutputTokens = event.outputTokens;
        state.info.totalCostUsd = event.totalCostUsd;
        break;

      case "tool:call":
        {
          const existing = state.toolActivities.get(event.toolName);
          if (existing) {
            existing.callCount++;
            existing.lastCalledAt = event.timestamp;
          } else {
            state.toolActivities.set(event.toolName, {
              toolName: event.toolName,
              callCount: 1,
              lastCalledAt: event.timestamp,
              avgDurationMs: 0,
            });
          }
        }
        break;

      case "tool:result":
        {
          const activity = state.toolActivities.get(event.toolName);
          if (activity) {
            activity.avgDurationMs =
              (activity.avgDurationMs * (activity.callCount - 1) + event.durationMs) /
              activity.callCount;
          }
        }
        break;

      case "file:write":
        {
          const existing = state.fileChanges.get(event.filePath);
          state.fileChanges.set(event.filePath, {
            filePath: event.filePath,
            changeType: existing ? "modified" : "created",
            timestamp: event.timestamp,
            diffAvailable: false,
          });
          state.info.changedFiles = Array.from(state.fileChanges.keys());
        }
        break;

      case "file:diff":
        {
          const fc = state.fileChanges.get(event.filePath);
          if (fc) {
            fc.diffAvailable = true;
          } else {
            state.fileChanges.set(event.filePath, {
              filePath: event.filePath,
              changeType: "modified",
              timestamp: event.timestamp,
              diffAvailable: true,
            });
          }
          state.info.changedFiles = Array.from(state.fileChanges.keys());
        }
        break;

      case "session:completed":
      case "session:error":
        saveSession(state);
        unsubscribe();
        break;
    }
  });

  return unsubscribe;
}

/**
 * Build a handoff context string from an existing session's event log.
 * Used when switching providers mid-session to preserve continuity.
 */
function buildHandoffContext(state: SessionState): string {
  const lines: string[] = [];
  lines.push("=== 이전 세션 컨텍스트 (프로바이더 전환) ===");
  lines.push(`작업 폴더: ${state.info.workspacePath}`);

  // Changed files
  const changedFiles = Array.from(state.fileChanges.keys());
  if (changedFiles.length > 0) {
    lines.push(`\n변경된 파일:`);
    for (const f of changedFiles) {
      const fc = state.fileChanges.get(f)!;
      lines.push(`  - ${f} (${fc.changeType})`);
    }
  }

  // Commands executed
  const commands: string[] = [];
  for (const event of state.eventLog) {
    if (event.type === "command:execute") {
      commands.push(event.command);
    }
  }
  if (commands.length > 0) {
    lines.push(`\n실행한 명령어:`);
    for (const cmd of commands.slice(-10)) {
      lines.push(`  $ ${cmd}`);
    }
  }

  // Last response text (last few agent:response events)
  const responseTexts: string[] = [];
  for (const event of state.eventLog) {
    if (event.type === "agent:response" && event.partial && event.content) {
      responseTexts.push(event.content);
    }
  }
  if (responseTexts.length > 0) {
    const lastResponse = responseTexts.join("").slice(-1000);
    lines.push(`\n마지막 응답 요약:\n${lastResponse}`);
  }

  lines.push("\n=== 이전 컨텍스트 끝 ===\n");
  return lines.join("\n");
}

/**
 * Create a new session or continue an existing one, then start the agent.
 */
export async function createSession(
  prompt: string,
  workspacePath: string,
  model: string = "claude-sonnet-4-5-20250929",
  existingSessionId?: string,
  provider: CodingProvider = "claude"
): Promise<string> {
  // Follow-up: resume existing session
  if (existingSessionId) {
    const existingState = sessions.get(existingSessionId);
    const previousProvider = existingState?.info.provider;

    // Provider handoff: switching providers within the same session
    if (existingState && previousProvider && previousProvider !== provider) {
      console.log(`[SessionManager] Provider handoff: ${previousProvider} → ${provider} for session ${existingSessionId}`);
      const handoffContext = buildHandoffContext(existingState);
      const handoffPrompt = `${handoffContext}\n\n${prompt}`;
      existingState.info.provider = provider;
      existingState.info.promptCount++;
      existingState.info.lastActiveAt = Date.now();
      subscribeToSessionEvents(existingSessionId, existingState);

      routeSession(existingSessionId, handoffPrompt, workspacePath, model, provider).catch((err) => {
        console.error(`[SessionManager] Session ${existingSessionId} handoff error:`, err);
      });
      return existingSessionId;
    }

    // Claude resume via --resume (CLI) or SDK session_id
    if (provider === "claude") {
      const cliId = getCliSessionId(existingSessionId);
      const sdkId = getSdkSessionId(existingSessionId);
      if (existingState && (cliId || sdkId)) {
        console.log(`[SessionManager] Follow-up prompt for session ${existingSessionId}, resuming ${cliId ? "CLI" : "SDK"} session ${cliId ?? sdkId}`);
        existingState.info.promptCount++;
        existingState.info.lastActiveAt = Date.now();
        subscribeToSessionEvents(existingSessionId, existingState);

        if (cliId) {
          runClaudeSession({
            sessionId: existingSessionId,
            prompt,
            workspacePath,
            model,
            resumeSessionId: cliId,
          }).catch((err) => {
            console.error(`[SessionManager] Session ${existingSessionId} error:`, err);
          });
        } else {
          runClaudeSdkSession({
            sessionId: existingSessionId,
            prompt,
            workspacePath,
            model,
            resumeSessionId: sdkId,
          }).catch((err) => {
            console.error(`[SessionManager] Session ${existingSessionId} error:`, err);
          });
        }
        return existingSessionId;
      }
    }

    // Codex resume via thread_id
    if (provider === "codex") {
      const threadId = getCodexThreadId(existingSessionId);
      if (existingState && threadId) {
        console.log(`[SessionManager] Follow-up prompt for session ${existingSessionId}, resuming Codex thread ${threadId}`);
        existingState.info.promptCount++;
        existingState.info.lastActiveAt = Date.now();
        subscribeToSessionEvents(existingSessionId, existingState);
        runCodexSession({
          sessionId: existingSessionId,
          prompt,
          workspacePath,
          model,
          resumeThreadId: threadId,
        }).catch((err) => {
          console.error(`[SessionManager] Session ${existingSessionId} error:`, err);
        });
        return existingSessionId;
      }
    }

    // Follow-up without native resume support (OpenAI SDK mode, Mock mode, etc.)
    // Reuse existing session state and build context from previous conversation.
    if (existingState) {
      console.log(`[SessionManager] Follow-up (no resume ID) for session ${existingSessionId}, building context`);
      const handoffContext = buildHandoffContext(existingState);
      const contextPrompt = `${handoffContext}\n\n${prompt}`;
      existingState.info.promptCount++;
      existingState.info.lastActiveAt = Date.now();
      subscribeToSessionEvents(existingSessionId, existingState);

      routeSession(existingSessionId, contextPrompt, workspacePath, model, provider).catch((err) => {
        console.error(`[SessionManager] Session ${existingSessionId} follow-up error:`, err);
      });
      return existingSessionId;
    }
  }

  // New session
  const sessionId = existingSessionId ?? uuid();

  const state: SessionState = {
    info: {
      id: sessionId,
      workspacePath,
      model,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      stage: "idle",
      promptCount: 1,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      changedFiles: [],
      provider,
    },
    eventLog: [],
    toolActivities: new Map(),
    fileChanges: new Map(),
  };

  sessions.set(sessionId, state);
  subscribeToSessionEvents(sessionId, state);

  routeSession(sessionId, prompt, workspacePath, model, provider).catch((err) => {
    console.error(`[SessionManager] Session ${sessionId} (${provider}) error:`, err);
  });

  return sessionId;
}

/**
 * Route a session to the correct provider backend.
 * Priority: CLI available → SDK (API key) → Mock mode
 */
async function routeSession(
  sessionId: string,
  prompt: string,
  workspacePath: string,
  model: string,
  provider: CodingProvider
): Promise<void> {
  switch (provider) {
    case "codex": {
      if (isCodexAvailable()) {
        return runCodexSession({ sessionId, prompt, workspacePath, model });
      }
      if (process.env.OPENAI_API_KEY) {
        console.log("[SessionManager] Codex CLI 없음 → OpenAI SDK fallback");
        return runOpenAiSdkSession({ sessionId, prompt, workspacePath, model });
      }
      throw new Error("Codex CLI 또는 OpenAI API 키가 필요합니다");
    }
    case "claude":
    default: {
      if (isClaudeCliAvailable()) {
        return runClaudeSession({ sessionId, prompt, workspacePath, model }).then(() => {});
      }
      if (process.env.ANTHROPIC_API_KEY) {
        console.log("[SessionManager] Claude CLI 없음 → Claude SDK fallback");
        return runClaudeSdkSession({ sessionId, prompt, workspacePath, model });
      }
      console.log("[SessionManager] CLI/API 키 없음 → Mock 모드");
      return runMockSession(sessionId, prompt, workspacePath);
    }
  }
}

export function getSessionInfo(sessionId: string): SessionInfo | null {
  return sessions.get(sessionId)?.info ?? null;
}

export function getSessionEvents(sessionId: string): ServerEvent[] {
  return sessions.get(sessionId)?.eventLog ?? [];
}

export function getToolActivities(sessionId: string): ToolActivity[] {
  const state = sessions.get(sessionId);
  if (!state) return [];
  return Array.from(state.toolActivities.values());
}

export function getFileChanges(sessionId: string): FileChange[] {
  const state = sessions.get(sessionId);
  if (!state) return [];
  return Array.from(state.fileChanges.values());
}

export function listSessions(): SessionInfo[] {
  // Merge in-memory and persisted sessions
  const memSessions = Array.from(sessions.values()).map((s) => s.info);
  const diskSessions = loadAllSessions();

  // Deduplicate, preferring in-memory versions
  const seen = new Set(memSessions.map((s) => s.id));
  const merged = [...memSessions];
  for (const ds of diskSessions) {
    if (!seen.has(ds.id)) {
      merged.push(ds);
    }
  }

  return merged.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

/**
 * Resume a previous session by loading its event log.
 * Returns the events for replay on the frontend.
 */
export function resumeSession(sessionId: string): ServerEvent[] | null {
  // Check in-memory first
  const memState = sessions.get(sessionId);
  if (memState) return memState.eventLog;

  // Try loading from disk
  const diskState = loadSession(sessionId);
  if (diskState) {
    sessions.set(sessionId, diskState);
    return diskState.eventLog;
  }

  return null;
}
