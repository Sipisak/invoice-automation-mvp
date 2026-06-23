# Invoice Automation MVP (CFIG)

Konzervativní asistent pro zpracování **přijatých** faktur: přitáhne → vytěží → zkontroluje
→ zařadí → počká na schválení člověkem → připraví exporty (Pohoda XML, kontrolní Excel).

**Plný kontext, architektura a doménová pravidla jsou v [`CLAUDE.md`](./CLAUDE.md).**
Claude Code ho čte automaticky — začni tam.

## Stack

Backend Azure Functions (TS, Node 18) · DB SQLite + Prisma · Frontend SPFx React ·
OCR pdf-parse + mock (Azure DI v produkci) · monorepo pnpm (jen API).

## Předpoklady

```bash
nvm use 18                                   # SPFx vyžaduje Node 18
npm i -g pnpm
npm i -g azure-functions-core-tools@4 --unsafe-perm true
npm i -g yo @microsoft/generator-sharepoint gulp-cli
```

## Rychlý start (backend)

```bash
# macOS / Linux
./scripts/setup.sh
# Windows PowerShell
./scripts/setup.ps1

# nebo ručně:
pnpm install
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate
pnpm api:dev
```

Ověř: <http://localhost:7071/api/health> → `{ "status": "ok", ... }`
a <http://localhost:7071/api/invoices> → `[]` (prázdná DB po migraci).

> Timer trigger (Den 2) potřebuje storage emulátor: `npm i -g azurite`, spusť `azurite`,
> a v `apps/api/local.settings.json` nastav `AzureWebJobsStorage` na `UseDevelopmentStorage=true`.
> Pro samotné HTTP endpointy (health, invoices) to teď není potřeba.

## Frontend (SPFx)

Viz [`apps/web/README.md`](./apps/web/README.md) — scaffolding přes Yeoman + spuštění
`gulp serve` proti běžícímu backendu.

## VS Code

Otevři root složku. Doporučená rozšíření nabídne VS Code sám
(`.vscode/extensions.json`). Debug Azure Functions: panel **Run and Debug** →
*Attach to Node Functions* (F5) — postaví TS, spustí host, připojí debugger.

## Co je hotové a co dodělá Claude Code

Hotové (bootuje): pnpm workspace, Azure Functions v4 skeleton, Prisma schema + 5 modelů,
typy (`ExtractedValue`, enums), `GET /health`, `GET /invoices`, VS Code config, rules.json
skeleton, datové složky.

Dodělá Claude Code podle `CLAUDE.md` (Den 2–7): `InvoicePipeline`, timer trigger, upload
endpoint, OCR služby, rule matching, klasifikace, duplicity, SPFx UI, Excel + Pohoda XML
export, archivace, audit log.
