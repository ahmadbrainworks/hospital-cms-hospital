/**
 * Widget runtime helpers — use inside widget component bundles.
 */
import type { WidgetContext } from "./types";

declare global {
  interface Window {
    __widgetContext?: WidgetContext;
  }
}

export function setupWidget(
  init: (ctx: WidgetContext) => void,
): void {
  const ctx = (window as any).__widgetContext as WidgetContext;

  if (!ctx) {
    console.error("Widget context not available");
    return;
  }

  // Auto-resize on body content change
  const resizeObserver = new ResizeObserver(() => {
    const height = document.body.scrollHeight;
    if (height > 0) {
      ctx.resize(height);
    }
  });

  resizeObserver.observe(document.body);

  // Call initialization
  init(ctx);
}

export function getWidgetContext(): WidgetContext | undefined {
  return (window as any).__widgetContext;
}
