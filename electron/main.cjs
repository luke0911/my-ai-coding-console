/**
 * Electron main process.
 *
 * Starts the backend and frontend dev servers as child processes,
 * waits for them to be ready, then opens a BrowserWindow.
 * On window close, all child processes are cleaned up.
 */

const { app, BrowserWindow, shell, dialog, ipcMain, session } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const ROOT_DIR = path.resolve(__dirname, "..");
const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";
const IS_LINUX = process.platform === "linux";
const BACKEND_PORT = 3001;
const FRONTEND_PORT = 3000;
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;
const BACKEND_HEALTH = `http://localhost:${BACKEND_PORT}/health`;

let mainWindow = null;
let backendProcess = null;
let frontendProcess = null;
let authPopup = null;

// ─── Process management ─────────────────────────────────────────

function startBackend() {
  return new Promise((resolve) => {
    backendProcess = spawn("node", ["dist/index.js"], {
      cwd: path.join(ROOT_DIR, "backend"),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PORT: String(BACKEND_PORT) },
    });

    backendProcess.stdout.on("data", (data) => {
      const msg = data.toString();
      console.log(`[backend] ${msg.trim()}`);
      if (msg.includes("WebSocket server ready") || msg.includes("AI Coding Console Backend")) {
        resolve();
      }
    });

    backendProcess.stderr.on("data", (data) => {
      console.error(`[backend:err] ${data.toString().trim()}`);
    });

    backendProcess.on("error", (err) => {
      console.error("[backend] Failed to start:", err);
      resolve(); // Don't block startup
    });

    // Timeout fallback
    setTimeout(resolve, 8000);
  });
}

function startFrontend() {
  return new Promise((resolve) => {
    const nextBin = path.join(ROOT_DIR, "node_modules", ".bin", IS_WIN ? "next.cmd" : "next");
    frontendProcess = spawn(nextBin, ["start", "--port", String(FRONTEND_PORT)], {
      cwd: path.join(ROOT_DIR, "frontend"),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    frontendProcess.stdout.on("data", (data) => {
      const msg = data.toString();
      console.log(`[frontend] ${msg.trim()}`);
      if (msg.includes("Ready in") || msg.includes("ready")) {
        resolve();
      }
    });

    frontendProcess.stderr.on("data", (data) => {
      // Next.js outputs info to stderr too
      const msg = data.toString();
      console.log(`[frontend] ${msg.trim()}`);
      if (msg.includes("Ready in") || msg.includes("ready")) {
        resolve();
      }
    });

    frontendProcess.on("error", (err) => {
      console.error("[frontend] Failed to start:", err);
      resolve();
    });

    // Timeout fallback
    setTimeout(resolve, 15000);
  });
}

/** Poll a URL until it responds with 200 */
function waitForServer(url, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const start = Date.now();

    function check() {
      if (Date.now() - start > timeoutMs) {
        console.warn(`[wait] Timeout waiting for ${url}`);
        resolve(false);
        return;
      }

      http
        .get(url, (res) => {
          if (res.statusCode >= 200 && res.statusCode < 400) {
            resolve(true);
          } else {
            setTimeout(check, 500);
          }
        })
        .on("error", () => {
          setTimeout(check, 500);
        });
    }

    check();
  });
}

// ─── Window management ──────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 500,
    minHeight: 300,
    title: "AI 코딩 콘솔",
    icon: path.join(__dirname, IS_MAC ? "icon.icns" : "icon.png"),
    backgroundColor: "#0d1117",
    ...(IS_MAC ? {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 12, y: 12 },
    } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  // Open external links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── Cleanup ────────────────────────────────────────────────────

function killProcess(proc) {
  if (!proc || proc.killed) return;
  if (IS_WIN) {
    try {
      spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"]);
    } catch {
      // ignore — process may already be gone
    }
  } else {
    proc.kill("SIGTERM");
    setTimeout(() => {
      if (!proc.killed) proc.kill("SIGKILL");
    }, 3000);
  }
}

function killChildren() {
  console.log("[cleanup] Stopping child processes...");
  killProcess(backendProcess);
  killProcess(frontendProcess);
}

// ─── App lifecycle ──────────────────────────────────────────────

// ─── IPC handlers ───────────────────────────────────────────────

