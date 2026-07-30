# Invoice Automation MVP

Event-driven aplikace pro bezpečné zpracování přijatých faktur. Systém doklad načte, vytěží data, provede validaci a kontrolu duplicit, zařadí ho do odpovídajícího stavu a předá jej člověku ke schválení před vytvořením exportu.

> **Demo projekt:** repozitář používá syntetické faktury, smyšlené identifikátory a ilustrační účetní pravidla. Neobsahuje produkční data, přístupové údaje ani zákaznické dokumenty.

## Základní princip

Systém funguje jako konzervativní účetní asistent, ne jako autonomní účtovací nástroj:

- nejasné nebo neúplné doklady vždy předává ke kontrole,
- odděluje vytěženou, normalizovanou a člověkem schválenou hodnotu,
- eviduje změny a rozhodnutí v auditním logu,
- exportuje pouze schválené a validované údaje.

## Průchod dokladu

```text
Timer trigger / HTTP upload
            │
            ▼
      InvoicePipeline
            │
            ├─ SHA-256 hash a kontrola duplicity
            ├─ OCR / extrakce textu
            ├─ normalizace polí
            ├─ aplikace účetních pravidel
            ├─ validace povinných údajů
            ├─ klasifikace dokladu
            └─ uložení výsledku a AuditLog
            │
            ▼
       Review UI
            │
            ├─ ruční schválení nebo změna stavu
            ├─ kontrolní Excel
            └─ náhled Pohoda XML
```

Oba vstupy — automatický timer i ruční upload — používají stejnou pipeline. Doménová logika proto není duplikovaná v jednotlivých triggerech.

## Hlavní funkce

- **Event-driven pipeline** pro automatický i ruční příjem dokladů
- **Human-in-the-loop workflow** před vytvořením účetního exportu
- **OCR abstrakce** s lokálním PDF parserem a mock fixtures
- **Typovaný model `ExtractedValue<T>`** pro raw, normalized a approved hodnoty
- **Hashová a doménová kontrola duplicit**
- **Konzervativní klasifikace** podle úplnosti dat, confidence a dostupných pravidel
- **AuditLog** při změnách stavu a schválení
- **REST API** pro seznam, detail, upload, schválení, změnu stavu a exporty
- **React review UI** s filtrováním, detailem dokladu a automatickým refreshem
- **Export do Excelu** a generování náhledu Pohoda XML
- **Oddělené adaptéry** pro lokální MVP a plánované cloudové prostředí

## Stavy dokladu

| Stav | Význam |
|---|---|
| `K_ODSOUHLASENI` | Doklad je kompletní a připravený k lidské kontrole |
| `DOPLNIT_PRAVIDLO` | Data jsou čitelná, ale chybí účetní pravidlo |
| `NEPRECTENO_NEUPLNE` | Chybí zásadní údaj nebo je confidence příliš nízká |
| `DUPLICITA` | Systém rozpoznal opakovaně vložený doklad |
| `SCHVALENO` | Doklad byl potvrzen uživatelem |
| `EXPORTOVANO` | Schválená data byla připravena k exportu |

## Technologie

| Vrstva | Technologie |
|---|---|
| Backend | Azure Functions v4, TypeScript, Node.js 22 |
| Frontend | React, Vite, TypeScript |
| Databáze | SQLite, Prisma 6 |
| OCR | `pdf-parse`, mock fixtures |
| Exporty | ExcelJS, xmlbuilder2 |
| Lokální infrastruktura | Azurite |
| Monorepo | pnpm workspaces |

## Lokální a produkční architektura

Kód je navržen tak, aby šlo lokální implementace později nahradit cloudovými adaptéry bez přepisování hlavní pipeline.

| Oblast | Lokální MVP | Produkční varianta |
|---|---|---|
| Trigger | Timer polling / HTTP upload | Blob trigger nebo webhook |
| Úložiště | Lokální filesystem | Azure Blob Storage / SharePoint |
| OCR | `pdf-parse` a mock data | Azure AI Document Intelligence |
| Databáze | SQLite | Azure SQL Database |
| Frontend | Vite dev server | Statický web napojený na API |

