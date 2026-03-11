/**
 * EventBus: Decouples event producers (Claude client, hooks) from consumers (WebSocket).
 *
 * Design decision: Using a simple typed EventEmitter pattern instead of a pub/sub library.
 * This keeps the dependency count low while still providing typed event routing.
 * The bus is per-process — no need for distributed events in a local-first app.
 */

import type { ServerEvent } from "@my-ai-console/shared";

type EventListener = (event: ServerEvent) => void;

class EventBus {
  private listeners: Set<EventListener> = new Set();

  /** Subscribe to all server events */
  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Emit an event to all subscribers */
  emit(event: ServerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[EventBus] Listener error:", err);
      }
    }
  }
}

// Singleton — one bus per process
export const eventBus = new EventBus();
