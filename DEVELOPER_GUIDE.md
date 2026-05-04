# Hospital CMS — Developer Guide: Plugins, Themes & Widgets

## 1. Architecture Overview

### Two-World Model

The Hospital CMS operates as a **two-world system**:

- **Vendor Control Panel** (`hospital-cms-vendor`): Builds, publishes, and distributes packages
- **Hospital Installations** (`hospital-cms-hospital`): Run independently; fetch and activate vendor packages

Communication flows **outbound only** from hospitals to the vendor:

```
Vendor CP → Publishes packages to registry
Hospital Agent → Heartbeat (30s) → Vendor CP
Vendor CP → Sends desired state + package metadata → Hospital Agent
Hospital Agent → Installs/activates packages → Hospital API
Hospital API → Broadcasts SSE events → Hospital Frontend
```

### Package Types

| Type | Location | UI | Real-time |
|------|----------|----|----|
| **Plugin** | `/api/v1/plugins/` | Slots (iframes) | SSE: `plugin.slots.updated` |
| **Theme** | `/api/v1/themes/active/css` | CSS injection | SSE: `theme.changed` |
| **Widget** | `/api/v1/widgets/` | Zones (iframes) | SSE: `widget.zone.updated` |

### Publishing Flow

```
1. Developer builds package (plugin.zip, theme.tar.gz, widget.zip)
2. Signs with vendor private key (RSA-4096)
3. Uploads to Vendor Control Panel
4. Vendor CP publishes to registry (stores checksum + signature)
5. Hospital admin assigns package from "Packages" page
6. Vendor CP adds to hospital's desired state
7. Agent fetches on heartbeat, verifies signature, installs
8. Hospital frontend receives real-time SSE event
9. UI renders plugin slot, widget zone, or switches theme
```

---

## 2. Plugin Development

### Quick Start

```bash
# Create plugin directory
mkdir my-hospital-plugin
cd my-hospital-plugin

# Create manifest
cat > manifest.json << 'EOF'
{
  "pluginId": "my-hospital-plugin",
  "name": "My Hospital Plugin",
  "version": "1.0.0",
  "description": "A custom plugin",
  "author": "Your Name",
  "uiSlots": [
    {
      "slotId": "dashboard.banner",
      "component": "dist/dashboard-banner.js",
      "label": "Dashboard Banner"
    }
  ]
}
EOF

npm init -y
npm install @hospital-cms/plugin-sdk
```

### Manifest Structure

```typescript
interface PluginManifest {
  pluginId: string;            // Unique ID, kebab-case
  name: string;                // Display name
  version: string;             // Semver
  description: string;         // One-liner
  author: string;              // Your name or org
  
  uiSlots?: Array<{
    slotId: string;            // "dashboard.banner" | "sidebar.addon"
    component: string;         // Path to JS bundle (relative to plugin root)
    label?: string;            // Human-readable name
  }>;
  
  apiRoutes?: Array<{
    path: string;              // "/data", "/config", etc.
    method: string;            // "GET" | "POST"
    label?: string;
  }>;
  
  permissions?: string[];      // Required permissions
}
```

### Available Slots

| Slot ID | Location | Context |
|---------|----------|---------|
| `dashboard.banner` | Above dashboard main content | Full hospital context |
| `sidebar.addon` | Below sidebar navigation | Sidebar context |

### Building a UI Slot

```typescript
// src/dashboard-banner.ts (compiled to dist/dashboard-banner.js)
import { setupWidget } from "@hospital-cms/plugin-sdk";

setupWidget(async (ctx) => {
  // ctx.pluginId, ctx.hospitalId, ctx.apiUrl available
  
  const root = document.getElementById("root")!;
  const h1 = document.createElement("h1");
  h1.textContent = `Welcome to ${ctx.pluginId}`;
  root.appendChild(h1);
  
  // Fetch plugin-specific data
  const res = await fetch(`${ctx.apiUrl}/api/v1/plugins/${ctx.pluginId}/data`);
  const data = await res.json();
  // Use data...
  
  // Tell parent iframe to resize
  ctx.resize(root.scrollHeight);
});
```

### Plugin Server-Side Logic

Plugins receive a `PluginContext` on `activate()` in the hospital API. Store state, listen to events:

```typescript
// Example: patient-stats-plugin activation
async function activate(api: PluginContext) {
  // Listen to patient creation events
  api.bus.on("patient.created", async (event) => {
    const count = await api.storage.get("total_patients") || 0;
    await api.storage.set("total_patients", count + 1);
  });
  
  // Define API route
  api.route("GET", "/count", async () => {
    return {
      total: await api.storage.get("total_patients"),
    };
  });
}
```

