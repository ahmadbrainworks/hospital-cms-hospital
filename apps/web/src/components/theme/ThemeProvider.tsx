"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "../../lib/auth-context";
import { useSse } from "../../lib/use-sse";

/**
 * ThemeProvider manages the active theme's CSS injection.
 *
 * On mount, fetches the active theme CSS from /api/v1/themes/active/css
 * and injects it as a <link> element. Listens for theme.changed SSE
 * events and updates the link's href with a cache-buster timestamp.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const linkRef = useRef<HTMLLinkElement | null>(null);

  // Load the initial theme CSS on mount
  useEffect(() => {
    if (!user?.hospitalId) return;

    const link = document.createElement("link");
    link.id = "active-theme-css";
    link.rel = "stylesheet";
    link.href = `/api/v1/themes/active/css?hospitalId=${encodeURIComponent(user.hospitalId)}&v=${Date.now()}`;
    document.head.appendChild(link);
    linkRef.current = link;

    return () => {
      if (linkRef.current) {
        document.head.removeChild(linkRef.current);
      }
    };
  }, [user?.hospitalId]);

  // Listen for theme changes and update the CSS link
  useSse((event) => {
    if (event.type === "theme.changed" && linkRef.current && user?.hospitalId) {
      const v = (event.data as any)?.v || Date.now();
      linkRef.current.href = `/api/v1/themes/active/css?hospitalId=${encodeURIComponent(user.hospitalId)}&v=${v}`;
    }
  });

  return <>{children}</>;
}
