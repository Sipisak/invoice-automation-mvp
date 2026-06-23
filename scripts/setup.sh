#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

NODE_MAJOR="$(node -v | sed 's/v\([0-9]*\).*/\1/')"
if [ "$NODE_MAJOR" != "18" ]; then
  echo "WARNING: Node $NODE_MAJOR detected. SPFx needs Node 18. Run 'nvm use 18'."
fi

command -v pnpm >/dev/null 2>&1 || { echo "Installing pnpm..."; npm i -g pnpm; }

echo "==> pnpm install"
pnpm install

echo "==> prisma generate + migrate"
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate

echo ""
echo "Done. Start the backend:  pnpm api:dev   (http://localhost:7071/api/health)"
echo "Scaffold the web app:     see apps/web/README.md"
