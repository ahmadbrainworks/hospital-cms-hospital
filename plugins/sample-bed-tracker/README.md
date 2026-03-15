# Sample Bed Tracker Plugin

A complete example demonstrating the Hospital CMS plugin engine.

## What This Plugin Does

Tracks hospital bed occupancy per ward. When patients are admitted, beds are
automatically assigned. When discharged, beds are released. Ward occupancy
alerts fire when capacity exceeds the configured threshold (default 90%).

## Plugin Architecture

```
manifest.json          → Declares plugin metadata, routes, events, permissions
src/index.ts           → Entry point: activate(), deactivate(), route handlers
src/bed-service.ts     → Business logic using sandbox.storage for persistence
src/handlers.ts        → Event handlers wired by the plugin registry
src/types.ts           → TypeScript interfaces
scripts/sign-manifest.js → Signs manifest with vendor RSA key
```

## How the Plugin Engine Works

### 1. Installation
The agent downloads the plugin package from the vendor control panel,
verifies the RSA signature against the vendor public key, and stores
the plugin files locally.

### 2. Activation
```
PluginRegistry.activate(hospitalId, pluginId)
  → createPluginSandbox(manifest, db, hospitalId)
  → import(entryPoint)
  → pluginModule.activate(sandbox)
  → wire event handlers from manifest.events
```

### 3. Sandbox API
Plugins receive a `PluginApi` (sandbox) with:
- **storage** — `get(key)`, `set(key, value)`, `delete(key)` — scoped to plugin + hospital
- **log** — `info()`, `warn()`, `error()` — prefixed with plugin ID
- **assertPermission(perm)** — throws if permission not declared in manifest

### 4. Events
Plugins subscribe to events declared in `manifest.events`. The global
`PluginEventBus` delivers payloads to handlers. Failures are isolated —
one plugin crash never affects others.

### 5. Routes
Declared in `manifest.routes`, mounted at `/plugins/<pluginId>/<path>`.
Each handler is an exported function that receives `{ params, body }`.

### 6. Deactivation
```
PluginRegistry.deactivate(hospitalId, pluginId)
  → eventBus.unsubscribeAll(pluginId)
  → pluginModule.deactivate(sandbox)
```

## Building

```bash
pnpm install
pnpm --filter @hospital-cms/plugin-sample-bed-tracker build
```

## Signing

```bash
VENDOR_PRIVATE_KEY_PATH=./vendor.key pnpm --filter @hospital-cms/plugin-sample-bed-tracker sign
```
