import { logger } from "@hospital-cms/logger";

// PLUGIN EVENT BUS
// Lightweight in-process pub/sub for plugin ↔ core communication.
// Plugins subscribe by event name; core emits events.
// Subscriber failures are isolated — they never crash the host.

const log = logger("plugin:event-bus");

type EventHandler = (payload: unknown) => void | Promise<void>;

export class PluginEventBus {
  private readonly subscriptions = new Map<string, Map<string, EventHandler>>();

  subscribe(pluginId: string, event: string, handler: EventHandler): void {
    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, new Map());
    }
    this.subscriptions.get(event)!.set(pluginId, handler);
    log.debug({ pluginId, event }, "Plugin subscribed to event");
  }

  unsubscribeAll(pluginId: string): void {
    for (const handlers of this.subscriptions.values()) {
      handlers.delete(pluginId);
    }
    log.debug({ pluginId }, "Plugin unsubscribed from all events");
  }

  async emit(event: string, payload: unknown): Promise<void> {
    const handlers = this.subscriptions.get(event);
    if (!handlers || handlers.size === 0) return;

    const tasks: Promise<void>[] = [];
    for (const [pluginId, handler] of handlers) {
      tasks.push(
        Promise.resolve(handler(payload)).catch((err) => {
          // Plugin failures are isolated — log but never propagate
          log.error(
            { err, pluginId, event },
            "Plugin event handler threw an error",
          );
        }),
      );
    }
    await Promise.all(tasks);
  }

  listSubscriptions(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [event, handlers] of this.subscriptions) {
      result[event] = Array.from(handlers.keys());
    }
    return result;
  }
}

// Singleton instance shared across the API process
export const globalEventBus = new PluginEventBus();
