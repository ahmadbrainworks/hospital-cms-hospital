/**
 * Helpers for building and validating manifests.
 */
import type { PluginManifest, ThemeManifest, WidgetManifest } from "./types";

export function buildPluginManifest(
  overrides: Partial<PluginManifest>,
): PluginManifest {
  return {
    pluginId: "my-plugin",
    name: "My Plugin",
    version: "1.0.0",
    description: "A plugin for Hospital CMS",
    author: "Your Name",
    uiSlots: [],
    apiRoutes: [],
    permissions: [],
    ...overrides,
  };
}

export function buildThemeManifest(
  overrides: Partial<ThemeManifest>,
): ThemeManifest {
  return {
    packageId: "my-theme",
    name: "My Theme",
    version: "1.0.0",
    description: "A custom theme",
    author: "Your Name",
    tokens: {},
    cssVariablesDaisyui: {},
    cssVariablesShadcn: {},
    ...overrides,
  };
}

export function buildWidgetManifest(
  overrides: Partial<WidgetManifest>,
): WidgetManifest {
  return {
    widgetId: "my-widget",
    name: "My Widget",
    version: "1.0.0",
    description: "A widget for Hospital CMS",
    author: "Your Name",
    zone: "dashboard.top",
    componentPath: "widget.js",
    permissions: [],
    ...overrides,
  };
}
