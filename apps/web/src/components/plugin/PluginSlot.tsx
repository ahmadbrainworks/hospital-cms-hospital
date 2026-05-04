"use client";

import { useState } from "react";
import useSWR from "swr";
import { useSse } from "../../lib/use-sse";
import { api } from "../../lib/api-client";

interface Plugin {
  pluginId: string;
  status: "active" | "inactive" | "error";
  manifest?: {
    uiSlots?: Array<{ slotId: string }>;
  };
}

const fetcher = (url: string): Promise<Plugin[]> =>
  api.get(url).then((r) => r.data as Plugin[]);

interface PluginSlotProps {
  slotId: string;
  className?: string;
}

export function PluginSlot({ slotId, className }: PluginSlotProps) {
  const { data: plugins, mutate } = useSWR<Plugin[]>(
    "/api/v1/plugins",
    fetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false, errorRetryCount: 1 },
  );

  const [iframeHeights, setIframeHeights] = useState<Record<string, number>>({});

  // Listen for plugin updates
  useSse((event) => {
    if (event.type === "plugin.slots.updated") {
      void mutate();
    }
  });

  // Handle iframe resize messages
  const handleIframeMessage = (
    e: MessageEvent,
    pluginId: string,
  ) => {
    if (e.data?.type === "resize" && e.data?.height) {
      setIframeHeights((prev) => ({
        ...prev,
        [pluginId]: e.data.height,
      }));
    }
  };

  if (!plugins || !Array.isArray(plugins)) {
    return null;
  }

  // Find all active plugins with UI slots matching this slotId
  const matchingPlugins = (plugins as Plugin[]).filter(
    (p: any) =>
      p.status === "active" &&
      p.manifest?.uiSlots?.some((slot: any) => slot.slotId === slotId),
  );

  if (matchingPlugins.length === 0) {
    return null;
  }

  return (
    <div className={`plugin-slot plugin-slot-${slotId} ${className || ""}`}>
      {matchingPlugins.map((plugin: any) => (
        <iframe
          key={plugin.pluginId}
          src={`/api/v1/plugins/${plugin.pluginId}/slot/${slotId}`}
          style={{
            height: iframeHeights[plugin.pluginId] || "auto",
            width: "100%",
            border: "none",
            borderRadius: "0.375rem",
          }}
          sandbox="allow-scripts allow-same-origin"
          onLoad={(e) => {
            const iframe = e.currentTarget;
            iframe.contentWindow?.addEventListener("message", (event) =>
              handleIframeMessage(event, plugin.pluginId),
            );
          }}
        />
      ))}
    </div>
  );
}
