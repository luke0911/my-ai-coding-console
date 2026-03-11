/**
 * Session store: central state management for the entire dashboard.
 *
 * Uses Zustand for lightweight, typed state. All state updates come from
 * WebSocket events processed by the useWebSocket hook.
 *
 * Design: Per-session data is stored in sessionData[sessionId].
 * Multiple consoles can be open simultaneously, each with its own session.
 */

import { create } from "zustand";
import type {
  ServerEvent,
  SessionInfo,
  SessionStage,
  ToolActivity,
  FileChange,
  DiffHunk,
  ApprovalConfig,
  ClaudeModel,
  CodingProvider,
} from "@my-ai-console/shared";

// ─── Per-session data types ─────────────────────────────────────

interface TokenState {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCostUsd: number;
  contextBudgetRemaining: number;
}

interface QuotaState {
  dailyInputTokens: number;
  dailyOutputTokens: number;
  dailyCostUsd: number;
  dailyResetTime: string;
  rateLimitTokensLimit: number;
  rateLimitTokensRemaining: number;
  rateLimitTokensReset: string;
  rateLimitRequestsLimit: number;
  rateLimitRequestsRemaining: number;
}

interface AccountUsageState {
  lines: string[];
  scrapedAt: number;
}

interface DiffState {
  filePath: string;
  before: string;
  after: string;
  hunks: DiffHunk[];
  timestamp: number;
}

interface ApprovalRequest {
  requestId: string;
  action: "file_write" | "command_execute" | "file_delete";
  description: string;
  detail: string;
  timestamp: number;
}

export interface CodeChange {
  type: "edit" | "write";
  filePath: string;
  timestamp: number;
  oldString?: string;
  newString?: string;
  content?: string;
}

interface CommandState {
  commandId: string;
  command: string;
  output: string;
  exitCode: number | null;
  durationMs: number | null;
  stream: string;
}

// ─── Per-session data bucket ────────────────────────────────────

export interface PerSessionData {
  provider: CodingProvider;
  workspacePath: string;
  responseText: string;
  responseStreaming: boolean;
  events: ServerEvent[];
  stage: SessionStage;
  toolActivities: Record<string, ToolActivity>;
  fileChanges: FileChange[];
  currentFile: { path: string; content: string } | null;
  codeChanges: CodeChange[];
  diffs: DiffState[];
  selectedDiff: DiffState | null;
  currentPlan: string;
  nextAction: string;
  reasoningSummaries: Array<{ summary: string; context: string; timestamp: number }>;
  tokens: TokenState;
  terminalOutput: string;
  commands: CommandState[];
  testResults: Array<{
    testSuite: string;
    passed: number;
    failed: number;
    skipped: number;
    output: string;
    timestamp: number;
  }>;
  pendingApprovals: ApprovalRequest[];
  hookEvents: Array<{
    hookName: string;
    hookType: "pre" | "post";
    result?: string;
    timestamp: number;
  }>;
}

export function createEmptySessionData(workspacePath = ""): PerSessionData {
  return {
    provider: "claude" as CodingProvider,
    workspacePath,
    responseText: "",
    responseStreaming: false,
    events: [],
    stage: "idle",
    toolActivities: {},
    fileChanges: [],
    currentFile: null,
    codeChanges: [],
    diffs: [],
    selectedDiff: null,
    currentPlan: "",
    nextAction: "",
    reasoningSummaries: [],
    tokens: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalCostUsd: 0,
      contextBudgetRemaining: 1,
    },
    terminalOutput: "",
    commands: [],
    testResults: [],
    pendingApprovals: [],
    hookEvents: [],
  };
}

// ─── Store shape ────────────────────────────────────────────────

const INITIAL_CONSOLE_ID = `new-${Date.now()}`;

export interface SessionStore {
  // Connection
  connected: boolean;
  mockMode: boolean;
  setConnected: (connected: boolean) => void;
  setMockMode: (mock: boolean) => void;

  // Session list (from backend)
  sessions: SessionInfo[];
  setSessions: (sessions: SessionInfo[]) => void;

  // ─── Multi-console ──────────────────────────────
  openConsoles: string[];
  activeConsoleId: string | null;
  sessionData: Record<string, PerSessionData>;

  openConsole: (sessionId: string, workspacePath?: string) => void;
  closeConsole: (sessionId: string) => void;
  setActiveConsole: (sessionId: string) => void;
  createNewConsole: () => string;
  remapConsoleId: (oldId: string, newId: string) => void;
  updateSessionData: (
    sessionId: string,
    updater: (data: PerSessionData) => Partial<PerSessionData>
  ) => void;

  /** Backward compat alias for activeConsoleId */
  currentSessionId: string | null;

  // Global settings
  provider: CodingProvider;
  setProvider: (provider: CodingProvider) => void;
  model: string;
  setModel: (model: string) => void;
  approvalConfig: ApprovalConfig;
  setApprovalConfig: (config: ApprovalConfig) => void;

  // Quota (global, not per-session)
  quota: QuotaState;
  updateQuota: (quota: QuotaState) => void;

  // Account usage (scraped from claude.ai — global)
  accountUsage: AccountUsageState;
  setAccountUsage: (usage: AccountUsageState) => void;
  usageRefreshRequest: number;
  requestUsageRefresh: () => void;

