import { describe, it, expect, vi } from "vitest";
import { PluginEventBus } from "../event-bus";

describe("PluginEventBus", () => {
  it("delivers events to subscribers", async () => {
    const bus = new PluginEventBus();
    const handler = vi.fn();
    bus.subscribe("plugin-a", "patient.created", handler);
    await bus.emit("patient.created", { patientId: "123" });
    expect(handler).toHaveBeenCalledWith({ patientId: "123" });
  });

  it("delivers to multiple subscribers", async () => {
    const bus = new PluginEventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.subscribe("plugin-a", "encounter.created", h1);
    bus.subscribe("plugin-b", "encounter.created", h2);
    await bus.emit("encounter.created", {});
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it("does not call handlers for other events", async () => {
    const bus = new PluginEventBus();
    const handler = vi.fn();
    bus.subscribe("plugin-a", "patient.created", handler);
    await bus.emit("billing.created", {});
    expect(handler).not.toHaveBeenCalled();
  });

  it("isolates handler failures — other handlers still run", async () => {
    const bus = new PluginEventBus();
    const failing = vi.fn().mockRejectedValue(new Error("plugin crash"));
    const succeeding = vi.fn();
    bus.subscribe("plugin-crash", "event.x", failing);
    bus.subscribe("plugin-ok", "event.x", succeeding);
    await expect(bus.emit("event.x", {})).resolves.toBeUndefined();
    expect(succeeding).toHaveBeenCalledOnce();
  });

  it("unsubscribes all events for a plugin", async () => {
    const bus = new PluginEventBus();
    const handler = vi.fn();
    bus.subscribe("plugin-a", "ev1", handler);
    bus.subscribe("plugin-a", "ev2", handler);
    bus.unsubscribeAll("plugin-a");
    await bus.emit("ev1", {});
    await bus.emit("ev2", {});
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns subscription map", () => {
    const bus = new PluginEventBus();
    bus.subscribe("plugin-a", "ev1", vi.fn());
    bus.subscribe("plugin-b", "ev1", vi.fn());
    const subs = bus.listSubscriptions();
    expect(subs["ev1"]).toContain("plugin-a");
    expect(subs["ev1"]).toContain("plugin-b");
  });
});
