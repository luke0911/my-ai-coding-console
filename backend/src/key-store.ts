/**
 * Key store: persists API keys to disk so they survive app restarts.
 *
 * Keys are stored in `.ai-console-data/keys.json` with 0o600 permissions.
 * On load, keys are restored into process.env.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

const DATA_DIR = join(homedir(), ".ai-console-data");
const KEYS_FILE = join(DATA_DIR, "keys.json");

interface StoredKeys {
  anthropicApiKey?: string;
  openaiApiKey?: string;
}

class KeyStore {
  private keys: StoredKeys = {};

  constructor() {
    this.load();
  }

  /** Load keys from disk and restore them into process.env */
  private load(): void {
    try {
      if (existsSync(KEYS_FILE)) {
        const raw = readFileSync(KEYS_FILE, "utf-8");
        this.keys = JSON.parse(raw) as StoredKeys;

        if (this.keys.anthropicApiKey && !process.env.ANTHROPIC_API_KEY) {
          process.env.ANTHROPIC_API_KEY = this.keys.anthropicApiKey;
          console.log("[KeyStore] Restored Anthropic API key from disk");
        }
        if (this.keys.openaiApiKey && !process.env.OPENAI_API_KEY) {
          process.env.OPENAI_API_KEY = this.keys.openaiApiKey;
          console.log("[KeyStore] Restored OpenAI API key from disk");
        }
      }
    } catch (err) {
      console.warn("[KeyStore] Failed to load keys:", err);
    }
  }

  /** Save current keys to disk */
  private save(): void {
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
