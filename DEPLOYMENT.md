# Hospital CMS — Split Deployment Guide

This repository now supports two separate deployment targets from the same git checkout:

1. Vendor stack
   Runs on your infrastructure.
   Contains the control-panel API, vendor dashboard, and vendor MongoDB.

2. Hospital stack
   Runs on each client VPS.
   Contains the hospital web app, hospital API, local agent, hospital MongoDB, and Redis.

The two stacks are intentionally separated at runtime:

- Vendor server is your central management plane.
- Hospital server is the client-facing CMS.
- The hospital agent only makes outbound calls to the vendor control panel.
- The vendor private key never ships to a hospital server.

## 1. What Ships Where

### Vendor server

Runs:

- `apps/control-panel`
- `apps/vendor-dashboard`
- Vendor MongoDB
- `vendor-proxy` reverse proxy

Files used:

- `docker-compose.yml`
- `Dockerfile.control-panel`
- `Dockerfile.vendor-dashboard`
- `.env.control-panel.example`
- `deploy/nginx/vendor-proxy.conf`

Public behavior:

- `http://vendor-host:8080/` serves the vendor dashboard
- `http://vendor-host:8080/api/*` proxies to the control-panel API
- `http://vendor-host:8080/health` proxies to the control-panel health endpoint

### Hospital server

Runs:

- `apps/api`
- `apps/web`
- `apps/agent`
- Hospital MongoDB
- Redis
- `hospital-proxy` reverse proxy

Files used:

- `docker-compose.hospital.yml`
- `Dockerfile.api`
- `Dockerfile.web`
- `Dockerfile.agent`
- `.env.hospital.example`
- `deploy/nginx/hospital-proxy.conf`

Public behavior:

- `http://hospital-host:8080/` serves the hospital web app
- `http://hospital-host:8080/api/*` proxies to the hospital API
- `http://hospital-host:8080/health` proxies to the hospital API health endpoint
- `http://hospital-host:8080/install` serves the first-run installer

## 2. Release Boundary

This repo stays as one monorepo in git, but it now ships as two separate deployable products.

### Vendor product

Contains:

- control-panel API
- vendor dashboard
- vendor database

Does not contain:

- hospital API
- hospital web
- hospital agent

### Hospital product

Contains:

- hospital API
- hospital web
- hospital agent
- hospital database
- hospital Redis

Does not contain:

- vendor control-panel runtime
- vendor dashboard runtime
- vendor private signing key

## 3. Important Runtime Rules

### Same-origin public URLs

Both stacks are now designed to act as one public app through their own reverse proxies.

Vendor side:

- Browser talks to `vendor-host:8080`
- Dashboard assets are served from `/`
- API calls go to `/api/*`

Hospital side:

- Browser talks to `hospital-host:8080`
- Web app is served from `/`
- API calls go to `/api/*`

This avoids hardcoding browser calls to `localhost` or container-only hostnames.

### Agent startup behavior

The hospital agent now supports post-install startup more cleanly:

- If `INSTANCE_ID` is not set, it will read it from `INSTALLER_LOCK_FILE`
- If `AGENT_PRIVATE_KEY` is not set, it will read it from `AGENT_PRIVATE_KEY_PATH`

That means the hospital Docker stack can be started before installation. The agent may restart until installation completes, then it will come up successfully once the installer writes:

- `/etc/hospital-cms/installer.lock`
- `/etc/hospital-cms/instance.key`

## 4. Prerequisites

### Both servers

- Docker Engine with Docker Compose plugin
- Git
- Ability to expose TCP port `8080` or map it behind your own Nginx / load balancer

### Vendor server secrets

- Vendor RSA private key
- Vendor RSA public key
- Vendor API HMAC secret
- Control-panel JWT secrets
- Initial vendor admin email/password

### Hospital server secrets

- Hospital JWT secrets
- Encryption keys
- Vendor public key
- Agent/API shared secret
- Vendor control-panel public URL

## 5. Vendor Server Deployment From Git

### Clone the repo

```bash
git clone <your-repo-url> hospital_cms
cd hospital_cms
```

### Create the vendor env file

```bash
cp .env.control-panel.example .env.control-panel
```

Edit `.env.control-panel` and set at minimum:

- `VENDOR_PUBLIC_ORIGIN`
- `VENDOR_API_KEY`
- `VENDOR_PRIVATE_KEY`
- `VENDOR_PUBLIC_KEY`
- `CP_JWT_SECRET`
- `CP_REFRESH_TOKEN_SECRET`
- `CP_INITIAL_ADMIN_EMAIL`
- `CP_INITIAL_ADMIN_PASSWORD`

Recommended local-test value:

```env
VENDOR_PUBLIC_ORIGIN=http://localhost:8080
```

Recommended remote-test value:

```env
VENDOR_PUBLIC_ORIGIN=http://YOUR_VENDOR_SERVER_IP:8080
```

or preferably:

```env
VENDOR_PUBLIC_ORIGIN=https://vendor.yourdomain.com
```

### Start the vendor stack

```bash
docker compose --env-file .env.control-panel up -d --build
```

### Verify the vendor stack

```bash
curl http://localhost:8080/health
```

Expected:

- HTTP 200
- JSON containing `"service":"control-panel"`

Then open:

```text
http://YOUR_VENDOR_SERVER:8080
```

Login with the seeded vendor admin account.

## 6. Hospital Server Deployment From Git

### Clone the repo

```bash
git clone <your-repo-url> hospital_cms
cd hospital_cms
```

### Create the hospital env file

```bash
cp .env.hospital.example .env.hospital
```

Edit `.env.hospital` and set at minimum:

- `HOSPITAL_PUBLIC_ORIGIN`
- `CONTROL_PANEL_URL`
- `JWT_SECRET`
- `REFRESH_TOKEN_SECRET`
- `ENCRYPTION_KEY`
- `MFA_ENCRYPTION_KEY`
- `VENDOR_PUBLIC_KEY`
- `API_ADMIN_TOKEN`
- `AGENT_SECRET`

Recommended local-test value:

```env
HOSPITAL_PUBLIC_ORIGIN=http://localhost:8080
CONTROL_PANEL_URL=http://YOUR_VENDOR_SERVER_IP:8080
```

Recommended remote-test value:

```env
HOSPITAL_PUBLIC_ORIGIN=http://YOUR_HOSPITAL_SERVER_IP:8080
CONTROL_PANEL_URL=https://vendor.yourdomain.com
```

or preferably:

```env
HOSPITAL_PUBLIC_ORIGIN=https://hospital-a.yourdomain.com
CONTROL_PANEL_URL=https://vendor.yourdomain.com
```

### Start the hospital stack

```bash
docker compose --env-file .env.hospital -f docker-compose.hospital.yml up -d --build
```

### Verify the hospital stack is reachable

```bash
curl http://localhost:8080/health
```

Expected before installation:

- HTTP 200
- JSON containing `"isInstalled": false`

Open:

```text
http://YOUR_HOSPITAL_SERVER:8080/install
```

and complete the installer.

## 7. First End-to-End Test

This is the recommended first test after shipping both stacks to two separate servers.

### Step 1: Bring up the vendor stack

Confirm:

- vendor dashboard loads
- `/health` returns OK
- initial admin can log in

### Step 2: Issue a registration token

From the vendor dashboard, create a registration token for a hospital deployment.

### Step 3: Bring up the hospital stack

Confirm:

- `/health` returns `isInstalled: false`
- `/install` is reachable

### Step 4: Complete the installer

During installation:

- use the vendor server URL as `CONTROL_PANEL_URL`
- use the token created from the vendor dashboard
- let the installer generate the hospital instance key pair

### Step 5: Confirm registration

After installation:

- hospital `/health` should report `isInstalled: true`
- hospital login page should replace `/install`
- vendor dashboard should show the new instance

### Step 6: Confirm agent heartbeat

Within one or two heartbeat cycles:

- the hospital instance should appear as active or recently seen
- the vendor side should show `lastHeartbeat`

If the instance registers successfully but no heartbeat appears, check the hospital agent logs first.

## 8. Operational Notes

### Shared hospital volume

The hospital Docker stack uses a shared `/etc/hospital-cms` volume between:

- `web`
- `api`
- `agent`

This is required because:

- the installer writes `installer.lock`
- the installer writes `instance.key`
- the API reads `installer.lock`
- the agent reads `installer.lock` and `instance.key`

