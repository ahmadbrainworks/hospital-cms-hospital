# Hospital CMS

A production-grade, managed self-hosted Hospital Management System built as a closed, vendor-controlled platform with healthcare-grade security.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│  Hospital (self-hosted)                                           │
│                                                                   │
│   ┌──────────┐   ┌──────────┐   ┌─────────────────────────────┐ │
│   │  Next.js │   │ Express  │   │  Management Agent           │ │
│   │  Web App │──▶│  API     │──▶│  (heartbeat + reconciler)   │ │
│   └──────────┘   └──────────┘   └──────────┬────────────────┘  │
│                       │                      │ outbound-only      │
│                   MongoDB                    │                    │
│                   Redis                      │                    │
└──────────────────────────────────────────────│────────────────────┘
                                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  Vendor Control Panel                                             │
│                                                                   │
│   Instance Registry │ License Authority │ Desired State Engine   │
│   Command Issuer    │ Metrics Ingest    │ Network Advisory        │
└──────────────────────────────────────────────────────────────────┘
```

**Key properties:**

- Outbound-only communication from hospital → vendor
- All plugins, themes, and operational commands are RSA-4096 signed by the vendor
- Immutable audit log with SHA-256 hash chain
- Strict RBAC with 10 roles and 50+ granular permissions
- JWT access tokens (15 min) + rotated refresh tokens

## Monorepo Structure

```
apps/
  api/            Express API (port 4000 by default)
  web/            Next.js frontend (port 3000)
  installer/      First-run installer (port 3001)
  control-panel/  Vendor control panel (port 4000 in vendor env)
  agent/          Management agent (runs as daemon)

packages/
  shared-types/   Domain types and enums
  config/         Zod env validation
  logger/         Pino structured logger
  errors/         AppError hierarchy
  crypto/         RSA, AES-GCM, HMAC, audit hash chain
  database/       MongoDB client, repositories, indexes
  auth/           Password hashing, JWT, session store
  rbac/           Role-permission mappings, permission checker
  audit/          Immutable audit service
  workflow-engine/ Step/transition/guard workflow engine
  plugin-runtime/ Signed plugin sandbox and registry
  theme-engine/   CSS custom property theming
```

## Prerequisites

- Node.js 20+
- pnpm 10+ (via Corepack or a standalone pnpm install)
- MongoDB 7+
- Redis 7+

## Getting Started

### 1. Install dependencies

```bash
corepack enable
pnpm install
```

If Corepack fails with `Cannot find matching keyid`, update Corepack and retry:

```bash
npm install -g corepack@latest
corepack enable
corepack prepare pnpm@10.32.0 --activate
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your MongoDB URI, Redis URL, JWT secrets, etc.
```

### 3. Build all packages

```bash
pnpm build
```

### 4. Start the API and web app

```bash
# Development (API + web in parallel)
pnpm dev

# The root dev command prebuilds workspace libraries first.

# Full workspace dev:
pnpm dev:all

# Or individually:
cd apps/api && pnpm dev
cd apps/web && pnpm dev
```

### 5. Run the installer (first run only)

```bash
# With the API and web app running, open:
# http://localhost:3000/install
```

The installer will:

- Test MongoDB and Redis connectivity
- Create all database indexes
- Generate RSA-4096 instance key pair
- Create the SUPER_ADMIN account
- Write the installation lock file

### 6. Start the control panel (vendor infrastructure)

```bash
# Set required env vars:
export CONTROL_PANEL_MONGODB_URI="mongodb://..."
export VENDOR_PRIVATE_KEY="$(cat /path/to/vendor-private.pem)"
export VENDOR_API_KEY="your-secret-key"

cd apps/control-panel && pnpm dev   # http://localhost:4000
```

### 7. Start the management agent (on hospital server)

```bash
export CONTROL_PANEL_URL="https://cp.your-vendor.com"
export INSTANCE_ID="<uuid from installer>"
export AGENT_PRIVATE_KEY="$(cat /path/to/instance-private.pem)"
export VENDOR_PUBLIC_KEY="$(cat /path/to/vendor-public.pem)"
export API_ADMIN_TOKEN="<super-admin jwt>"

