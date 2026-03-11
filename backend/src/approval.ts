/**
 * Approval manager: gates file writes and command executions in manual mode.
 *
 * When approval mode is "manual", operations that modify the filesystem or
 * execute commands are paused until the user approves or denies them via the UI.
 * In "auto" mode, everything is approved automatically.
 */

import { v4 as uuid } from "uuid";
import { eventBus } from "./event-bus.js";
import type { ApprovalConfig } from "@my-ai-console/shared";
import { DEFAULT_APPROVAL_CONFIG } from "@my-ai-console/shared";

interface PendingApproval {
  requestId: string;
  resolve: (approved: boolean) => void;
  timeout: ReturnType<typeof setTimeout>;
}

class ApprovalManager {
  private config: ApprovalConfig = { ...DEFAULT_APPROVAL_CONFIG };
  private pending: Map<string, PendingApproval> = new Map();

  /** Approval timeout in ms — auto-deny after this */
  private static readonly TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  updateConfig(config: Partial<ApprovalConfig>): void {
    this.config = { ...this.config, ...config };
    console.log(`[Approval] Mode: ${this.config.mode}`);
  }

  getConfig(): ApprovalConfig {
    return { ...this.config };
  }

  /**
   * Request approval for an action. Returns true if approved.
   * In auto mode, always returns true immediately.
   */
  async requestApproval(
    sessionId: string,
    action: "file_write" | "command_execute" | "file_delete",
    description: string,
    detail: string
  ): Promise<boolean> {
    // Auto mode: always approve
    if (this.config.mode === "auto") {
      return true;
    }

    // Check if this action type requires approval
    const actionMap = {
      file_write: this.config.requireApproval.fileWrite,
      command_execute: this.config.requireApproval.commandExecute,
      file_delete: this.config.requireApproval.fileDelete,
    };
    if (!actionMap[action]) {
      return true;
    }

    const requestId = uuid();

    // Emit approval request to UI
    eventBus.emit({
      type: "approval:request",
      sessionId,
      timestamp: Date.now(),
      requestId,
      action,
      description,
      detail,
    });

    // Wait for response
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        resolve(false); // Auto-deny on timeout
      }, ApprovalManager.TIMEOUT_MS);

      this.pending.set(requestId, { requestId, resolve, timeout });
    });
  }

  /** Respond to a pending approval request */
  respond(requestId: string, approved: boolean): boolean {
    const pending = this.pending.get(requestId);
    if (!pending) return false;

    clearTimeout(pending.timeout);
    this.pending.delete(requestId);
    pending.resolve(approved);
    return true;
  }
}

export const approvalManager = new ApprovalManager();
