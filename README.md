# Invoice Automation MVP (CFIG)

Konzervativní asistent pro zpracování **přijatých** faktur: přitáhne → vytěží → zkontroluje
→ zařadí do stavu → počká na schválení člověkem → připraví exporty (kontrolní Excel, Pohoda XML).
Nic neúčtuje sám — když si není jistý, dá doklad ke kontrole.

**Plný kontext, architektura a doménová pravidla jsou v [`CLAUDE.md`](./CLAUDE.md).**

## Stack

Backend **Azure Functions v4** (TypeScript, Node 22) · DB **SQLite + Prisma 6** ·
Frontend **Vite + React** (standalone SPA, volá API) · OCR **pdf-parse + mock fixtures**
(Azure Document Intelligence v produkci) · exporty **ExcelJS** + **xmlbuilder2** ·
monorepo **pnpm** (jen API; web je standalone).

## Předpoklady

```bash
nvm use 22
npm i -g pnpm
npm i -g azure-functions-core-tools@4 --unsafe-perm true   # nebo: brew install azure-functions-core-tools@4
npm i -g azurite                                           # storage emulátor pro timer trigger
```

## Spuštění (3 terminály)

```bash
# 0. jednorázově
pnpm setup                         # install + prisma generate + migrate

# 1. storage emulátor (timer trigger ho potřebuje)
azurite --silent --location /tmp/azurite-cfig

# 2. backend API
pnpm api:dev                       # http://localhost:7071

# 3. web UI
cd apps/web && pnpm install && pnpm dev    # http://localhost:4321
```

Ověř: <http://localhost:7071/api/health> → `{ "status": "ok" }`. Otevři <http://localhost:4321>.
Vite proxuje `/api` → `:7071`, takže lokálně žádné CORS. Frontend detaily v
[`apps/web/README.md`](./apps/web/README.md).

## Demo

Krok za krokem v [`docs/demo-script.md`](./docs/demo-script.md). Zkráceně: přetáhni fakturu do
`apps/api/data/input/` (timer ji za ~5 s sebere) nebo nahraj tlačítkem v UI → objeví se zařazená
ve správném stavu → schval → vygeneruj kontrolní Excel a náhled Pohoda XML.

## Funkce (Den 1–7 hotové)

- **Event-driven pipeline** (timer poll + upload) → hash → dedup → OCR → normalizace → pravidlo
  → validace → hard-duplicita → klasifikace → audit
- **Klasifikace do 4 stavů** (§6, konzervativní): K_ODSOUHLASENI / DOPLNIT_PRAVIDLO /
  NEPRECTENO_NEUPLNE / DUPLICITA
- **`ExtractedValue<T>`** všude (oddělení raw / normalized / approved) + **AuditLog** u každé změny
- **REST API**: health, invoices (list+detail), upload, approve, move-status, exporty
- **UI** (review): list s filtrem + auto-refresh, detail s confidence, approval bar
- **Exporty**: kontrolní Excel (3 listy) + Pohoda XML náhled (§9 pravidla) + archivace souborů

## Dokumentace

- [`CLAUDE.md`](./CLAUDE.md) — hlavní kontext, architektura, doménová pravidla
- [`docs/architecture.md`](./docs/architecture.md) — přehled vrstev a local → produkce
- [`docs/demo-script.md`](./docs/demo-script.md) — demo krok za krokem
- [`docs/known-limitations.md`](./docs/known-limitations.md) — co MVP záměrně neřeší

## VS Code

Otevři root složku. Debug Azure Functions: **Run and Debug** → *Attach to Node Functions* (F5).
