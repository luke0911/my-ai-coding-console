/**
 * Event schema for streaming updates between backend and frontend.
 *
 * Design: Every event has a discriminated union type, a timestamp, and a sessionId.
 * This makes it easy to route, filter, and display events in the UI.
 * Events are intentionally flat — no deep nesting — for easy serialization.
 */

// ─── Session lifecycle ──────────────────────────────────────────

export interface SessionCreatedEvent {
  type: "session:created";
  sessionId: string;
  workspacePath: string;
  model: string;
  provider: CodingProvider;
  timestamp: number;
}

export interface SessionResumedEvent {
  type: "session:resumed";
  sessionId: string;
  timestamp: number;
}

export interface SessionCompletedEvent {
  type: "session:completed";
  sessionId: string;
  timestamp: number;
  summary: string;
}

export interface SessionErrorEvent {
  type: "session:error";
  sessionId: string;
  timestamp: number;
  error: string;
  recoverable: boolean;
}

// ─── Agent activity ─────────────────────────────────────────────

export interface AgentThinkingEvent {
  type: "agent:thinking";
  sessionId: string;
  timestamp: number;
}

export interface AgentResponseEvent {
  type: "agent:response";
  sessionId: string;
  timestamp: number;
  content: string;
  /** true if this is a partial chunk (streaming), false if complete */
  partial: boolean;
}

export interface AgentPlanEvent {
  type: "agent:plan";
  sessionId: string;
  timestamp: number;
  plan: string;
  nextAction: string;
}

export interface AgentReasoningEvent {
  type: "agent:reasoning";
  sessionId: string;
  timestamp: number;
  summary: string;
  context: string;
}

// ─── Tool calls ─────────────────────────────────────────────────

export interface ToolCallEvent {
  type: "tool:call";
  sessionId: string;
  timestamp: number;
  toolName: string;
  toolId: string;
  parameters: Record<string, unknown>;
}

export interface ToolResultEvent {
  type: "tool:result";
  sessionId: string;
  timestamp: number;
  toolId: string;
  toolName: string;
  result: string;
  success: boolean;
  durationMs: number;
}

// ─── File operations ────────────────────────────────────────────

export interface FileReadEvent {
  type: "file:read";
  sessionId: string;
  timestamp: number;
  filePath: string;
  content: string;
  lineCount: number;
}

export interface FileWriteEvent {
  type: "file:write";
  sessionId: string;
  timestamp: number;
  filePath: string;
  content: string;
}

export interface FileEditEvent {
  type: "file:edit";
  sessionId: string;
  timestamp: number;
  filePath: string;
  oldString: string;
  newString: string;
}

export interface FileDiffEvent {
  type: "file:diff";
  sessionId: string;
  timestamp: number;
  filePath: string;
  before: string;
  after: string;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
}

// ─── Command execution ─────────────────────────────────────────

export interface CommandExecuteEvent {
  type: "command:execute";
  sessionId: string;
  timestamp: number;
  command: string;
  commandId: string;
}

export interface CommandOutputEvent {
  type: "command:output";
  sessionId: string;
  timestamp: number;
  commandId: string;
  output: string;
  stream: "stdout" | "stderr";
}

export interface CommandCompleteEvent {
  type: "command:complete";
  sessionId: string;
  timestamp: number;
  commandId: string;
  exitCode: number;
  durationMs: number;
}

// ─── Test results ───────────────────────────────────────────────

export interface TestRunEvent {
  type: "test:run";
  sessionId: string;
  timestamp: number;
  testSuite: string;
  command: string;
}

export interface TestResultEvent {
  type: "test:result";
  sessionId: string;
  timestamp: number;
  testSuite: string;
  passed: number;
  failed: number;
  skipped: number;
  output: string;
}

// ─── Token & cost tracking ─────────────────────────────────────

export interface TokenUpdateEvent {
  type: "token:update";
  sessionId: string;
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCostUsd: number;
  /** Estimated context budget remaining (0-1), -1 if unknown */
  contextBudgetRemaining: number;
}