### Build & Sign

```bash
# Build UI bundles (plugin components for iframes)
npm run build

# Create package archive
tar czf my-hospital-plugin-1.0.0.tar.gz \
  manifest.json \
  dist/

# Sign with vendor private key
npx @hospital-cms/plugin-sdk sign-package \
  manifest.json \
  ~/vendor-private-key.pem

# Output: manifest.signed.json (includes signature + checksum)
# Archive this and publish to Vendor CP
```

---

## 3. Theme Development

### Quick Start

```bash
mkdir my-hospital-theme
cd my-hospital-theme

# Define design tokens
cat > tokens.ts << 'EOF'
export const tokens = {
  colors: {
    primary: { 50: "#f0f9ff", 500: "#3b82f6", 900: "#1e3a8a" },
    secondary: { 50: "#f0fdfa", 500: "#14b8a6", 900: "#134e4a" },
    // ... 11 shades per color (50, 100, 200, ..., 950)
  },
  typography: {
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI",
    baseFontSize: 16,
    lineHeight: 1.5,
  },
  border: {
    radiusSm: 4,
    radiusMd: 8,
    radiusLg: 12,
    radiusFull: 9999,
  },
};
EOF

npm init -y
npm install @hospital-cms/plugin-sdk
```

### Theme Types

Themes use **CSS custom properties** for runtime injection. No build step required—themes are text files compiled to CSS.

```typescript
interface ThemeManifest {
  packageId: string;
  name: string;
  version: string;
  description: string;
  author: string;
  
  tokens: DesignTokens;                      // Full token tree
  cssVariablesDaisyui: Record<string, string>; // Optional: DaisyUI mappings
  cssVariablesShadcn: Record<string, string>;  // Optional: shadcn mappings
  
  checksum?: string;                         // SHA-256 of tokens JSON
  signature?: string;                        // RSA signature
}

interface DesignTokens {
  colors: {
    primary: ColorScale;     // 50, 100, 200, ..., 950
    secondary: ColorScale;
    accent: ColorScale;
    neutral: ColorScale;
    success: ColorScale;
    warning: ColorScale;
    error: ColorScale;
    info: ColorScale;
    
    background: string;      // e.g., "#f8fafc"
    surface: string;
    surfaceRaised: string;
    textPrimary: string;
    textSecondary: string;
    textDisabled: string;
    textInverse: string;
    border: string;
    borderStrong: string;
  };
  
  typography: {
    fontFamily: string;
    baseFontSize: number;
    lineHeight: number;
    scaleRatio?: number;     // For modular scale (default 1.25)
  };
  
  spacing: { baseUnit: number; };
  border: {
    radiusSm: number;
    radiusMd: number;
    radiusLg: number;
    radiusFull: number;
    borderWidth: number;
  };
  
  shadows: {
    sm: { value: string };   // CSS box-shadow
    md: { value: string };
    lg: { value: string };
    xl: { value: string };
  };
}
```

### CSS Variable Naming

Themes inject CSS custom properties via `<link>`:

```css
:root {
  --color-primary-50: #f0f9ff;
  --color-primary-100: #e0f2fe;
  /* ... */
  --color-primary-500: #3b82f6;
  /* ... */
  --color-primary-950: #0c2340;
  
  --color-secondary-50: #f0fdfa;
  /* ... */
  
  --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto;
  --font-size-base: 16px;
  --radius-md: 8px;
  
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}
```

All variables are consumed by `globals.css` and Tailwind config. Themes don't need to recompile—just swap CSS!

### Build & Publish

```bash
# Compile tokens to manifest
npx @hospital-cms/theme-compiler tokens.ts

# Output: manifest.json with computed checksums

# Sign
npx @hospital-cms/plugin-sdk sign-package manifest.json ~/vendor-key.pem

# Package
tar czf my-theme-1.0.0.tar.gz manifest.signed.json

# Upload to Vendor CP
```

---

## 4. Widget Development

### Quick Start

```bash
mkdir my-hospital-widget
cd my-hospital-widget

# Manifest for a dashboard widget
cat > manifest.json << 'EOF'
{
  "widgetId": "system-metrics",
  "name": "System Metrics",
  "version": "1.0.0",
  "zone": "dashboard.top",
  "componentPath": "dist/widget.js"
}
EOF

npm init -y
```

### Widget Zones