cd apps/agent && pnpm dev
```

## Running Tests

```bash
# All packages
pnpm test

# Single package
cd packages/crypto && pnpm test
cd packages/workflow-engine && pnpm test
cd apps/api && pnpm test

# With coverage
pnpm test:coverage
```

### Test Coverage

| Package                    | Tests                                                  |
| -------------------------- | ------------------------------------------------------ |
| `packages/errors`          | Error hierarchy, status codes, `toJSON()`              |
| `packages/crypto`          | RSA, AES-GCM, HMAC, audit chain, license token         |
| `packages/auth`            | Password hashing, strength validation                  |
| `packages/rbac`            | Role defaults, SUPER_ADMIN bypass, assertPermission    |
| `packages/workflow-engine` | Full lifecycle, guards, transitions, terminal state    |
| `packages/plugin-runtime`  | Manifest validation, signature verification, event bus |
| `packages/theme-engine`    | Schema validation, CSS variable generation, signature  |
| `apps/api`                 | Auth endpoints, patient CRUD, permission enforcement   |

## Key API Endpoints

### Authentication

```
POST /api/v1/auth/login          Login with username + password
POST /api/v1/auth/refresh        Rotate refresh token
POST /api/v1/auth/logout         Revoke session
GET  /api/v1/auth/me             Current user
```

### Patients

```
GET  /api/v1/patients            List/search patients
POST /api/v1/patients            Create patient (generates P0000001 number)
GET  /api/v1/patients/:id        Patient detail
PUT  /api/v1/patients/:id        Update patient
```

### Workflows

```
GET  /api/v1/workflows/definitions              Active workflow definitions
POST /api/v1/workflows/runs                     Start workflow run
GET  /api/v1/workflows/runs/:type/:id           Active run for entity
POST /api/v1/workflows/runs/:runId/transition   Advance workflow step
```

### Plugins

```
GET    /api/v1/plugins                  List installed plugins
POST   /api/v1/plugins                  Install signed plugin
POST   /api/v1/plugins/:id/activate     Activate plugin
POST   /api/v1/plugins/:id/deactivate   Deactivate plugin
```

### Themes

```
GET    /api/v1/themes/active         Active theme
GET    /api/v1/themes/active/css     Compiled CSS (public)
POST   /api/v1/themes/activate       Activate signed theme
DELETE /api/v1/themes/active         Revert to default
```

### Control Panel (vendor)

```
POST /api/instances/register                    Register new hospital instance
GET  /api/instances                             List all instances
PUT  /api/instances/:id/desired-state           Push desired state
POST /api/instances/:id/commands                Issue operational command
POST /api/licenses                              Issue license
POST /api/agent/heartbeat                       Agent heartbeat (signed)
```

## Security Design

- **RBAC**: Role defaults + per-user grants resolved at request time; SUPER_ADMIN bypasses all checks
- **Audit log**: Append-only, SHA-256 hash chain; `GET /api/v1/audit/integrity` verifies chain
- **Plugin security**: Vendor RSA-4096 signature required; sandboxed storage and event bus per plugin
- **Token security**: bcrypt cost 12; JWT 15-min access + 7-day rotating refresh stored hashed
- **Timing-safe login**: Dummy bcrypt.compare on unknown usernames prevents username enumeration
- **Command replay protection**: Commands signed with timestamp + nonce; 1-hour TTL enforced

## Phase Status

| Phase   | Status      | Contents                                                                                                   |
| ------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| Phase 1 | ✅ Complete | Shared packages, database, auth, RBAC, audit, API core, installer, web shell                               |
| Phase 2 | ✅ Complete | Workflow engine, plugin runtime, theme engine, control panel, agent                                        |
| Phase 3 | ✅ Complete | RSA license enforcement, system metrics dashboard, CPU/disk sampling, example plugin, production hardening |
| Phase 4 | ✅ Complete | Security hardening (SSRF, sanitization, injection), test coverage, RUNBOOK.md, DEPLOYMENT.md               |
