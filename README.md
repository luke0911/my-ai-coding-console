# My AI Coding Console

An AI coding observability dashboard — watch Claude code in real time.

## What is this?

A local-first web app that acts as a custom UI for Claude-powered coding sessions. Instead of just showing chat output, it exposes the entire coding process: file reads, edits, diffs, command execution, test results, reasoning summaries, and token usage.

## Architecture

```
Frontend (Next.js :3000)  ←— WebSocket —→  Backend (Node.js :3001)
                                              ↓
                                      Claude Agent SDK
                                      (or mock mode)
```

- **Frontend**: Next.js + React + TypeScript + Tailwind CSS + Monaco Editor
- **Backend**: Node.js + Express + ws (WebSocket) + TypeScript
- **Shared**: Typed event schemas used by both frontend and backend
- **State**: Zustand (lightweight, no boilerplate)
- **Real-time**: WebSocket with auto-reconnect

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+ (uses workspaces)

### Setup

```bash
# Install all dependencies
npm install

# Build the shared types package
npm run build:shared

# Start both frontend and backend
npm run dev
```

This starts:
- Frontend at http://localhost:3000
- Backend at http://localhost:3001 (WebSocket at ws://localhost:3001/ws)

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | No | Claude API key. If not set, runs in **mock mode** |
| `PORT` | No | Backend port (default: 3001) |
| `NEXT_PUBLIC_WS_URL` | No | WebSocket URL (default: ws://localhost:3001/ws) |

### Mock Mode

If `ANTHROPIC_API_KEY` is not set, the backend runs in mock mode — it simulates a realistic coding session with file reads, writes, diffs, test execution, and streaming responses. This is useful for frontend development and demos.

## UI Layout

```
┌──────────┬────────────────────────┬───────────┐
│ Sidebar  │     Center Panel       │  Right    │
│          │  ┌──────────────────┐  │  Panel    │
│ Sessions │  │   Prompt Input   │  │           │
│ Model    │  ├──────────────────┤  │  Plan     │
│ Tokens   │  │   Live Stream    │  │  Reason   │
│ Stage    │  │   / Diff View    │  │  Warnings │
│ Files    │  │   / File View    │  │           │
│ Tools    │  ├──────────────────┤  │           │
│          │  │  File Timeline   │  │           │
├──────────┴──┴──────────────────┴──┴───────────┤
│              Bottom Panel                      │
│   Terminal | Tests | Commands | Hooks          │
└────────────────────────────────────────────────┘
```

## Features

### Implemented (MVP)
- [x] Prompt passthrough to Claude Agent SDK
- [x] Real-time event streaming via WebSocket
- [x] Live stream view (event timeline + response text)
- [x] File change tracking and visualization
- [x] Diff viewer (Monaco diff editor)
- [x] File viewer (Monaco editor)
- [x] Reasoning summary panel
- [x] Current plan / next action display
- [x] Token and cost dashboard with context budget meter
- [x] Terminal output panel
- [x] Test results panel
- [x] Command history
- [x] Hook event system and log
- [x] Approval mode (manual/auto toggle)
- [x] Session persistence (JSON file storage)
- [x] Session list and resume
- [x] Mock mode for development
- [x] Auto-reconnect WebSocket
- [x] File change timeline

### Future Extensions
- [ ] xterm.js integration for full ANSI terminal rendering
- [ ] Interactive file tree browser
- [ ] Multi-session parallel view
- [ ] Custom hook registration from UI
- [ ] Session export/import
- [ ] Prompt history and templates
- [ ] Dark/light theme toggle
- [ ] Keyboard shortcuts
- [ ] Workspace file watcher
- [ ] Git integration (branch, commit, diff from HEAD)
- [ ] Cost budget limits / alerts
- [ ] Plugin system for custom panels

## Event Schema

Events flow from backend to frontend via WebSocket. Each event has a `type`, `sessionId`, and `timestamp`.

**Session lifecycle**: `session:created`, `session:resumed`, `session:completed`, `session:error`
**Agent activity**: `agent:thinking`, `agent:response`, `agent:plan`, `agent:reasoning`
**Tool calls**: `tool:call`, `tool:result`
**File operations**: `file:read`, `file:write`, `file:diff`
**Commands**: `command:execute`, `command:output`, `command:complete`
**Tests**: `test:run`, `test:result`
**Tokens**: `token:update`
**Approval**: `approval:request`, `approval:response`
**Hooks**: `hook:event`
**Stage**: `stage:change`

See `shared/src/events.ts` for full type definitions.

## Project Structure

```
my-ai-coding-console/
├── shared/src/          # Shared TypeScript types
│   ├── events.ts        # All event type definitions
│   └── types.ts         # Domain types (sessions, tools, etc.)
├── backend/src/
│   ├── index.ts         # Entry point (Express + HTTP server)
│   ├── ws-server.ts     # WebSocket server + message routing
│   ├── session-manager.ts  # Session lifecycle + persistence
│   ├── claude-client.ts # Claude SDK wrapper + mock fallback
│   ├── mock-mode.ts     # Simulated coding session
│   ├── event-bus.ts     # Internal event pub/sub
│   ├── hooks.ts         # Hook system (extensible)
│   └── approval.ts      # Approval gating for file/command ops
├── frontend/src/
│   ├── app/             # Next.js app router
│   ├── components/      # UI components by feature
│   │   ├── layout/      # Sidebar, CenterPanel, RightPanel, BottomPanel
│   │   ├── prompt/      # PromptInput
│   │   ├── stream/      # LiveStream (event timeline)
│   │   ├── diff/        # DiffViewer (Monaco diff editor)
│   │   ├── files/       # FileViewer (Monaco editor)
│   │   ├── terminal/    # TerminalPanel
│   │   ├── reasoning/   # ReasoningSummary
│   │   ├── tokens/      # TokenDashboard
│   │   ├── approval/    # ApprovalDialog
│   │   ├── session/     # SessionList
│   │   ├── timeline/    # FileTimeline
│   │   └── hooks-panel/ # HooksPanel
│   ├── hooks/           # React hooks (useWebSocket)
│   ├── store/           # Zustand store
│   └── lib/             # Utilities
└── README.md
```

## Design Decisions

1. **Event bus over direct coupling**: The backend uses an EventBus singleton to decouple Claude integration from WebSocket transport. This makes it easy to add new event sources or consumers.

2. **Zustand over Redux**: For a dashboard that primarily receives events and displays them, Zustand's simplicity is ideal. No action creators, reducers, or middleware.

3. **Monaco for diffs**: The built-in diff editor provides a professional-grade experience with syntax highlighting, side-by-side comparison, and word-level diffs.

4. **Mock mode built-in**: Rather than requiring an API key for development, mock mode generates realistic events. This makes frontend development independent of backend/API availability.

5. **JSON file persistence**: For a local-first app, JSON files are simpler than SQLite or a database. Sessions are small and infrequently written.

6. **Approval as Promise**: The approval manager uses a Promise-based API — `requestApproval()` blocks the agent until the user responds. This keeps the flow sequential and easy to reason about.
