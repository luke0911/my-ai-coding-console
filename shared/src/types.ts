/**
 * Shared domain types used across frontend and backend.
 */

export interface SessionInfo {
  id: string;
  workspacePath: string;
  model: string;
  createdAt: number;
  lastActiveAt: number;
  stage: import("./events").SessionStage;
  promptCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  changedFiles: string[];
  provider?: import("./events").CodingProvider;
}

export interface SessionListResponse {
  type: "session:list:response";
  sessions: SessionInfo[];
}

export interface ToolActivity {
  toolName: string;
  callCount: number;
  lastCalledAt: number;
  avgDurationMs: number;
}

export interface FileChange {
  filePath: string;
  changeType: "created" | "modified" | "deleted";
  timestamp: number;
  diffAvailable: boolean;
}

export interface ApprovalConfig {
  mode: "auto" | "manual";
  /** Which actions require approval in manual mode */
  requireApproval: {
    fileWrite: boolean;
    commandExecute: boolean;
    fileDelete: boolean;
  };
}

export const DEFAULT_APPROVAL_CONFIG: ApprovalConfig = {
  mode: "auto",
  requireApproval: {
    fileWrite: true,
    commandExecute: true,
    fileDelete: true,
  },
};
