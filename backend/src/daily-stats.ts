/**
 * DailyStats: Tracks cumulative daily token usage with file persistence.
 *
 * Subscribes to token:update events from the event bus and accumulates
 * daily totals. Persists to disk so stats survive app restarts.
 * Auto-resets when the UTC date changes.
 */

import * as fs from "fs";
import * as path from "path";
import { eventBus } from "./event-bus.js";
import type { ServerEvent } from "@my-ai-console/shared";

const DATA_DIR = path.join(process.cwd(), ".ai-console-data");
const STATS_FILE = path.join(DATA_DIR, "daily-stats.json");

interface DailyStatsData {
  date: string; // YYYY-MM-DD (UTC)
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowResetTime(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

class DailyStatsTracker {
  private stats: DailyStatsData;

  constructor() {
    this.stats = this.load();
    this.startEventSubscription();
  }

  private load(): DailyStatsData {
    try {
      if (fs.existsSync(STATS_FILE)) {
        const raw = JSON.parse(fs.readFileSync(STATS_FILE, "utf-8"));
        if (raw.date === todayUTC()) {
          return raw;
        }
      }
    } catch {
      // Corrupted file, start fresh
    }
    return { date: todayUTC(), inputTokens: 0, outputTokens: 0, costUsd: 0 };
  }

  private save(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(STATS_FILE, JSON.stringify(this.stats, null, 2));
    } catch (err) {
      console.error("[DailyStats] Failed to save:", err);
    }
  }

  private checkDateReset(): void {
    if (this.stats.date !== todayUTC()) {
      this.stats = { date: todayUTC(), inputTokens: 0, outputTokens: 0, costUsd: 0 };
      this.save();
    }
  }

  addTokens(input: number, output: number, cost: number): void {
    this.checkDateReset();
    this.stats.inputTokens += input;
    this.stats.outputTokens += output;
    this.stats.costUsd += cost;
    this.save();
  }

  getToday(): DailyStatsData & { resetTime: string } {
    this.checkDateReset();
    return { ...this.stats, resetTime: tomorrowResetTime() };
  }

  private startEventSubscription(): void {
    eventBus.subscribe((event: ServerEvent) => {
      if (event.type === "token:update") {
        this.addTokens(
          event.inputTokens,
          event.outputTokens,
          event.totalCostUsd,
        );
      }
    });
  }
}

// Singleton
export const dailyStats = new DailyStatsTracker();
