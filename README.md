# Hospital CMS Hospital Repo

This repo contains only the hospital-side product:

- `apps/api`
- `apps/web`
- `apps/agent`
- shared packages required by those apps

It does not contain:

- `apps/control-panel`
- `apps/vendor-dashboard`

## Quick Start

```bash
cp .env.example .env
docker compose --env-file .env up -d --build
```

Open:

- `http://SERVER_IP:8080/install` before installation
- `http://SERVER_IP:8080/login` after installation
