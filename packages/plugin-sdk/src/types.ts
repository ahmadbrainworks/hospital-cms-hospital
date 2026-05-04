/**
 * Plugin and Widget SDK types.
 */

export interface PluginContext {
  pluginId: string;
  hospitalId: string;
  apiUrl: string;
  storage: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
  };
  log: {
    info(msg: string, ctx?: object): void;
    warn(msg: string, ctx?: object): void;
    error(msg: string, ctx?: object): void;
  };
}

export interface WidgetContext {
  widgetId: string;
  zone: string;
  hospitalId: string;
  apiUrl: string;
  resize(height: number): void;
}

export interface PluginManifest {
  pluginId: string;
  name: string;
  version: string;
  description: string;
  author: string;
  uiSlots?: Array<{
    slotId: string;
    component: string;
    label?: string;
  }>;
  apiRoutes?: Array<{
    path: string;
    method: "GET" | "POST" | "PATCH" | "DELETE";
    label?: string;
  }>;
  permissions?: string[];
  sha256?: string;
  signature?: string;
}

export interface ThemeManifest {
  packageId: string;
  name: string;
  version: string;
  description: string;
  author: string;
  tokens: Record<string, unknown>;
  cssVariablesDaisyui: Record<string, string>;
  cssVariablesShadcn: Record<string, string>;
  checksum?: string;
  signature?: string;
}

export interface WidgetManifest {
  widgetId: string;
  name: string;
  version: string;
  description: string;
  author: string;
  zone: string;
  componentPath: string;
  permissions?: string[];
  signature?: string;
}

export interface HospitalEventPayloads {
  "patient.created": {
    hospitalId: string;
    patientId: string;
    mrn: string;
    name: string;
  };
  "encounter.started": {
    hospitalId: string;
    encounterId: string;
    patientId: string;
    encounterNumber: string;
  };
  "plugin.slots.updated": {
    pluginId: string;
    slots: any[];
    status: "active" | "disabled";
  };
  "widget.zone.updated": {
    zone: string;
    widgetId: string;
    action: "installed" | "removed";
  };
  "theme.changed": {
    themeId: string;
    v: number;
  };
}
