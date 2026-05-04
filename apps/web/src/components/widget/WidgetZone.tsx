"use client";

import { useState } from "react";
import useSWR from "swr";
import { useSse } from "../../lib/use-sse";
import { api } from "../../lib/api-client";

type Zone = "dashboard.top" | "dashboard.bottom" | "sidebar.top" | "sidebar.bottom" | "patient.header" | "patient.sidebar";

interface Widget {
  widgetId: string;
  zone: string;
  status: "active" | "inactive" | "error";
  componentPath?: string;
}

const fetcher = (url: string): Promise<Widget[]> =>
  api.get(url).then((r) => r.data as Widget[]);

interface WidgetZoneProps {
  zone: Zone;
  className?: string;
}

export function WidgetZone({ zone, className }: WidgetZoneProps) {
  const { data: widgets, mutate } = useSWR<Widget[]>(
    "/api/v1/widgets",
    fetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false, errorRetryCount: 1 },
  );

  const [iframeHeights, setIframeHeights] = useState<Record<string, number>>({});

  // Listen for widget zone updates
  useSse((event) => {
    if (event.type === "widget.zone.updated") {
      void mutate();
    }
  });

  // Handle iframe resize messages
  const handleIframeMessage = (
    e: MessageEvent,
    widgetId: string,
  ) => {
    if (e.data?.type === "resize" && e.data?.height) {
      setIframeHeights((prev) => ({
        ...prev,
        [widgetId]: e.data.height,
      }));
    }
  };

  if (!widgets || !Array.isArray(widgets)) {
    return null;
  }

  // Find all active widgets for this zone
  const matchingWidgets = (widgets as Widget[]).filter(
    (w: any) => w.status === "active" && w.zone === zone,
  );

  if (matchingWidgets.length === 0) {
    return null;
  }

  return (
    <div className={`widget-zone widget-zone-${zone} ${className || ""}`}>
      {matchingWidgets.map((widget: any) => (
        <iframe
          key={widget.widgetId}
          src={`/api/v1/widgets/${widget.widgetId}/zone/${zone}`}
          style={{
            height: iframeHeights[widget.widgetId] || "auto",
            width: "100%",
            border: "none",
            borderRadius: "0.375rem",
          }}
          sandbox="allow-scripts allow-same-origin"
          onLoad={(e) => {
            const iframe = e.currentTarget;
            iframe.contentWindow?.addEventListener("message", (event) =>
              handleIframeMessage(event, widget.widgetId),
            );
          }}
        />
      ))}
    </div>
  );
}