| Zone | Location | Renders |
|------|----------|---------|
| `dashboard.top` | Dashboard header, below banner | Auto-height iframe |
| `dashboard.bottom` | Dashboard footer | Auto-height iframe |
| `sidebar.top` | Above sidebar nav | Vertical flex |
| `sidebar.bottom` | Below sidebar nav | Vertical flex |
| `patient.header` | Patient page header | Horizontal |
| `patient.sidebar` | Patient page sidebar | Vertical flex |

### Building a Widget

Widgets run in sandboxed iframes with access to `window.__widgetContext`:

```typescript
// src/widget.ts → dist/widget.js (IIFE bundle)
import { setupWidget } from "@hospital-cms/plugin-sdk";

setupWidget((ctx) => {
  // ctx.widgetId, ctx.zone, ctx.hospitalId, ctx.apiUrl
  
  // Fetch metrics
  fetch(`${ctx.apiUrl}/api/v1/system/metrics`)
    .then(r => r.json())
    .then(metrics => {
      const html = `
        <div style="padding: 1rem; background: #f8fafc; border-radius: 8px;">
          <h3>System Metrics</h3>
          <p>CPU: ${metrics.cpu}%</p>
          <p>Memory: ${metrics.memory}%</p>
        </div>
      `;
      document.body.innerHTML = html;
      
      // Tell parent the height
      ctx.resize(document.body.scrollHeight);
    });
});
```

### Auto-Resize

Widgets must tell their parent iframe the desired height. The SDK provides `setupWidget()` which auto-observes body changes:

```typescript
// Automatic — setupWidget handles ResizeObserver
ctx.resize(height);  // Call manually if needed
```

---

## 5. Real-Time Updates (SSE)

### Hospital SSE Events

Hospitals broadcast real-time updates via Server-Sent Events:

```typescript
interface HospitalEventPayloads {
  "theme.changed": {
    themeId: string;
    v: number;  // Cache-buster timestamp
  };
  
  "plugin.slots.updated": {
    pluginId: string;
    slots: UISlot[];
    status: "active" | "disabled";
  };
  
  "widget.zone.updated": {
    zone: string;
    widgetId: string;
    action: "installed" | "removed";
  };
  
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
}
```

### Subscribing in Browser

Frontend components listen via the `useSse` hook:

```typescript
import { useSse } from "@/lib/use-sse";

export function MyComponent() {
  useSse((event) => {
    if (event.type === "theme.changed") {
      // Refetch theme CSS
    }
    if (event.type === "plugin.slots.updated") {
      // Refetch plugins and re-render
    }
  });
  
  return <div>...</div>;
}
```

### Emitting Events from Plugins

Plugins can emit events on the hospital event bus:

```typescript
// Inside plugin activation (server-side)
api.bus.emit("plugin.event", { /* custom data */ });
```

Other plugins subscribe:

```typescript
api.bus.on("plugin.event", (event) => {
  console.log("Got event:", event);
});
```

---

## 6. Security Model

### Package Integrity

All packages are **signed with vendor RSA-4096 key**. On installation, the hospital verifies:

1. **Signature**: Manifest + files must match vendor signature
2. **Checksum**: Package ZIP hash matches manifest
3. **Source**: Only vendor public key accepted (embedded in hospital config)

```typescript
// Agent verification (automatic)
const valid = verifyWithPublicKey(
  manifestBuffer,
  signatureFromManifest,
  vendorPublicKey,
);
```

### Plugin Sandbox

Plugins run in isolated VM contexts with:

- **API access only** via provided `PluginContext`
- **No filesystem** access
- **No network** unless routed through plugin API
- **Event bus** for inter-plugin communication
- **Storage** for persistent state (per-hospital)

### UI Sandbox (Iframes)

Plugin slots and widget zones render in `<iframe>` with:

```html
<iframe sandbox="allow-scripts allow-same-origin">
```

Restrictions:
- ❌ Forms / auth / top-level navigation
- ✅ Scripts
- ✅ Cross-origin fetch (same API URL)
- ✅ postMessage to parent (resize signals)

### API Access

Plugins can define routes available to hospital users:

```typescript
api.defineRoute("GET", "/my-data", async (req) => {
  // req.user (hospital user)
  // req.hospitalId (current hospital)
  // Check permissions before responding
  return { data: "..." };
});
```

---

## 7. Developer Workflow

### 1. Set Up Local Development

```bash
# Clone monorepo
git clone <repo> hospital-cms
cd hospital-cms

# Install dependencies
npm install

# Start dev servers
npm run dev

# Hospital API: http://localhost:4000
# Hospital Frontend: http://localhost:3000
# Vendor CP: http://localhost:4001
# Vendor Dashboard: http://localhost:3003
```

