/**
 * Hospital CMS Plugin SDK
 * Main entry point for plugin, theme, and widget developers.
 */

export type {
  PluginContext,
  WidgetContext,
  PluginManifest,
  ThemeManifest,
  WidgetManifest,
  HospitalEventPayloads,
} from "./types";

export {
  buildPluginManifest,
  buildThemeManifest,
  buildWidgetManifest,
} from "./manifest-helpers";

export {
  setupWidget,
  getWidgetContext,
} from "./widget-runtime";
