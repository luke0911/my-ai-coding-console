/**
 * WebSocket hook: manages connection lifecycle and event routing.
 *
 * All incoming events are routed to the correct session's data bucket
 * via updateSessionData(event.sessionId, ...).
 * The hook handles reconnection with exponential backoff.
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSessionStore, createEmptySessionData } from "@/store/session-store";
import type { ClientMessage, ServerEvent } from "@my-ai-console/shared";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001/ws";
const MAX_RECONNECT_DELAY = 10000;
const BASE_RECONNECT_DELAY = 1000;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposedRef = useRef(false);

  const handleEvent = useCallback(
    (event: ServerEvent | Record<string, unknown>) => {
      const s = useSessionStore.getState();
      const type = event.type as string;
      const sessionId = (event as any).sessionId as string | undefined;

      // ── Global events (no session routing) ──
      switch (type) {
        case "connection:established": {
          const ce = event as any;
          s.setMockMode(!!ce.mockMode);
          s.setProviderAvailability({
            claude: !!ce.claudeAvailable,
            codex: !!ce.codexAvailable,
          });
          return;
        }

        case "apikey:status":
          s.setMockMode(!!(event as any).mockMode);
          return;

        case "session:list:response":
          s.setSessions((event as any).sessions ?? []);
          return;

        case "quota:update": {
          const e = event as any;
          s.updateQuota({
            dailyInputTokens: e.dailyInputTokens,
            dailyOutputTokens: e.dailyOutputTokens,
            dailyCostUsd: e.dailyCostUsd,
            dailyResetTime: e.dailyResetTime,
            rateLimitTokensLimit: e.rateLimitTokensLimit,
            rateLimitTokensRemaining: e.rateLimitTokensRemaining,
            rateLimitTokensReset: e.rateLimitTokensReset,
            rateLimitRequestsLimit: e.rateLimitRequestsLimit,
            rateLimitRequestsRemaining: e.rateLimitRequestsRemaining,
          });
          return;
        }
      }

      // ── Session-scoped events ──
      if (!sessionId) return;

      // Ensure session data bucket exists
      if (!s.sessionData[sessionId]) {
        s.updateSessionData(sessionId, () => ({}));
      }

      // Log event to session stream (skip noisy events)
      if (type !== "token:update") {
        s.updateSessionData(sessionId, (data) => ({
          events: [...data.events, event as ServerEvent],
        }));
      }

      switch (type) {
        case "session:assigned": {
          const activeId = s.activeConsoleId;
          if (activeId && activeId.startsWith("new-")) {
            s.remapConsoleId(activeId, sessionId);
          } else if (!s.openConsoles.includes(sessionId)) {
            s.openConsole(sessionId);
          }
          break;
        }

        case "session:replay:start":
          if (!s.openConsoles.includes(sessionId)) {
            s.openConsole(sessionId);
          }
          break;

        case "session:created":
          s.updateSessionData(sessionId, () => ({ stage: "idle" }));
          break;

        case "session:completed":
          s.updateSessionData(sessionId, () => ({
            stage: "completed",
            responseStreaming: false,
          }));
          break;

        case "session:error":
          s.updateSessionData(sessionId, () => ({
            stage: "error",
            responseStreaming: false,
          }));
          break;

        case "stage:change": {
          const e = event as ServerEvent & { type: "stage:change" };
          s.updateSessionData(sessionId, () => ({ stage: e.stage }));
          break;
        }

        case "agent:thinking":
          s.updateSessionData(sessionId, () => ({ responseStreaming: true }));
          break;

        case "agent:response": {
          const e = event as ServerEvent & { type: "agent:response" };
          if (e.partial) {
            s.updateSessionData(sessionId, (data) => ({
              responseText: data.responseText + e.content,
              responseStreaming: true,
            }));
          } else {
            s.updateSessionData(sessionId, () => ({
              responseStreaming: false,
            }));
          }
          break;
        }

        case "agent:plan": {
          const e = event as ServerEvent & { type: "agent:plan" };
          s.updateSessionData(sessionId, () => ({
            currentPlan: e.plan,
            nextAction: e.nextAction,
          }));
          break;
        }

        case "agent:reasoning": {
          const e = event as ServerEvent & { type: "agent:reasoning" };
          s.updateSessionData(sessionId, (data) => ({
            reasoningSummaries: [
              ...data.reasoningSummaries,
              { summary: e.summary, context: e.context, timestamp: Date.now() },
            ],
          }));
          break;
        }

        case "tool:call": {
          const e = event as ServerEvent & { type: "tool:call" };
          s.updateSessionData(sessionId, (data) => {
            const updated = { ...data.toolActivities };
            const existing = updated[e.toolName];
            if (existing) {
              updated[e.toolName] = {
                ...existing,
                callCount: existing.callCount + 1,
                lastCalledAt: Date.now(),
              };
            } else {
              updated[e.toolName] = {
                toolName: e.toolName,
                callCount: 1,
                lastCalledAt: Date.now(),
                avgDurationMs: 0,
              };
            }
            return { toolActivities: updated };
          });
          break;
        }

        case "tool:result": {
          const e = event as ServerEvent & { type: "tool:result" };
          s.updateSessionData(sessionId, (data) => {
            const updated = { ...data.toolActivities };
            const activity = updated[e.toolName];
            if (activity && activity.callCount > 0) {
              updated[e.toolName] = {
                ...activity,
                avgDurationMs:
                  (activity.avgDurationMs * (activity.callCount - 1) +
                    e.durationMs) /
                  activity.callCount,
              };
            }
            return { toolActivities: updated };
          });
          break;
        }

        case "file:read": {
          const e = event as ServerEvent & { type: "file:read" };
          s.updateSessionData(sessionId, () => ({
            currentFile: { path: e.filePath, content: e.content },
          }));
          break;
        }

        case "file:write": {
          const e = event as ServerEvent & { type: "file:write" };
          s.updateSessionData(sessionId, (data) => {
            const fc = {
              filePath: e.filePath,
              changeType: "created" as const,
              timestamp: e.timestamp,
              diffAvailable: false,
            };
            const idx = data.fileChanges.findIndex(
              (f) => f.filePath === e.filePath
            );
            const fileChanges =
              idx >= 0
                ? data.fileChanges.map((f, i) => (i === idx ? fc : f))
                : [...data.fileChanges, fc];
            return {
              fileChanges,
              currentFile: { path: e.filePath, content: e.content },
              codeChanges: [
                ...data.codeChanges,
                {
                  type: "write" as const,
                  filePath: e.filePath,
                  timestamp: e.timestamp,
                  content: e.content,
                },
              ],
            };
          });
          break;
        }

        case "file:edit": {
          const e = event as ServerEvent & { type: "file:edit" };
          s.updateSessionData(sessionId, (data) => {
            const fc = {
              filePath: e.filePath,
              changeType: "modified" as const,
              timestamp: e.timestamp,
              diffAvailable: true,
            };
            const idx = data.fileChanges.findIndex(
              (f) => f.filePath === e.filePath
            );
            const fileChanges =
              idx >= 0
                ? data.fileChanges.map((f, i) => (i === idx ? fc : f))
                : [...data.fileChanges, fc];
            return {
              fileChanges,
              codeChanges: [
                ...data.codeChanges,
                {
                  type: "edit" as const,
                  filePath: e.filePath,
                  timestamp: e.timestamp,
                  oldString: e.oldString,
                  newString: e.newString,
                },
              ],
            };
          });
          break;
        }

        case "file:diff": {
          const e = event as ServerEvent & { type: "file:diff" };
          const diff = {
            filePath: e.filePath,
            before: e.before,
            after: e.after,
            hunks: e.hunks,
            timestamp: e.timestamp,
          };
          s.updateSessionData(sessionId, (data) => {
            const fc = {
              filePath: e.filePath,
              changeType: "modified" as const,
              timestamp: e.timestamp,
              diffAvailable: true,
            };
            const idx = data.fileChanges.findIndex(
              (f) => f.filePath === e.filePath
            );
            const fileChanges =
              idx >= 0
                ? data.fileChanges.map((f, i) => (i === idx ? fc : f))
                : [...data.fileChanges, fc];
            return {
              diffs: [...data.diffs, diff],
              selectedDiff: diff,
              fileChanges,
            };
          });
          break;
        }

        case "command:execute": {
          const e = event as ServerEvent & { type: "command:execute" };
          s.updateSessionData(sessionId, (data) => ({
            commands: [
              ...data.commands,
              {
                commandId: e.commandId,
                command: e.command,
                output: "",
                exitCode: null,
                durationMs: null,
                stream: "",
              },
            ],
            terminalOutput: data.terminalOutput + `$ ${e.command}\n`,
          }));
          break;
        }

        case "command:output": {
          const e = event as ServerEvent & { type: "command:output" };
          s.updateSessionData(sessionId, (data) => ({
            terminalOutput: data.terminalOutput + e.output,
            commands: data.commands.map((c) =>
              c.commandId === e.commandId
                ? { ...c, output: c.output + e.output }
                : c
            ),
          }));
          break;
        }

        case "command:complete": {
          const e = event as ServerEvent & { type: "command:complete" };
          s.updateSessionData(sessionId, (data) => ({
            commands: data.commands.map((c) =>
              c.commandId === e.commandId
                ? { ...c, exitCode: e.exitCode, durationMs: e.durationMs }
                : c
            ),
            terminalOutput:
              data.terminalOutput +
              `\n[exit ${e.exitCode}] (${e.durationMs}ms)\n`,
          }));
          break;
        }

        case "test:result": {
          const e = event as ServerEvent & { type: "test:result" };
          s.updateSessionData(sessionId, (data) => ({
            testResults: [
              ...data.testResults,
              {
                testSuite: e.testSuite,
                passed: e.passed,
                failed: e.failed,
                skipped: e.skipped,
                output: e.output,
                timestamp: e.timestamp,
              },
            ],
          }));
          break;
        }

        case "token:update": {
          const e = event as ServerEvent & { type: "token:update" };
          s.updateSessionData(sessionId, () => ({
            tokens: {
              inputTokens: e.inputTokens,
              outputTokens: e.outputTokens,
              cacheReadTokens: e.cacheReadTokens,
              cacheWriteTokens: e.cacheWriteTokens,
              totalCostUsd: e.totalCostUsd,
              contextBudgetRemaining: e.contextBudgetRemaining,
            },
          }));
          break;
        }

        case "approval:request": {
          const e = event as ServerEvent & { type: "approval:request" };
          s.updateSessionData(sessionId, (data) => ({
            pendingApprovals: [
              ...data.pendingApprovals,
              {
                requestId: e.requestId,
                action: e.action,
                description: e.description,
                detail: e.detail,
                timestamp: e.timestamp,
              },
            ],
          }));
          break;
        }

        case "hook:event": {
          const e = event as ServerEvent & { type: "hook:event" };
          s.updateSessionData(sessionId, (data) => ({
            hookEvents: [
              ...data.hookEvents,
              {
                hookName: e.hookName,
                hookType: e.hookType,
                result: e.result,
                timestamp: e.timestamp,
              },
            ],
          }));
          break;
        }
      }
    },
    []
  );

  const connect = useCallback(() => {
    if (disposedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (disposedRef.current) {
        ws.close();
        return;
      }
      console.log("[WS] Connected");
      useSessionStore.getState().setConnected(true);
      reconnectAttemptRef.current = 0;
      ws.send(JSON.stringify({ type: "session:list" }));
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        handleEvent(data);
      } catch (err) {
        console.warn("[WS] Parse error:", err);
      }
    };

    ws.onclose = () => {
      console.log("[WS] Disconnected");
      useSessionStore.getState().setConnected(false);
      if (!disposedRef.current) {
        scheduleReconnect();
      }
    };

    ws.onerror = () => {};
  }, [handleEvent]);

  const scheduleReconnect = useCallback(() => {
    if (disposedRef.current) return;
    if (reconnectTimerRef.current) return;

    const delay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptRef.current),
      MAX_RECONNECT_DELAY
    );
    reconnectAttemptRef.current++;

    console.log(`[WS] Reconnecting in ${delay}ms...`);
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (!disposedRef.current) {
        connect();
      }
    }, delay);
  }, [connect]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      console.warn("[WS] Not connected, message dropped");
    }
  }, []);

  const reconnect = useCallback(() => {
    // Close existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null; // Prevent auto-reconnect from firing
      wsRef.current.close();
      wsRef.current = null;
    }
    // Cancel pending reconnect timer
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    // Reset backoff counter and connect immediately
    reconnectAttemptRef.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    disposedRef.current = false;
    connect();
    return () => {
      disposedRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return { send, reconnect };
}
