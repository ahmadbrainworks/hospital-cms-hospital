# Hospital CMS Hospital Repo Deployment

This repo contains only the hospital-side product:

- `apps/api`
- `apps/web`
- `apps/agent`

It does not contain:

- `apps/control-panel`
- `apps/vendor-dashboard`

## 1. Clone on the hospital server

```bash
git clone <hospital-repo-url> /opt/hospital-cms-hospital
cd /opt/hospital-cms-hospital
```

## 2. Create the environment file

```bash
cp .env.example .env
```

Set at minimum:

- `HOSPITAL_PUBLIC_ORIGIN`
- `CONTROL_PANEL_URL`
- `JWT_SECRET`
- `REFRESH_TOKEN_SECRET`
- `ENCRYPTION_KEY`
- `MFA_ENCRYPTION_KEY`
- `VENDOR_PUBLIC_KEY`
- `API_ADMIN_TOKEN`
- `AGENT_SECRET`

Example:

```env
HOSPITAL_PUBLIC_ORIGIN=https://hospital-a.example.com
CONTROL_PANEL_URL=https://vendor.example.com
```

## 3. Start the hospital stack

```bash
docker compose --env-file .env up -d --build
```

## 4. Verify before installation

```bash
curl http://localhost:8080/health
```

Expected:

- HTTP 200
- JSON with `"isInstalled": false`

## 5. Run the installer

Open:

- `http://SERVER_IP:8080/install`

Use:

- the vendor control-panel URL
- a registration token created from the vendor dashboard

## 6. Verify registration

After installation:

- `/health` should report `isInstalled: true`
- the hospital login page should be available
- the instance should appear in the vendor dashboard
- the vendor side should start receiving agent heartbeats
