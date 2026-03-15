#!/usr/bin/env bash
# ============================================================
# ship-clean.sh — Prepare the project for fresh deployment
#
# Removes all build artifacts and dependencies so the project
# can be shipped to a VPS server in a clean state.
#
# Usage:
#   chmod +x scripts/ship-clean.sh
#   ./scripts/ship-clean.sh
# ============================================================

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "Cleaning Hospital CMS for deployment..."
echo ""

# Remove node_modules (all workspaces)
echo "[1/5] Removing node_modules..."
find . -name "node_modules" -type d -prune -exec rm -rf {} + 2>/dev/null || true

# Remove build output
echo "[2/5] Removing dist/ directories..."
find . -name "dist" -type d -not -path "./.git/*" -prune -exec rm -rf {} + 2>/dev/null || true

# Remove Next.js build caches
echo "[3/5] Removing .next/ directories..."
find . -name ".next" -type d -prune -exec rm -rf {} + 2>/dev/null || true

# Remove Turborepo cache
echo "[4/5] Removing .turbo/ caches..."
find . -name ".turbo" -type d -prune -exec rm -rf {} + 2>/dev/null || true

# Remove misc caches
echo "[5/5] Removing coverage and temp files..."
find . -name "coverage" -type d -prune -exec rm -rf {} + 2>/dev/null || true
find . -name "*.tsbuildinfo" -delete 2>/dev/null || true

echo ""
echo "Done! Project is clean and ready to ship."
echo ""
echo "Next steps on the VPS:"
echo "  1. Install Node.js 22+ and enable corepack:"
echo "       corepack enable && corepack prepare pnpm@10.32.0 --activate"
echo ""
echo "  2. Install dependencies:"
echo "       pnpm install --frozen-lockfile"
echo ""
echo "  3. Build everything:"
echo "       npx turbo build"
echo ""
echo "  4. For Docker deployment (control panel + vendor dashboard):"
echo "       cp .env.control-panel.example .env.control-panel"
echo "       # Edit .env.control-panel with your secrets"
echo "       docker compose --env-file .env.control-panel up -d --build"
echo ""
echo "  5. For hospital client deployment:"
echo "       cp .env.hospital.example .env.hospital"
echo "       # Edit .env.hospital with control panel URL and secrets"
echo "       docker compose --env-file .env.hospital -f docker-compose.hospital.yml up -d --build"
