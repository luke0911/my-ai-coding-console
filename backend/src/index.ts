/**
 * Backend entry point.
 *
 * Starts an Express HTTP server with WebSocket support.
 * The HTTP server provides a health check endpoint.
 * The WebSocket server handles all real-time communication with the frontend.
 */

import express from "express";
import cors from "cors";
import { execSync } from "child_process";
import { createServer } from "http";
import { setupWebSocketServer } from "./ws-server.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);

function checkClaudeCli(): boolean {
  try {
    execSync("claude --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  const cliAvailable = checkClaudeCli();
  res.json({
    status: "ok",
    mockMode: !cliAvailable && !process.env.ANTHROPIC_API_KEY,
    cliAvailable,
    uptime: process.uptime(),
  });
});

const server = createServer(app);
setupWebSocketServer(server);

server.listen(PORT, () => {
  const cliAvailable = checkClaudeCli();
  const mode = cliAvailable ? "CLI (OAuth)" : process.env.ANTHROPIC_API_KEY ? "API Key" : "MOCK";
  console.log(`\n🚀 AI Coding Console Backend`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Mode: ${mode}`);
  console.log(`   WS:   ws://localhost:${PORT}/ws`);
  console.log(`   API:  http://localhost:${PORT}/health\n`);
});