  // Provider availability (from backend CLI checks)
  providerAvailability: { claude: boolean; codex: boolean; aider: boolean };
  setProviderAvailability: (avail: { claude: boolean; codex: boolean; aider: boolean }) => void;

  // UI
  selectedPanel: "stream" | "diff" | "file" | "usage";
  setSelectedPanel: (panel: "stream" | "diff" | "file" | "usage") => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  // Connection
  connected: false,
  mockMode: false,
  setConnected: (connected) => set({ connected }),
  setMockMode: (mockMode) => set({ mockMode }),

  // Sessions
  sessions: [],
  setSessions: (sessions) => set({ sessions }),

  // ─── Multi-console ──────────────────────────────
  openConsoles: [INITIAL_CONSOLE_ID],
  activeConsoleId: INITIAL_CONSOLE_ID,
  currentSessionId: INITIAL_CONSOLE_ID,
  sessionData: { [INITIAL_CONSOLE_ID]: createEmptySessionData() },

  openConsole: (sessionId, workspacePath) =>
    set((s) => {
      if (s.openConsoles.includes(sessionId)) {
        return { activeConsoleId: sessionId, currentSessionId: sessionId };
      }
      const newSessionData = { ...s.sessionData };
      if (!newSessionData[sessionId]) {
        newSessionData[sessionId] = createEmptySessionData(workspacePath ?? "");
      }
      return {
        openConsoles: [...s.openConsoles, sessionId],
        activeConsoleId: sessionId,
        currentSessionId: sessionId,
        sessionData: newSessionData,
      };
    }),

  closeConsole: (sessionId) =>
    set((s) => {
      const filtered = s.openConsoles.filter((id) => id !== sessionId);
      let newActive = s.activeConsoleId;
      if (s.activeConsoleId === sessionId) {
        const idx = s.openConsoles.indexOf(sessionId);
        newActive = filtered[Math.min(idx, filtered.length - 1)] ?? null;
      }
      return {
        openConsoles: filtered,
        activeConsoleId: newActive,
        currentSessionId: newActive,
      };
    }),

  setActiveConsole: (sessionId) =>
    set({ activeConsoleId: sessionId, currentSessionId: sessionId }),

  createNewConsole: () => {
    const tempId = `new-${Date.now()}`;
    const s = get();
    // Inherit workspace from active console
    const activeData = s.activeConsoleId ? s.sessionData[s.activeConsoleId] : null;
    const wp = activeData?.workspacePath ?? "";
    set({
      openConsoles: [...s.openConsoles, tempId],
      activeConsoleId: tempId,
      currentSessionId: tempId,
      sessionData: {
        ...s.sessionData,
        [tempId]: createEmptySessionData(wp),
      },
    });
    return tempId;
  },

  remapConsoleId: (oldId, newId) =>
    set((s) => {
      const newConsoles = s.openConsoles.map((id) => (id === oldId ? newId : id));
      const newSessionData = { ...s.sessionData };
      if (newSessionData[oldId]) {
        newSessionData[newId] = newSessionData[oldId];
        delete newSessionData[oldId];
      }
      return {
        openConsoles: newConsoles,
        activeConsoleId: s.activeConsoleId === oldId ? newId : s.activeConsoleId,
        currentSessionId: s.activeConsoleId === oldId ? newId : s.currentSessionId,
        sessionData: newSessionData,
      };
    }),

  updateSessionData: (sessionId, updater) =>
    set((s) => {
      const current = s.sessionData[sessionId] ?? createEmptySessionData();
      const updates = updater(current);
      return {
        sessionData: {
          ...s.sessionData,
          [sessionId]: { ...current, ...updates },
        },
      };
    }),

  // Global settings
  provider: "claude",
  setProvider: (provider) => set({ provider }),
  model: "claude-sonnet-4-5-20250929",
  setModel: (model) => set({ model }),

  approvalConfig: {
    mode: "auto",
    requireApproval: {
      fileWrite: true,
      commandExecute: true,
      fileDelete: true,
    },
  },
  setApprovalConfig: (config) => set({ approvalConfig: config }),

  // Quota (global)
  quota: {
    dailyInputTokens: 0,
    dailyOutputTokens: 0,
    dailyCostUsd: 0,
    dailyResetTime: "",
    rateLimitTokensLimit: -1,
    rateLimitTokensRemaining: -1,
    rateLimitTokensReset: "",
    rateLimitRequestsLimit: -1,
    rateLimitRequestsRemaining: -1,
  },
  updateQuota: (quota) => set({ quota }),

  // Account usage (global)
  accountUsage: { lines: [], scrapedAt: 0 },
  setAccountUsage: (accountUsage) => set({ accountUsage }),
  usageRefreshRequest: 0,
  requestUsageRefresh: () =>
    set((s) => ({ usageRefreshRequest: s.usageRefreshRequest + 1 })),

  // Provider availability
  providerAvailability: { claude: false, codex: false, aider: false },
  setProviderAvailability: (avail) => set({ providerAvailability: avail }),

  // UI
  selectedPanel: "stream",
  setSelectedPanel: (panel) => set({ selectedPanel: panel }),
}));
