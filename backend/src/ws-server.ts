/**
 * WebSocket server: bridges the EventBus to connected frontend clients.
 *
 * Design: Each WS connection subscribes to the EventBus and receives all events.
 * Client messages (prompts, approvals, config) are parsed and routed to the
 * appropriate handler. This keeps the transport layer thin — business logic
 * lives in session-manager, claude-client, and approval modules.
 */

import { WebSocketServer, WebSocket } from "ws";
import { execSync } from "child_process";
import type { Server } from "http";
import type { ClientMessage, ServerEvent } from "@my-ai-console/shared";
import { eventBus } from "./event-bus.js";
import { approvalManager } from "./approval.js";
import {
  createSession,
  listSessions,
  resumeSession,
} from "./session-manager.js";
import { isCodexAvailable } from "./codex-client.js";
import { dailyStats } from "./daily-stats.js";
import { checkRateLimit } from "./rate-limit-checker.js";

function isClaudeCliAvailable(): boolean {
  try {
    execSync("claude --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

interface ConnectedClient {
  ws: WebSocket;
  unsubscribe: () => void;
}

const clients = new Set<ConnectedClient>();

export function setupWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    console.log("[WS] Client connected");

    // Subscribe this client to all events, and emit quota:update after token:update
    const unsubscribe = eventBus.subscribe((event: ServerEvent) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(event));

        // After each token:update, also send quota:update (fire-and-forget)
        if (event.type === "token:update") {
          buildQuotaEvent(event.sessionId).then((quotaEvent) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(quotaEvent));
            }
          }).catch(() => {});
        }
      }
    });

    const client: ConnectedClient = { ws, unsubscribe };
    clients.add(client);

    // Handle incoming messages
    ws.on("message", async (data) => {
      try {
        const msg: ClientMessage = JSON.parse(data.toString());
        await handleClientMessage(ws, msg);
      } catch (err) {
        console.error("[WS] Invalid message:", err);
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Invalid message format",
          })
        );
      }
    });

    ws.on("close", () => {
      console.log("[WS] Client disconnected");
      unsubscribe();
      clients.delete(client);
    });

    ws.on("error", (err) => {
      console.error("[WS] Client error:", err);
      unsubscribe();
      clients.delete(client);
    });

    // Send initial connection acknowledgment with per-provider availability
    const claudeAvailable = isClaudeCliAvailable();
    const codexAvailable = isCodexAvailable();
    ws.send(
      JSON.stringify({
        type: "connection:established",
        timestamp: Date.now(),
        mockMode: !claudeAvailable,
        cliAvailable: claudeAvailable,
        claudeAvailable,
        codexAvailable,
      })
    );

    // Send current daily quota on connect
    buildQuotaEvent("").then((quotaEvent) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(quotaEvent));
      }
    });
  });

  console.log("[WS] WebSocket server ready on /ws");
  return wss;
}

async function handleClientMessage(
  ws: WebSocket,
  msg: ClientMessage
): Promise<void> {
  switch (msg.type) {
    case "prompt:send": {
      console.log(`[WS] Prompt received: "${msg.prompt.substring(0, 50)}..." (provider: ${msg.provider}, model: ${msg.model})`);
      const sessionId = await createSession(
        msg.prompt,
        msg.workspacePath,
        msg.model,
        msg.sessionId,
        msg.provider
      );
      ws.send(
        JSON.stringify({
          type: "session:assigned",
          sessionId,
          timestamp: Date.now(),
        })
      );
      break;
    }

    case "approval:respond": {
      const handled = approvalManager.respond(msg.requestId, msg.approved);
      if (handled) {
        eventBus.emit({
          type: "approval:response",
          sessionId: msg.sessionId,
          timestamp: Date.now(),
          requestId: msg.requestId,
          approved: msg.approved,
        });
      }
      break;
    }

    case "session:resume": {
      const events = resumeSession(msg.sessionId);
      if (events) {
        // Replay all events for this session
        ws.send(
          JSON.stringify({
            type: "session:replay:start",
            sessionId: msg.sessionId,
            eventCount: events.length,
          })
        );
        for (const event of events) {
          ws.send(JSON.stringify(event));
        }
        ws.send(
          JSON.stringify({
            type: "session:replay:end",
            sessionId: msg.sessionId,
          })
        );
      } else {
        ws.send(
          JSON.stringify({
            type: "session:error",
            sessionId: msg.sessionId,
            timestamp: Date.now(),
            error: "Session not found",
            recoverable: false,
          })
        );
      }
      break;
    }

    case "session:list": {
      const sessions = listSessions();
      ws.send(
        JSON.stringify({
          type: "session:list:response",
          sessions,
        })
      );
      break;
    }

    case "config:update": {
      approvalManager.updateConfig({ mode: msg.approvalMode });
      ws.send(
        JSON.stringify({
          type: "config:updated",
          approvalMode: msg.approvalMode,
          timestamp: Date.now(),
        })
      );
      break;
    }

    case "apikey:set": {
      // API key is optional — Claude Max uses OAuth via CLI
      if (msg.apiKey && msg.apiKey.trim()) {
        process.env.ANTHROPIC_API_KEY = msg.apiKey.trim();
        console.log("[WS] API 키 설정됨");
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
      const cliReady = isClaudeCliAvailable();
      ws.send(
        JSON.stringify({
          type: "apikey:status",
          configured: !!process.env.ANTHROPIC_API_KEY || cliReady,
          mockMode: !cliReady && !process.env.ANTHROPIC_API_KEY,
          cliAvailable: cliReady,
          timestamp: Date.now(),
        })
      );

      // Send updated quota with new API key's rate limit info
      buildQuotaEvent("").then((quotaEvent) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(quotaEvent));
        }
      });
      break;
    }
  }
}

async function buildQuotaEvent(sessionId: string) {
  const today = dailyStats.getToday();
  const apiKey = process.env.ANTHROPIC_API_KEY;

  let rateLimitTokensLimit = -1;
  let rateLimitTokensRemaining = -1;
  let rateLimitTokensReset = "";
  let rateLimitRequestsLimit = -1;
  let rateLimitRequestsRemaining = -1;

  if (apiKey) {
    const rl = await checkRateLimit(apiKey);
    if (rl) {
      rateLimitTokensLimit = rl.tokensLimit;
      rateLimitTokensRemaining = rl.tokensRemaining;
      rateLimitTokensReset = rl.tokensReset;
      rateLimitRequestsLimit = rl.requestsLimit;
      rateLimitRequestsRemaining = rl.requestsRemaining;
    }
  }

  return {
    type: "quota:update" as const,
    sessionId,
    timestamp: Date.now(),
    dailyInputTokens: today.inputTokens,
    dailyOutputTokens: today.outputTokens,
    dailyCostUsd: today.costUsd,
    dailyResetTime: today.resetTime,
    rateLimitTokensLimit,
    rateLimitTokensRemaining,
    rateLimitTokensReset,
    rateLimitRequestsLimit,
    rateLimitRequestsRemaining,
  };
}