ipcMain.handle("dialog:selectFolder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "작업 폴더 선택",
    properties: ["openDirectory"],
    buttonLabel: "폴더 선택",
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("dialog:selectDataFile", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "데이터 파일 선택",
    properties: ["openFile"],
    filters: [
      { name: "데이터 파일", extensions: ["csv", "xlsx", "xls", "txt", "tsv"] },
      { name: "CSV", extensions: ["csv"] },
      { name: "Excel", extensions: ["xlsx", "xls"] },
      { name: "텍스트", extensions: ["txt", "tsv"] },
    ],
    buttonLabel: "파일 선택",
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("app:restartBackend", async () => {
  console.log("[ipc] Restarting backend...");
  killProcess(backendProcess);
  backendProcess = null;
  // Wait for the old process to fully die
  await new Promise((r) => setTimeout(r, 1000));
  await startBackend();
  const ready = await waitForServer(BACKEND_HEALTH, 10000);
  console.log(`[ipc] Backend restart ${ready ? "succeeded" : "timed out"}`);
  return { success: ready };
});

ipcMain.handle("shell:openExternal", (_event, url) => {
  // Only allow https URLs to Anthropic domains
  if (typeof url === "string" && url.startsWith("https://")) {
    shell.openExternal(url);
  }
});

// ─── Claude auth IPC ────────────────────────────────────────────

ipcMain.handle("auth:openClaudeLogin", async () => {
  // Prevent multiple popups
  if (authPopup && !authPopup.isDestroyed()) {
    authPopup.focus();
    return { success: false, reason: "already_open" };
  }

  return new Promise((resolve) => {
    let resolved = false;

    authPopup = new BrowserWindow({
      width: 500,
      height: 700,
      parent: mainWindow,
      modal: false,
      title: "Claude 로그인",
      backgroundColor: "#0d1117",
      webPreferences: {
        partition: "persist:claude-auth",
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // Security: only allow navigation to claude.ai / Anthropic auth domains
    authPopup.webContents.on("will-navigate", (event, url) => {
      const allowed =
        url.startsWith("https://claude.ai") ||
        url.startsWith("https://accounts.anthropic.com") ||
        url.startsWith("https://auth.anthropic.com");
      if (!allowed) {
        event.preventDefault();
        console.log("[auth] Blocked navigation to:", url);
      }
    });

    authPopup.webContents.setWindowOpenHandler(({ url }) => {
      const allowed =
        url.startsWith("https://claude.ai") ||
        url.startsWith("https://accounts.anthropic.com") ||
        url.startsWith("https://auth.anthropic.com");
      if (allowed) {
        authPopup.loadURL(url);
      }
      return { action: "deny" };
    });

    // Detect successful login: user lands on an authenticated claude.ai page
    authPopup.webContents.on("did-navigate", (_event, url) => {
      console.log("[auth] Navigated to:", url);
      if (
        url.startsWith("https://claude.ai") &&
        !url.includes("/login") &&
        !url.includes("/signup") &&
        !url.includes("/oauth")
      ) {
        console.log("[auth] Login detected, closing popup");
        resolved = true;
        setTimeout(() => {
          if (authPopup && !authPopup.isDestroyed()) {
            authPopup.close();
          }
        }, 1000);
        resolve({ success: true });
      }
    });

    // Handle popup closed by user without completing login
    authPopup.on("closed", () => {
      authPopup = null;
      if (!resolved) {
        resolve({ success: false, reason: "closed" });
      }
    });

    authPopup.loadURL("https://claude.ai/login");
  });
});

ipcMain.handle("auth:checkClaudeSession", async () => {
  try {
    const ses = session.fromPartition("persist:claude-auth");
    const cookies = await ses.cookies.get({ domain: ".claude.ai" });
    const hasSession = cookies.some(
      (c) => c.name === "sessionKey" || c.name.includes("session")
    );
    return { authenticated: hasSession, cookieCount: cookies.length };
  } catch (err) {
    console.error("[auth] Cookie check failed:", err);
    return { authenticated: false, cookieCount: 0 };
  }
});

ipcMain.handle("auth:clearClaudeSession", async () => {
  try {
    const ses = session.fromPartition("persist:claude-auth");
    await ses.clearStorageData({
      storages: ["cookies"],
      origin: "https://claude.ai",
    });
    return { success: true };
  } catch (err) {
    console.error("[auth] Clear session failed:", err);
    return { success: false };
  }
});

// ─── App lifecycle ──────────────────────────────────────────────

app.on("ready", async () => {
  console.log("[app] Starting AI Coding Console...");

  // Show window immediately with loading screen
  createWindow();
  mainWindow.loadFile(path.join(__dirname, "loading.html"));

  // Start servers in parallel
  console.log("[app] Starting backend and frontend servers...");
  await Promise.all([startBackend(), startFrontend()]);

  // Wait for both to be accessible
  console.log("[app] Waiting for servers to be ready...");
  await Promise.all([
    waitForServer(BACKEND_HEALTH),
    waitForServer(FRONTEND_URL),
  ]);

  // Switch to the real frontend
  console.log("[app] Servers ready, loading frontend...");
  if (mainWindow) {
    mainWindow.loadURL(FRONTEND_URL);
  }
});

app.on("window-all-closed", () => {
  killChildren();
  app.quit();
});

app.on("before-quit", () => {
  killChildren();
});

process.on("SIGINT", () => {
  killChildren();
  process.exit();
});

process.on("SIGTERM", () => {
  killChildren();
  process.exit();
});