### 2. Create & Build Your Package

```bash
# Plugin
mkdir examples/my-plugin
npm init -y
npm install @hospital-cms/plugin-sdk
# Write plugin code
npm run build
# Creates dist/

# Theme
# Modify tokens.ts
npm run build:theme
# Creates manifest.json

# Widget
npm init -y
npm run build
# Creates dist/widget.js
```

### 3. Sign Your Package

```bash
# Get vendor private key (from setup or provider)
export VENDOR_KEY=$(cat ~/vendor-private-key.pem)

# Sign
npx @hospital-cms/plugin-sdk sign-package \
  manifest.json \
  ~/vendor-private-key.pem

# Output: manifest.signed.json + signature in manifest.json
```

### 4. Test Locally

**Option A: Direct hospital API call**

```bash
curl -X POST http://localhost:4000/api/agent/apply-plugin \
  -H "X-Agent-Secret: <local-agent-secret>" \
  -H "Content-Type: application/json" \
  -d '{
    "hospitalId": "<test-hospital-id>",
    "manifestJson": "{...}",
    "packageBase64": "..."
  }'
```

**Option B: Via browser (test as hospital user)**

Visit http://localhost:3000/plugins, upload, test directly.

### 5. Publish to Vendor CP

```bash
# Upload to Vendor Control Panel
# http://localhost:3003/packages/publish

# Or via API
curl -X POST http://localhost:4001/api/vendor/packages \
  -H "Authorization: Bearer <vendor-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "manifest": {...manifest.signed.json...},
    "archivePath": "/plugins/my-plugin/1.0.0/package.zip"
  }'
```

### 6. Assign to Hospital

1. Log in to Vendor CP http://localhost:3003
2. Navigate to "Packages"
3. Find your package
4. Click "Assign to Hospitals"
5. Select test hospital
6. Save

Hospital agent will fetch on next heartbeat (30s).

---

## 8. File Structure Reference

### Plugin Structure

```
my-plugin/
├── manifest.json              # Plugin metadata
├── package.json
├── src/
│   ├── index.ts              # Server-side plugin activation
│   └── ui/
│       ├── dashboard-banner.ts
│       └── build.js          # esbuild config
└── dist/
    └── dashboard-banner.js   # Compiled for iframe
```

### Theme Structure

```
my-theme/
├── manifest.json             # Theme metadata
├── tokens.ts                 # Design token definitions
└── build.ts                  # Token compiler script
```

### Widget Structure

```
my-widget/
├── manifest.json             # Widget metadata
├── src/
│   └── widget.ts
└── dist/
    └── widget.js             # IIFE bundle for iframe
```

---

## 9. Deployment Checklist

- [ ] All packages signed with vendor key
- [ ] Checksums computed and verified
- [ ] No hardcoded localhost URLs
- [ ] API URLs use environment variables
- [ ] Error handling for network failures
- [ ] Graceful degradation (missing theme, widget, plugin)
- [ ] Performance: bundles < 200KB (gzipped)
- [ ] Security: no localStorage, no XSS, validate APIs
- [ ] Tested on multiple browsers
- [ ] License headers in source files
- [ ] README with setup instructions

---

## 10. Troubleshooting

### Package Installation Fails

**Error**: "Invalid vendor signature"
- Ensure manifest signed with correct private key
- Verify vendor public key in hospital config

**Error**: "Checksum mismatch"
- Regenerate checksum: `npm run build:theme`
- Ensure no file modifications after signing

### UI Slot Not Rendering

**Check**:
1. Plugin manifest lists correct `slotId`
2. Hospital frontend has that `slotId` defined
3. Plugin status is "active" (not "error")
4. Browser console for iframe errors

### Widget Zone Empty

**Check**:
1. Widget assignment exists in database
2. Widget status is "active"
3. Zone name matches (case-sensitive)
4. Widget bundle loads: inspect Network tab

### Real-Time Updates Not Working

**Check**:
1. SSE connected: DevTools → Networks → type "SSE"
2. Heartbeat messages flowing
3. Browser allows long-lived connections (not blocking)
4. Hospital API broadcasting: check logs

---

## See Also

- **Architecture**: `ARCHITECTURE-EXTENSIONS.md`
- **API Reference**: Swagger at http://localhost:4000/api/docs
- **Plugin Runtime**: `packages/plugin-runtime/`
- **Theme Engine**: `packages/theme-engine/`
- **Examples**: `examples/`