## Požadavky

- Node.js 22
- pnpm 9+
- Azure Functions Core Tools v4
- Azurite

```bash
nvm use 22
npm install -g pnpm
npm install -g azure-functions-core-tools@4 --unsafe-perm true
npm install -g azurite
```

Na macOS lze Azure Functions Core Tools nainstalovat také přes Homebrew:

```bash
brew install azure-functions-core-tools@4
```

## Instalace

```bash
git clone https://github.com/Sipisak/invoice-automation-mvp.git
cd invoice-automation-mvp

# Backend dependencies, Prisma Client a lokální migrace
pnpm setup

# Frontend je standalone Vite projekt
cd apps/web
pnpm install
```

## Spuštění

Aplikace se lokálně spouští ve třech terminálech.

### 1. Azurite

```bash
azurite --silent --location /tmp/azurite-invoice-demo
```

### 2. Backend API

```bash
pnpm api:dev
```

API poběží na `http://localhost:7071`.

### 3. Frontend

```bash
cd apps/web
pnpm dev
```

UI poběží na `http://localhost:4321`. Vite v development režimu proxyuje `/api` na Azure Functions API, takže lokálně není potřeba samostatná CORS konfigurace.

Ověření backendu:

```bash
curl http://localhost:7071/api/health
```

```json
{
  "status": "ok"
}
```

## Demo scénář

1. Nahraj fakturu přes webové UI nebo ji vlož do `apps/api/data/input/`.
2. Timer trigger soubor převezme a spustí zpracovatelskou pipeline.
3. Doklad se zobrazí v UI se stavem, vytěženými hodnotami a confidence.
4. Zkontroluj výsledek a doklad schval nebo přesuň do jiného stavu.
5. Vygeneruj kontrolní Excel nebo náhled Pohoda XML.

Detailní postup je v [`docs/demo-script.md`](./docs/demo-script.md).

## Testování a build

Backendové testy:

```bash
pnpm --filter api test
```

Backend build:

```bash
pnpm api:build
```

Frontend typecheck a produkční build:

```bash
cd apps/web
pnpm typecheck
pnpm build
```

## Struktura projektu

```text
invoice-automation-mvp/
├── apps/
│   ├── api/
│   │   ├── prisma/          # datový model a migrace
│   │   └── src/
│   │       ├── functions/   # Azure Functions triggery a HTTP endpointy
│   │       ├── pipeline/    # orchestrace zpracování faktury
│   │       ├── services/    # OCR, pravidla, validace, exporty
│   │       ├── repositories/# přístup k databázi
│   │       └── types/       # doménové typy
│   └── web/
│       └── src/
│           ├── client/      # API klient
│           └── components/  # review UI
├── docs/                    # architektura, demo a omezení
├── CLAUDE.md                # vývojový kontext a doménová rozhodnutí
└── pnpm-workspace.yaml
```

## Známá omezení MVP

- lokální filesystem místo cloudového úložiště,
- SQLite místo Azure SQL,
- omezené OCR pro textová PDF a testovací fixtures,
- bez produkční autentizace a autorizace,
- bez náhledu původního PDF přímo v review UI,
- účetní pravidla jsou zatím statická a ilustrační.

Podrobnosti jsou v [`docs/known-limitations.md`](./docs/known-limitations.md).

## Dokumentace

- [`docs/architecture.md`](./docs/architecture.md) — architektura a mapování lokálních komponent na produkční služby
- [`docs/demo-script.md`](./docs/demo-script.md) — kompletní demo scénář
- [`docs/known-limitations.md`](./docs/known-limitations.md) — vědomě omezený rozsah MVP
- [`apps/web/README.md`](./apps/web/README.md) — frontend a lokální API konfigurace
- [`CLAUDE.md`](./CLAUDE.md) — detailní vývojový kontext, architektura a doménová rozhodnutí