### Reverse-proxy ports

Both provided Compose stacks expose port `8080` by default to avoid colliding with existing host services.

If you want standard HTTP:

- map `80:80`
- or put a host-level Nginx / Caddy / load balancer in front of `8080`

### Container-only service ports

The internal service ports stay private:

- vendor control panel: `4001`
- vendor dashboard: `3003`
- hospital API: `4000`
- hospital web: `3000`

Only the proxy is intended to be public.

## 9. Build And Runtime Commands

Useful workspace commands from the repo root:

```bash
pnpm build:vendor
pnpm build:hospital
pnpm dev:vendor
pnpm dev:hospital
```

Useful release cleanup:

```bash
./scripts/ship-clean.sh
```

## 10. Systemd Alternative

If you do not want Docker, the repo now includes systemd unit files in `deploy/`:

- `deploy/control-panel.service`
- `deploy/vendor-dashboard.service`
- `deploy/hospital-api.service`
- `deploy/hospital-web.service`
- `deploy/hospital-agent.service`

Typical host layout:

- repo checkout: `/opt/hospital-cms`
- vendor env: `/etc/hospital-cms/control-panel.env`
- hospital env: `/etc/hospital-cms/hospital.env`

Important:

- The systemd units only start processes
- To make dashboard + control-panel act as one app, you still need a host-level reverse proxy
- To make hospital web + API act as one app, you still need a host-level reverse proxy
- Reuse the routing pattern from `deploy/nginx/vendor-proxy.conf` and `deploy/nginx/hospital-proxy.conf`

### Vendor systemd startup

```bash
pnpm install --frozen-lockfile
pnpm build:vendor

sudo cp deploy/control-panel.service /etc/systemd/system/
sudo cp deploy/vendor-dashboard.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now control-panel vendor-dashboard
```

### Hospital systemd startup

```bash
pnpm install --frozen-lockfile
pnpm build:hospital

sudo cp deploy/hospital-api.service /etc/systemd/system/
sudo cp deploy/hospital-web.service /etc/systemd/system/
sudo cp deploy/hospital-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hospital-api hospital-web hospital-agent
```

Note:

- For systemd deployments, build-time frontend env must be set before `pnpm build`
- Recommended hospital build-time values:
  - `NEXT_PUBLIC_API_URL=`
  - `API_INTERNAL_URL=http://localhost:4000`
  - `NEXT_PUBLIC_CONTROL_PANEL_URL=https://vendor.yourdomain.com`
- Recommended vendor build-time value:
  - `NEXT_PUBLIC_CONTROL_PANEL_URL=`
- If you are not putting a reverse proxy in front of the systemd services, set the frontend base URL vars to explicit public API URLs instead of leaving them empty

## 11. Troubleshooting

### Vendor dashboard loads but API calls fail

Check:

- `VENDOR_PUBLIC_ORIGIN` is correct in `.env.control-panel`
- control-panel container is healthy
- proxy is routing `/api/*` to `control-panel:4001`

### Hospital web loads but login/install calls fail

Check:

- hospital proxy is routing `/api/*` to `api:4000`
- `API_INTERNAL_URL` was set correctly during the web build
- `CORS_ORIGINS` matches the hospital public origin

### Hospital agent keeps restarting

Before installation this is expected.

After installation, check:

- `/etc/hospital-cms/installer.lock` exists inside the shared volume
- `/etc/hospital-cms/instance.key` exists inside the shared volume
- `CONTROL_PANEL_URL` is correct
- `VENDOR_PUBLIC_KEY` matches the vendor server

### Hospital registers but does not appear healthy on vendor side

Check:

- outbound connectivity from hospital server to vendor server
- vendor `/api/agent/*` routes are reachable through the public proxy
- hospital agent logs

## 12. Recommended Production Next Step

After your first successful two-server test, the next hardening step is:

1. Put each proxy behind a real domain and TLS
2. Move MongoDB and Redis to managed or hardened persistent hosts if required
3. Restrict public ingress to the proxy only
4. Back up vendor MongoDB and each hospital MongoDB separately
5. Monitor:
   - vendor `/health`
   - hospital `/health`
   - hospital agent heartbeat freshness
