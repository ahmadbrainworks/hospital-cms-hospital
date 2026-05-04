"use client";

import { useEffect, useRef, useCallback } from "react";
import { api } from "./api-client";

const API_URL =
  typeof window !== "undefined"
    ? (process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000")
    : "";

export interface SseEvent<T = unknown> {
  type: string;
  data: T;
}

type Handler<T = unknown> = (event: SseEvent<T>) => void;

/**
 * Opens an SSE connection to /api/v1/events and calls `onEvent` for every
 * named event received. Reconnects automatically with exponential backoff.
 */
export function useSse(onEvent: Handler, enabled = true): void {
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(1000);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(async () => {
    if (!enabled) return;
    const token = api.getAccessToken();
    if (!token) return;

    try {
      // Exchange JWT for a short-lived, single-use SSE ticket
      // (EventSource cannot send custom headers, so we use ticket exchange)
      const ticketRes = await fetch(`${API_URL}/api/v1/events/ticket`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!ticketRes.ok) {
        throw new Error(`Ticket exchange failed: ${ticketRes.status}`);
      }

      const ticketData = (await ticketRes.json()) as { success: boolean; data: { ticket: string } };
      const ticket = ticketData.data.ticket;

      // Open SSE connection with ticket instead of token
      const url = `${API_URL}/api/v1/events?ticket=${encodeURIComponent(ticket)}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => {
        retryRef.current = 1000; // reset backoff on successful open
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        // Exponential backoff capped at 30s
        setTimeout(connect, Math.min(retryRef.current, 30_000));
        retryRef.current = Math.min(retryRef.current * 2, 30_000);
      };

      // Listen to all named events
      const eventTypes = [
        "connected",
        "patient.alert",
        "audit.entry",
        "system.notice",
        "encounter.status.changed",
        "lab.result.received",
        "theme.changed",
        "plugin.slots.updated",
        "widget.zone.updated",
      ];

      for (const type of eventTypes) {
        es.addEventListener(type, (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            onEventRef.current({ type, data });
          } catch {
            // ignore malformed events
          }
        });
      }
    } catch (err) {
      // If ticket exchange fails, retry with backoff
      console.warn("SSE ticket exchange failed, will retry:", err);
      setTimeout(connect, Math.min(retryRef.current, 30_000));
      retryRef.current = Math.min(retryRef.current * 2, 30_000);
    }
  }, [enabled]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect]);
}
