/**
 * Backend entry point.
 *
 * Starts an Express HTTP server with WebSocket support.
 * The HTTP server provides a health check endpoint.
 * The WebSocket server handles all real-time communication with the frontend.
 */

import express from "express";
import cors from "cors";
import { exec, execSync } from "child_process";
import { createServer } from "http";
import { setupWebSocketServer } from "./ws-server.js";
import { createAnalysisRouter } from "./data-analysis-routes.js";
// Restore persisted API keys before anything else uses process.env
import "./key-store.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);

// Cache CLI availability — re-check every 30 seconds
let cachedCliAvailable: boolean | null = null;
let cliCheckTimestamp = 0;
const CLI_CACHE_TTL = 30_000;

function checkClaudeCliSync(): boolean {
  try {
    execSync("claude --version", { stdio: "pipe", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function checkClaudeCliCached(): boolean {
  const now = Date.now();
  if (cachedCliAvailable === null || now - cliCheckTimestamp > CLI_CACHE_TTL) {
    cachedCliAvailable = checkClaudeCliSync();
    cliCheckTimestamp = now;
  }
  return cachedCliAvailable;
}

function refreshClaudeCliAsync(): void {
  exec("claude --version", { timeout: 5000 }, (err) => {
    cachedCliAvailable = !err;
    cliCheckTimestamp = Date.now();
  });
}

const app = express();
app.use(cors({
  origin: [
    /^http:\/\/localhost(:\d+)?$/,
    /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  ],
}));
app.use(express.json());

// Data analysis routes
app.use("/api/data", createAnalysisRouter());

// Health check (non-blocking — uses cached CLI status)
app.get("/health", (_req, res) => {
  const cliAvailable = checkClaudeCliCached();
  res.json({
    status: "ok",
    mockMode: !cliAvailable && !process.env.ANTHROPIC_API_KEY,
    cliAvailable,
    uptime: process.uptime(),
  });
  // Refresh CLI status in background for next request
  refreshClaudeCliAsync();
});

const server = createServer(app);
setupWebSocketServer(server);

server.listen(PORT, () => {
  const cliAvailable = checkClaudeCliCached();
  const mode = cliAvailable ? "CLI (OAuth)" : process.env.ANTHROPIC_API_KEY ? "API Key" : "MOCK";
  console.log(`\n🚀 AI Coding Console Backend`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Mode: ${mode}`);
  console.log(`   WS:   ws://localhost:${PORT}/ws`);
  console.log(`   API:  http://localhost:${PORT}/health\n`);
});
