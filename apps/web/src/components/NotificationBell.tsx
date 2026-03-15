"use client";

import { useState, useEffect, useCallback } from "react";
import { useSse } from "../lib/use-sse";
import type { SseEvent } from "../lib/use-sse";

interface Notification {
  id: string;
  type: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

const MAX_NOTIFICATIONS = 50;

function eventToNotification(event: SseEvent): Notification | null {
  if (event.type === "connected") return null;

  const data = event.data as Record<string, unknown>;
  let message = "";

  switch (event.type) {
    case "patient.alert":
      message = `Alert: ${data["severity"] ?? ""} — ${data["message"] ?? "New patient alert"}`;
      break;
    case "audit.entry":
      message = `Audit: ${data["action"] ?? "Activity"} by ${data["actor"] ?? "user"}`;
      break;
    case "system.notice":
      message = String(data["message"] ?? "System notice");
      break;
    case "encounter.status.changed":
      message = `Encounter ${data["encounterNumber"] ?? ""} → ${data["status"] ?? ""}`;
      break;
    case "lab.result.received":
      message = `Lab result received for patient ${data["patientId"] ?? ""}`;
      break;
    default:
      message = String(data["message"] ?? event.type);
  }

  return {
    id: crypto.randomUUID(),
    type: event.type,
    message,
    timestamp: new Date(),
    read: false,
  };
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const onEvent = useCallback((event: SseEvent) => {
    const n = eventToNotification(event);
    if (!n) return;
    setNotifications((prev) =>
      [n, ...prev].slice(0, MAX_NOTIFICATIONS),
    );
  }, []);

  useSse(onEvent, true);

  const unread = notifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-notification-bell]")) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" data-notification-bell="">
      <button
        onClick={() => { setOpen((o) => !o); if (!open) markAllRead(); }}
        className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-800">Notifications</span>
            {notifications.length > 0 && (
              <button
                onClick={() => setNotifications([])}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                  <p className="text-xs font-medium text-gray-800 leading-snug">{n.message}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {n.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