export interface QuotaUpdateEvent {
  type: "quota:update";
  sessionId: string;
  timestamp: number;
  /** 오늘 누적 사용량 (로컬 추적) */
  dailyInputTokens: number;
  dailyOutputTokens: number;
  dailyCostUsd: number;
  dailyResetTime: string;
  /** Rate limit (API key 모드에서만 유효, -1이면 미지원) */
  rateLimitTokensLimit: number;
  rateLimitTokensRemaining: number;
  rateLimitTokensReset: string;
  rateLimitRequestsLimit: number;
  rateLimitRequestsRemaining: number;
}

// ─── Approval system ───────────────────────────────────────────

export interface ApprovalRequestEvent {
  type: "approval:request";
  sessionId: string;
  timestamp: number;
  requestId: string;
  action: "file_write" | "command_execute" | "file_delete";
  description: string;
  detail: string;
}

export interface ApprovalResponseEvent {
  type: "approval:response";
  sessionId: string;
  timestamp: number;
  requestId: string;
  approved: boolean;
}

// ─── Hook events ────────────────────────────────────────────────

export interface HookEvent {
  type: "hook:event";
  sessionId: string;
  timestamp: number;
  hookName: string;
  hookType: "pre" | "post";
  payload: Record<string, unknown>;
  result?: string;
}

// ─── Stage indicator ────────────────────────────────────────────

export type SessionStage =
  | "idle"
  | "thinking"
  | "planning"
  | "coding"
  | "testing"
  | "reviewing"
  | "completed"
  | "error"
  | "waiting_approval";

export interface StageChangeEvent {
  type: "stage:change";
  sessionId: string;
  timestamp: number;
  stage: SessionStage;
  description: string;
}

// ─── Union type ─────────────────────────────────────────────────

export type ServerEvent =
  | SessionCreatedEvent
  | SessionResumedEvent
  | SessionCompletedEvent
  | SessionErrorEvent
  | AgentThinkingEvent
  | AgentResponseEvent
  | AgentPlanEvent
  | AgentReasoningEvent
  | ToolCallEvent
  | ToolResultEvent
  | FileReadEvent
  | FileWriteEvent
  | FileEditEvent
  | FileDiffEvent
  | CommandExecuteEvent
  | CommandOutputEvent
  | CommandCompleteEvent
  | TestRunEvent
  | TestResultEvent
  | TokenUpdateEvent
  | QuotaUpdateEvent
  | ApprovalRequestEvent
  | ApprovalResponseEvent
  | HookEvent
  | StageChangeEvent;

export type ServerEventType = ServerEvent["type"];

// ─── Client → Server messages ───────────────────────────────────

export type CodingProvider = "claude" | "codex";

export type ClaudeModel =
  | "claude-opus-4-6"
  | "claude-sonnet-4-5-20250929"
  | "claude-haiku-4-5-20251001";

export const CLAUDE_MODELS: { id: ClaudeModel; label: string }[] = [
  { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];

export interface ProviderModel {
  id: string;
  label: string;
  provider: CodingProvider;
}

export const PROVIDER_MODELS: ProviderModel[] = [
  // Claude
  { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5", provider: "claude" },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6", provider: "claude" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", provider: "claude" },
  // Codex (OpenAI)
  { id: "o4-mini", label: "GPT o4-mini", provider: "codex" },
  { id: "o3", label: "GPT o3", provider: "codex" },
];

export interface PromptSendMessage {
  type: "prompt:send";
  sessionId?: string;
  prompt: string;
  workspacePath: string;
  model: string;
  provider: CodingProvider;
}

export interface ApprovalRespondMessage {
  type: "approval:respond";
  sessionId: string;
  requestId: string;
  approved: boolean;
}

export interface SessionResumeMessage {
  type: "session:resume";
  sessionId: string;
}

export interface SessionListMessage {
  type: "session:list";
}

export interface ConfigUpdateMessage {
  type: "config:update";
  approvalMode: "auto" | "manual";
}

export interface ApiKeySetMessage {
  type: "apikey:set";
  apiKey: string;
}

export interface OpenAiKeySetMessage {
  type: "openaikey:set";
  apiKey: string;
}

export type ClientMessage =
  | PromptSendMessage
  | ApprovalRespondMessage
  | SessionResumeMessage
  | SessionListMessage
  | ConfigUpdateMessage
  | ApiKeySetMessage
  | OpenAiKeySetMessage;
