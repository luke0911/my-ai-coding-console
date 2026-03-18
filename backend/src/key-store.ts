/**
 * Key store: persists API keys securely.
 *
 * When running under Electron, keys are sent to the main process via IPC
 * for encrypted storage using the OS keychain (safeStorage).
 * In development mode (no IPC), falls back to a plain JSON file.
 *
 * On load, keys are restored into process.env.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const DATA_DIR = join(homedir(), ".ai-console-data");
const KEYS_FILE = join(DATA_DIR, "keys.json");

interface StoredKeys {
  anthropicApiKey?: string;
  openaiApiKey?: string;
}

class KeyStore {
  private keys: StoredKeys = {};
  private readonly useIpc: boolean;

  constructor() {
    // If spawned by Electron with IPC channel, use IPC for persistence
    this.useIpc = typeof process.send === "function";
    if (this.useIpc) {
      console.log("[KeyStore] Using Electron IPC for encrypted key storage");
    }
    this.load();
  }

  /** Load keys from process.env (set by Electron) or fallback to disk */
  private load(): void {
    try {
      // Keys from process.env (injected by Electron main process from encrypted storage)
      if (process.env.ANTHROPIC_API_KEY) {
        this.keys.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
        console.log("[KeyStore] Loaded Anthropic API key from environment");
      }
      if (process.env.OPENAI_API_KEY) {
        this.keys.openaiApiKey = process.env.OPENAI_API_KEY;
        console.log("[KeyStore] Loaded OpenAI API key from environment");
      }

      // Development fallback: read from plain JSON file
      if (!this.useIpc && existsSync(KEYS_FILE)) {
        const raw = readFileSync(KEYS_FILE, "utf-8");
        const stored = JSON.parse(raw) as StoredKeys;

        if (stored.anthropicApiKey && !this.keys.anthropicApiKey) {
          this.keys.anthropicApiKey = stored.anthropicApiKey;
          process.env.ANTHROPIC_API_KEY = stored.anthropicApiKey;
          console.log("[KeyStore] Restored Anthropic API key from disk");
        }
        if (stored.openaiApiKey && !this.keys.openaiApiKey) {
          this.keys.openaiApiKey = stored.openaiApiKey;
          process.env.OPENAI_API_KEY = stored.openaiApiKey;
          console.log("[KeyStore] Restored OpenAI API key from disk");
        }
      }
    } catch (err) {
      console.warn("[KeyStore] Failed to load keys:", err);
    }
  }

  /** Save keys: via IPC (Electron) or fallback to plain file (dev mode) */
  private save(): void {
    if (this.useIpc) {
      process.send!({ type: "save-keys", keys: this.keys });
      return;
    }

    // Development fallback: plain JSON file
    try {
      if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
      }
      writeFileSync(KEYS_FILE, JSON.stringify(this.keys, null, 2), {
        mode: 0o600,
      });
    } catch (err) {
      console.error("[KeyStore] Failed to save keys:", err);
    }
  }

  setAnthropicKey(key: string): void {
    if (key) {
      this.keys.anthropicApiKey = key;
      process.env.ANTHROPIC_API_KEY = key;
    } else {
      delete this.keys.anthropicApiKey;
      delete process.env.ANTHROPIC_API_KEY;
    }
    this.save();
  }

  setOpenAiKey(key: string): void {
    if (key) {
      this.keys.openaiApiKey = key;
      process.env.OPENAI_API_KEY = key;
    } else {
      delete this.keys.openaiApiKey;
      delete process.env.OPENAI_API_KEY;
    }
    this.save();
  }

  hasAnthropicKey(): boolean {
    return !!this.keys.anthropicApiKey;
  }

  hasOpenAiKey(): boolean {
    return !!this.keys.openaiApiKey;
  }
}

export const keyStore = new KeyStore();
