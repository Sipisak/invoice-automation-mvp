# apps/web — Invoice Review UI

Standalone **Vite + React + TypeScript** single-page app. Talks to the Functions API over
HTTP — no SharePoint/SPFx coupling. (Pivot from the original SPFx webpart plan: we want one
whole page, runnable locally and portable to production behind the API.)

> Standalone on purpose — NOT a pnpm workspace member (see root `pnpm-workspace.yaml`).
> `.npmrc` sets `ignore-workspace=true` so `pnpm install` here installs web's own deps.

## Run locally

```bash
# terminal 1 — storage + backend (Node 22)
cd ../../apps/api
azurite --silent --location /tmp/azurite-cfig &   # timer trigger needs storage
func start                                         # http://localhost:7071

# terminal 2 — UI
cd apps/web
pnpm install        # first time
pnpm dev            # http://localhost:4321
```

Open <http://localhost:4321>. The Vite dev server **proxies `/api` → `http://localhost:7071`**
(see `vite.config.ts`), so the browser sees same-origin and there is **no CORS to configure**.

Demo: drop a PDF into `apps/api/data/input/` (the timer picks it up ~5 s) or use the
**Nahrát fakturu** button. The list auto-refreshes every 5 s.

## Build for production

```bash
pnpm build          # -> dist/ (static HTML + JS)
```

Set `VITE_API_BASE` to the deployed API URL (see `.env.example`) and host `dist/` anywhere —
e.g. Azure Static Web Apps, or surfaced inside SharePoint via a link/embed. Archival of the
PDFs into SharePoint / OneDrive is a **backend** concern (Microsoft Graph, Den 6), not the UI's.

## Structure

```
src/
  main.tsx                 # React entry
  App.tsx                  # layout + 5s polling + upload
  types.ts                 # ExtractedValue/ExtractedInvoiceData mirror, status list, parsers
  client/invoicesClient.ts # fetch wrapper (list/get/approve/move-status/upload)
  components/
    InvoiceList.tsx         # table + status filter
    InvoiceDetail.tsx       # fields + confidence bars, missingFields, warnings, routing
    ApprovalBar.tsx         # Schválit / Duplicita / Přesunout stav
    StatusBadge.tsx         # coloured business-status badge
```
