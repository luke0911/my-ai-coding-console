/**
 * Hook system for lifecycle events.
 *
 * Hooks run before/after key operations and can:
 * - Log events to the UI
 * - Transform or validate operations
 * - Trigger side effects
 *
 * Extension point: Add custom hooks by registering them with hookManager.register().
 */

import { eventBus } from "./event-bus.js";
import type { HookEvent } from "@my-ai-console/shared";

export type HookPhase = "pre" | "post";
export type HookAction =
  | "file_write"
  | "file_read"
  | "command_execute"
  | "session_create"
  | "session_complete";

export interface HookHandler {
  name: string;
  phase: HookPhase;
  action: HookAction;
  handler: (payload: Record<string, unknown>) => Promise<string | void>;
}

class HookManager {
  private hooks: HookHandler[] = [];

  register(hook: HookHandler): void {
    this.hooks.push(hook);
    console.log(`[Hooks] Registered: ${hook.name} (${hook.phase}:${hook.action})`);
  }

  async run(
    sessionId: string,
    phase: HookPhase,
    action: HookAction,
    payload: Record<string, unknown>
  ): Promise<void> {
    const matching = this.hooks.filter(
      (h) => h.phase === phase && h.action === action
    );

    for (const hook of matching) {
      try {
        const result = await hook.handler(payload);

        const hookEvent: HookEvent = {
          type: "hook:event",
          sessionId,
          timestamp: Date.now(),
          hookName: hook.name,
          hookType: phase,
          payload,
          result: result ?? undefined,
        };
        eventBus.emit(hookEvent);
      } catch (err) {
        console.error(`[Hooks] Error in ${hook.name}:`, err);
        const hookEvent: HookEvent = {
          type: "hook:event",
          sessionId,
          timestamp: Date.now(),
          hookName: hook.name,
          hookType: phase,
          payload,
          result: `Error: ${err instanceof Error ? err.message : String(err)}`,
        };
        eventBus.emit(hookEvent);
      }
    }
  }
}

export const hookManager = new HookManager();

// ─── Built-in hooks ─────────────────────────────────────────────

// Logging hook: logs all file writes
hookManager.register({
  name: "file-write-logger",
  phase: "post",
  action: "file_write",
  handler: async (payload) => {
    console.log(`[Hook:FileWrite] ${payload.filePath}`);
    return `Logged file write: ${payload.filePath}`;
  },
});

// Session lifecycle logger
hookManager.register({
  name: "session-lifecycle-logger",
  phase: "post",
  action: "session_create",
  handler: async (payload) => {
    console.log(`[Hook:Session] Created: ${payload.sessionId}`);
    return `Session created`;
  },
});
