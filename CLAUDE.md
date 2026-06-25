# CLAUDE.md — Invoice Automation MVP (CFIG)

> Tento soubor je hlavní kontext pro Claude Code. Čti ho na začátku každé session.
> Drž se rozhodnutí v něm. Pokud něco není jasné, zeptej se, **nehádej**.

---

## 0. Zlaté pravidlo projektu

> **Raději poslat doklad ke kontrole, než vygenerovat chybný import do účetnictví.**

Systém je konzervativní účetní asistent, **ne** autonomní AI, která sama účtuje.
Pokud si není jistý, zařadí doklad ke kontrole. Nikdy nehádá hodnoty.
Do exportů (Pohoda/Intranet) jde jen to, co je schválené nebo má jasné pravidlo.

Priorita pro tuto fázi:
```
bezpečnost > kontrola > audit > správnost > jednoduchost > automatizace > rychlost
```

---

## 1. Co stavíme

Interní systém pro automatizaci zpracování **přijatých faktur** ve skupině CFIG.
Faktury přitékají (mail/složka), systém je vytěží, zkontroluje, zařadí do stavu,
počká na lidské schválení a připraví výstupy pro Pohodu, Intranet a banku.

Tohle je **MVP / mini demo na 1 týden**, lokálně na notebooku. Cíl:
ukázat bezpečný end-to-end průchod faktury systémem, ne produkční řešení.

---

## 2. Tech stack (neměnit bez domluvy; verze zvednuty 2026-06-23 — viz pozn.)

| Vrstva | Volba | Pozn. |
|---|---|---|
| Backend | **Azure Functions v4** (TypeScript 6, Node 22) | lokálně `func start`, produkčně M365/Azure. Node 22 = jediný podporovaný Functions runtime (Node 20 EOL 04/2026) |
| Frontend | **Vite + React + TS** (standalone SPA) | PIVOT 2026-06-24 (od SPFx). Jedna celá stránka volající API; lokálně `pnpm dev` (proxy /api → :7071), produkčně build → statika za API (Static Web App / embed v SharePointu). Archivace do SharePoint/OneDrive = backend přes Graph (Den 6), ne UI. SPFx gotchy v §13 jsou tím obsolete. Viz `apps/web/README.md`. |
| DB | **SQLite + Prisma 6** | lokálně 1 soubor; produkčně swap na Azure SQL. Prisma 7 odložena (vynucuje ESM + driver adapter — viz git) |
| OCR | **pdf-parse 1.x** (textová PDF) + **mock fixtures** (scany) | pinnuto na v1 (v2 má jiné API); throwaway impl za `OcrService`, produkčně Azure Document Intelligence |
| Monorepo | **pnpm workspaces** | sdílené typy mezi api a web |
| Excel export | **ExcelJS** | |
| XML export | **xmlbuilder2** | |

Vývojář: **jeden mid+ dev s Claude Code**. Drž kód jednoduchý, čitelný, bez over-engineeringu.

### Prerekvizity (nainstalovat před Den 1)
```bash
nvm use 22
npm i -g pnpm
npm i -g azure-functions-core-tools@4 --unsafe-perm true
npm i -g yo @microsoft/generator-sharepoint gulp-cli
```

---

## 3. Architektura — event-driven pipeline

**Klíčové rozhodnutí:** žádný manuální `ingest → process`. Místo toho jedna sdílená
pipeline spouštěná dvěma vstupy.

```
Timer trigger (poll ~5s)  ─┐
                           ├─→  InvoicePipeline.run(file, batchId)
POST /invoices/upload ─────┘            │
                                        ├─ 1. fileHash (SHA-256)
                                        ├─ 2. hash-duplicita check (pre-extraction)
                                        ├─ 3. vytvoř Invoice záznam (stav PROCESSING)
                                        ├─ 4. OcrService.extract()  → ExtractedValue<T>
                                        ├─ 5. normalizace (datum, částka, měna, účet)
                                        ├─ 6. RuleMatchingService.match()
                                        ├─ 7. hard-duplicita check (post-extraction)
                                        ├─ 8. classifyInvoice() → business stav
                                        └─ 9. ulož + AuditLog
```

`InvoicePipeline` je čistý orchestrátor — **neví**, jestli ho zavolal timer nebo upload.
Obě cesty sdílí stejnou logiku. Žádná duplikace.

### Mapování local → produkce (proč to tak stavíme)

| Vrstva | Lokální MVP | Produkce |
|---|---|---|
| Trigger | Timer poll `data/input/` | Blob trigger / Power Automate webhook na SharePoint |
| Storage | lokální FS | SharePoint Document Library (Graph API) |
| OCR | pdf-parse + mock | Azure Document Intelligence |
| DB | SQLite | Azure SQL |

Vyměňuje se jen trigger + storage adapter + OCR impl. Pipeline a business logika zůstávají.

### Koncept dávky (Batch)
Některá pravidla fungují na úrovni dávky (např. „objednávka + faktura ve stejné dávce
→ objednávku ignoruj"). Každé spuštění pipeline má `batchId`. Pro MVP: jeden timer tick
nebo jeden upload = jedna dávka. Entita `Batch` existuje od začátku.

---

## 4. Struktura repozitáře

```text
invoice-automation-mvp/
  pnpm-workspace.yaml
  package.json              # root scripts only
  .env.example
  CLAUDE.md                 # tento soubor
  README.md

  # ponytail: žádný packages/shared zatím. Typy jsou kolokované v apps/api/src/types.
  # Web (SPFx) je standalone npm projekt MIMO pnpm workspace (SPFx + gulp se rozbijí
  # pod pnpm symlinky). Když web bude reálně sdílet typy, vytvoř packages/shared tehdy.

  apps/
    api/                    # Azure Functions (jediný pnpm workspace member)
      host.json
      local.settings.json   # CORS + connection string
      prisma/
        schema.prisma
        migrations/
      src/
        functions/          # každý trigger = jeden soubor
          health.ts             # GET  /api/health            [HOTOVO]
          getInvoices.ts        # GET  /api/invoices          [HOTOVO]
          getInvoice.ts         # GET  /api/invoices/{id}
          timerIngest.ts        # Timer trigger → poll input/
          uploadInvoice.ts      # POST /api/invoices/upload
          approveInvoice.ts     # POST /api/invoices/{id}/approve
          moveStatus.ts         # POST /api/invoices/{id}/move-status
          overrideField.ts      # POST /api/invoices/{id}/override-field
          exportExcel.ts        # POST /api/exports/control-excel
          exportPohodaXml.ts    # POST /api/exports/pohoda-xml-preview
        lib/
          prisma.ts             # PrismaClient singleton       [HOTOVO]
        types/                  # kolokované sdílené typy       [HOTOVO]
          ExtractedValue.ts
          enums.ts
          invoice.ts            # ExtractedInvoiceData (JSON blob shape)
        pipeline/
          InvoicePipeline.ts    # orchestrátor
        services/
          OcrService.ts             # interface
          TextPdfExtractor.ts       # pdf-parse impl
          MockOcrExtractor.ts       # fixture impl
          FieldNormalizationService.ts
          RuleMatchingService.ts
          ValidationService.ts
          ClassificationService.ts  # classifyInvoice()
          DuplicateDetectionService.ts
          ControlExcelExportService.ts
          PohodaXmlExportService.ts
          ArchiveService.ts
          AuditLogService.ts
        repositories/
          InvoiceRepository.ts
          BatchRepository.ts
          SupplierRepository.ts
          CompanyRepository.ts
        utils/
          fileHash.ts
          dateParser.ts
          moneyParser.ts
          logger.ts
      data/
        input/              # sem se kopírují faktury (timer je sebere)
        input-samples/      # testovací faktury (NE v input/, jinak je timer sebere hned)
        processed/
        archive/            # archive/{company}/{year}/{month}/
        output/             # vygenerované Excel/XML
        rules.json          # mock rule engine
        mock-ocr/           # fixture JSON pro mock OCR

    web/                    # standalone Vite + React SPA (PIVOT ze SPFx, viz §2) — volá API
      index.html
      vite.config.ts        # dev proxy /api -> :7071 (lokálně bez CORS)
      src/
        main.tsx
        App.tsx             # layout + 5s auto-refresh + upload
        types.ts            # mirror ExtractedValue/enums + parsery
        client/
          invoicesClient.ts # fetch wrapper (list/get/approve/move-status/upload)
        components/
          InvoiceList.tsx
          InvoiceDetail.tsx
          ApprovalBar.tsx
          StatusBadge.tsx

  docs/
    architecture.md
    demo-script.md
    known-limitations.md
```

---

## 5. Datové typy (packages/shared)

### ExtractedValue — fundament celého systému
Odděluje AI/OCR hodnotu od schválené účetní hodnoty. **Bez tohohle se neobejdeme.**

```ts
export interface ExtractedValue<T> {
  rawValue: string | null;        // co OCR/pdf-parse přečetl doslova
  normalizedValue: T | null;      // znormalizováno (datum, číslo, měna)
  confidence: number;             // 0..1
  sourceText?: string;            // odkud v dokumentu
  approvedValue?: T | null;       // co potvrdil člověk
  approvedBy?: string | null;
  approvedAt?: string | null;
}
```

### Stavy
```ts
export type InvoiceBusinessStatus =
  | 'K_ODSOUHLASENI'
  | 'DOPLNIT_PRAVIDLO'
  | 'NEPRECTENO_NEUPLNE'
  | 'DUPLICITA'
  | 'SCHVALENO'
  | 'EXPORTOVANO';

export type InvoiceTechnicalStatus =
  | 'PROCESSING' | 'EXTRACTED' | 'CLASSIFIED'
  | 'APPROVED' | 'REJECTED'
  | 'READY_FOR_EXPORT' | 'EXPORTED' | 'ARCHIVED'
  | 'FAILED';
```

### Invoice (zkráceně — plné pole viz LLM_PROJECT_CONTEXT)
```ts
export interface Invoice {
  id: string;
  batchId: string;
  fileName: string;
  filePath: string;
  fileHash: string;
  documentType: DocumentType;

  technicalStatus: InvoiceTechnicalStatus;
  businessStatus: InvoiceBusinessStatus;

  ourCompany?: ExtractedValue<string>;
  supplier?: ExtractedValue<string>;
  supplierIco?: ExtractedValue<string>;

  invoiceNumber?: ExtractedValue<string>;
  variableSymbol?: ExtractedValue<string>;
  issueDate?: ExtractedValue<string>;
  dueDate?: ExtractedValue<string>;
  taxDate?: ExtractedValue<string>;

  currency?: ExtractedValue<string>;
  totalAmount?: ExtractedValue<number>;
  totalAmountCzk?: ExtractedValue<number>;

  bankAccount?: ExtractedValue<string>;
  bankCode?: ExtractedValue<string>;
  iban?: ExtractedValue<string>;
  bic?: ExtractedValue<string>;

  vatClassification?: string | null;
  accountingPredefinition?: string | null;
  ruleMatched: boolean;
  ruleId?: string | null;

  routingToPohoda: boolean;
  routingToIntranet: boolean;
  routingReason?: string;

  missingFields: string[];
  warnings: string[];
  isHardDuplicate: boolean;
  isSoftDuplicate: boolean;

  approvedBy?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
```

---

## 6. Klasifikační logika (KONZERVATIVNÍ — nehádat)

`classifyInvoice(invoice)` rozhoduje v tomto pořadí:

```text
1. Pokud hard-duplicita        → DUPLICITA
2. Jinak pokud chybí zásadní pole NEBO nízká confidence  → NEPRECTENO_NEUPLNE
3. Jinak pokud chybí účetní pravidlo                      → DOPLNIT_PRAVIDLO
4. Jinak (kompletní + pravidlo existuje)                  → K_ODSOUHLASENI
```

### Povinná pole pro K_ODSOUHLASENI
```
ourCompany, supplier, invoiceNumber,
variableSymbol (nebo bezpečně odvozený z čísla dokladu),
issueDate, totalAmount, currency,
vatClassification, accountingPredefinition,
routing rozhodnutí
```
Pro platbu navíc: `dueDate` + (`bankAccount`+`bankCode`) nebo `iban`.

### DOPLNIT_PRAVIDLO (čitelné, ale chybí pravidlo)
Dodavatel + naše firma + částka + měna jsou OK, ale chybí předkontace nebo DPH členění.
Typicky nový dodavatel nebo dodavatel historicky účtovaný různě.
**Pozor:** chybějící pravidlo ≠ nepřečteno. Nepatří do NEPRECTENO_NEUPLNE.

### NEPRECTENO_NEUPLNE (chybí zásadní data)
Není jasný dodavatel / naše firma, chybí částka / měna / číslo faktury / datum,
nízká OCR confidence, dokument není jasně faktura.

### Variabilní symbol — priorita určení
```
1. explicitní "Variabilní symbol" na faktuře  → použij to
2. jinak číselná část z čísla dokladu
3. jinak ke kontrole
```
VS neoznačuj jako chybějící, pokud jde bezpečně odvodit.

---

## 7. API endpointy

```http
GET   /api/health
POST  /api/invoices/upload                 # ruční upload → pipeline, 202 + id
GET   /api/invoices                        # list + filtr ?status=
GET   /api/invoices/{id}
POST  /api/invoices/{id}/approve
POST  /api/invoices/{id}/move-status       # body: { targetStatus }
POST  /api/invoices/{id}/override-field    # body: { field, value, reason } — reason POVINNÝ
POST  /api/exports/control-excel
POST  /api/exports/pohoda-xml-preview

# žádný /ingest, žádný /process — to dělá pipeline (timer + upload) interně
# timerIngest NENÍ HTTP endpoint, běží na pozadí
```

Každá změna stavu / override pole → zápis do `AuditLog` (kdo, co, před/po, proč).

---

## 8. Duplicity

**Hash duplicita** (pre-extraction): stejný SHA-256 souboru. Levné, hned v pipeline.

**Hard duplicita** (post-extraction): `naše firma + dodavatel + číslo faktury + částka + měna`.
Vyžaduje vytěžená data, proto až po extrakci.

**Soft duplicita** (jen flag, neblokuje, do kontroly): stejný VS / částka / dodavatel / datum,
objednávka+faktura ke stejné věci. Nikdy se neimportuje automaticky.

V kódu drž oddělené `hashDuplicate` vs `hardDuplicate` — jsou to dvě různé věci.

---

## 9. Pohoda XML — KRITICKÁ pravidla (nedělat blbě)

```
- Každá společnost = vlastní XML. Root dataPack má IČO té konkrétní účetní jednotky.
- Každý dataPackItem má unikátní ID.

ZAKÁZÁNO:
- inv:number                    (pole "Číslo" v Pohodě zůstává systémové)
- inv:originalDocumentNumber    (pro běžné číslo dodavatelské faktury)
- inv:typeServiceMOSS
- inv:foreignCurrency v hlavičce
- inv:priceNone / inv:currency / inv:rate / inv:amount  (špatný namespace)

POUŽÍVAT:
- inv:originalDocument          (číslo dodavatelského dokladu)
- typ: namespace pro částky/měnu:
    typ:priceNone, typ:priceHigh, typ:priceSum, typ:currency, typ:rate, typ:amount

Cizí měna: foreignCurrency u POLOŽKY a v SOUHRNU, ne v hlavičce. CZK → homeCurrency.
Nulová sazba DPH → částka do typ:priceNone, NIKDY do priceHigh/priceHighVAT/priceHighSum.
```

### Naučený příklad: Meta / TRONEXO (reverse charge EU)
```
předkontace: 2Fp
členění DPH: PDslRegEU
sazba DPH v XML: none
dodavatel: Meta Platforms Ireland Limited
číslo faktury (FBADS) → inv:originalDocument
kurz: jednotný roční (jen TRONEXO a TIKETA Services)
jedna platba = jedna faktura, neprovedené transakce vyřadit
```
**Tohle pravidlo se NESMÍ slepě přenášet na jiné firmy bez ověření z historických exportů.**

---

## 10. Naučená doménová pravidla (z reálných faktur)

- **MAKRO** = vždy CZK. EUR na faktuře je jen informační, ignoruj. Platba tuzemská.
- **Neplátci DPH ve skupině** (CFIG Credit, Borek, Financial, Hradecká, Vrtálna, TIKETA a.s.)
  → členění DPH vždy **PN**, bez ohledu na dodavatele.
- **Dodavatel neplátce DPH** (bez DIČ, bez DPH na faktuře) → typicky **PN**.
- **Jednotný roční kurz**: jen TRONEXO a TIKETA Services. Ostatní = denní kurz ČNB dle data vystavení.
- **CZK faktury**: kurzový režim prázdný, typ platby tuzemská.
- **Datum období ≠ datum vystavení** — nikdy neber datum z textu období jako datum vystavení.
- **Zakázané jako název dodavatele**: "není plátce DPH", "faktura", "daňový doklad",
  "variabilní symbol", "celkem k úhradě", "odběratel", "naše firma". Dodavatel musí být
  reálná osoba/firma. Když není jasný → NEPRECTENO_NEUPLNE.
- **Kontrola odběratele v textu**: pokud je faktura vystavena na firmu X, ale v textu se
  objevuje jiná firma skupiny jako odběratel → ke kontrole.
- **Objednávka / nedaňový doklad** → do Intranetu ANO, do Pohody NE.

---

## 11. Routing (Pohoda vs Intranet)

```
Běžná přijatá faktura k úhradě:        Pohoda ANO, Intranet ANO
Faktura už v Intranetu přes objednávku: Pohoda ANO, Intranet NE  (aby se nezdublovala)
Objednávka / nedaňový doklad:          Pohoda NE,  Intranet ANO
Duplicita:                             Pohoda NE,  Intranet NE, stav DUPLICITA
```

---

## 12. Plán po dnech

> **STAV: Den 1–7 hotové.** Tohle je původní plán (historie). Odchylka: frontend se NEdělal
> jako SPFx, ale jako standalone **Vite + React SPA** (viz §2). Zmínky o `yo @microsoft/sharepoint`,
> `gulp serve` a SPFx dev certifikátu v Den 1/Den 5 jsou tím nahrazené — viz `apps/web/README.md`.

### Den 1 — Setup
- pnpm workspace + packages/shared (typy)
- `func init apps/api`, `yo @microsoft/sharepoint` → apps/web
- důvěřovat SPFx dev certifikátu
- CORS v local.settings.json (`https://localhost:4321`)
- Prisma schema: Invoice, Supplier, Company, Batch, AuditLog → první migration
- rules.json skeleton, 3 anonymizované faktury do `data/input-samples/`
- ověřit: `func start` + `gulp serve` běží zároveň

### Den 2 — Pipeline jádro + storage + timer
- Repository vrstva (Prisma), AuditLogService, fileHash
- `InvoicePipeline.run()` zatím: hash → dedup → vytvoř záznam → ulož
- Timer trigger: poll `data/input/`, založ Batch, zavolej pipeline na nové soubory
- `POST /api/invoices/upload` → stejná pipeline
- `GET /api/invoices`, `GET /api/invoices/{id}`
- test: PDF do input/ → za ~5s v DB

### Den 3 — OCR + extrakce do pipeline
- `OcrService` interface; `TextPdfExtractor` (pdf-parse); `MockOcrExtractor` (fixture)
- extrakce polí → ExtractedValue (raw + normalized + confidence)
- zapojit do pipeline; při chybě → stav FAILED (záznam zůstává viditelný)
- test: faktura A skrz celou pipeline

### Den 4 — Rule engine + klasifikace + duplicity
- rules.json (A má pravidlo, B nemá)
- RuleMatchingService, ValidationService, `classifyInvoice()`
- hard-duplicita (post-extraction)
- AuditLog při změně stavu
- test 3 scénáře: A→K_ODSOUHLASENI, B→DOPLNIT_PRAVIDLO, C→NEPRECTENO_NEUPLNE

### Den 5 — UI (postaveno jako Vite + React SPA, ne SPFx — viz §2)
- `invoicesClient.ts` (fetch wrapper; dev proxy /api → :7071, bez CORS)
- InvoiceList (tabulka, filtr, auto-refresh ~5s), StatusBadge
- InvoiceDetail (pole + confidence, missingFields, warnings, routing)
- ApprovalBar (Schválit / Duplicita / Přesunout stav)
- `POST /approve`, `POST /move-status`
- test E2E: PDF → UI → schválit
- **Vynecháno (backlog):** PDF náhled, editace polí v UI, history panel

### Den 6 — Exporty + archivace
- ControlExcelExportService (3 listy: K_odsouhlaseni / Doplnit_pravidlo / Neprecteno_neuplne)
- PohodaXmlExportService skeleton (viz sekce 9 — dodržet namespace pravidla!)
- ArchiveService: přejmenuj + přesuň do `archive/{company}/{year}/{month}/`
- `POST /exports/control-excel`, `POST /exports/pohoda-xml-preview`

### Den 7 — Demo
- E2E s demo daty, README, known-limitations.md, vyčistit, demo script

---

## 13. Frontend + Azure Functions gotchy (POZOR)

> Frontend je standalone **Vite + React SPA** (pivot ze SPFx, §2). Původní SPFx gotchy
> (workbench CORS, HttpClient místo fetch, gulp serve, SPFx Node 18) jsou tím **obsolete**.
> Co platí teď:

1. **CORS lokálně netřeba**: Vite dev server proxuje `/api` → `http://localhost:7071`
   (`apps/web/vite.config.ts`), takže prohlížeč vidí same-origin. `invoicesClient.ts` volá
   přes `fetch` na `import.meta.env.VITE_API_BASE ?? '/api'`. Produkčně nastav `VITE_API_BASE`
   + zabezpeč API (CORS/auth) na serveru.
2. **Node 22 všude** — api i web. Žádné dvě nvm verze (to byl SPFx problém).
3. **PDF náhled vynechán** — mimo MVP scope (známé omezení), zobrazujeme jen vytěžená pole.
4. **UI auto-refresh je nutný** — faktury přitékají přes timer, takže InvoiceList sám polluje
   (~5s), jinak uživatel nevidí naskakování. Dělá to demo živé.
5. **Azure Functions upload je async**: `upload` vrací 202 + id, těžké zpracování (OCR) běží
   v pipeline. API nesmí viset na OCR.
6. **Timer cold-start**: po čerstvém `func start` může první tick timeru přijít až ~1 min po
   náběhu hostu (storage lease warmup), pak už spolehlivě à 5 s. Timer přesouvá soubor z
   `input/` do `processed/` PŘED zpracováním → žádný re-ingest.
7. **func nezabíjej přes `pkill -f "func start"`** — netrefí host proces, který drží otevřený
   (smazaný) `dev.db` inode → stale čtení / „readonly database" zápisy. Použij
   `lsof -ti tcp:7071 | xargs kill -9`.

---

## 14. Bezpečnost

- **Produkční faktury NEPOSÍLAT do veřejných LLM** (Claude/ChatGPT/Gemini) bez schválení.
  Pro vývoj/testy jen **anonymizované** faktury. (Testovací faktury A/B/C jsou anonymizované.)
- Oddělit AI návrh (`rawValue`/`normalizedValue`) od schválené hodnoty (`approvedValue`).
- Auditní historie každé změny (AuditLog).
- Neimportovat nic bez schválení nebo jasného pravidla.
- MVP nemá autentizaci → do known-limitations uvést explicitně; demo jen lokálně.

---

## 15. Co je MVP a co NENÍ

**JE v MVP:**
event-driven pipeline (timer + upload), SQLite storage, pdf-parse + mock OCR,
základní extrakce + normalizace, mock rule engine (rules.json), klasifikace do 3 stavů,
hard+hash duplicity, SPFx UI (list+detail+schválení), kontrolní Excel, Pohoda XML skeleton,
archivace, audit log.

**NENÍ v MVP (backlog):**
přímé Pohoda mServer / Intranet API, Azure DI, plná DB dodavatelů, kompletní DPH pravidla,
kompletní předkontace, všechny formáty dokumentů, pokročilé anomálie, dashboardy,
PDF náhled v UI, editace polí v UI, autentizace, full state-machine guardy, bank report.

---

## 16. Demo script

```
1. Prázdné UI + prázdná input složka.
2. Přetáhnu fakturu A do data/input/.
3. Za pár sekund se sama objeví v UI jako K_ODSOUHLASENI.
4. Přetáhnu B a C najednou (jedna dávka).
5. B → DOPLNIT_PRAVIDLO, C → NEPRECTENO_NEUPLNE.
6. Detail B: údaje přečtené, ale chybí pravidlo.
7. Detail C: chybějící pole + nízká confidence.
8. Schválím A.
9. Vygeneruji kontrolní Excel (3 listy).
10. Vygeneruji Pohoda XML skeleton pro A.
11. Ukážu archivovaný přejmenovaný soubor.

Message: systém nic neúčtuje sám. Přitáhne, vytěží, zařadí, počká na člověka.
Kontrolovaný auditovatelný asistent, ne černá skříňka.
```

---

## 17. Pravidla pro práci Claude Code v tomto repu

- Nehádej doménová pravidla. Když chybí info, zeptej se nebo dej doklad ke kontrole.
- Drž `InvoicePipeline` jako jediné místo orchestrace; timer a upload ho jen volají.
- Každá služba má jednu odpovědnost; business logika nepatří do funkcí (HTTP triggerů).
- OCR vždy za interface (`OcrService`) — swap mock ↔ Azure DI bez dotčení pipeline.
- `ExtractedValue` u všech vytěžených polí. Nikdy nesměšuj raw a approved.
- Při změně stavu/pole → vždy AuditLog.
- Dodržuj Pohoda XML pravidla ze sekce 9 doslova.
- Drž MVP scope (sekce 15). Nepřidávej funkce z backlogu bez vyžádání.
- TypeScript strict mode. Žádné `any` bez komentáře proč.
```

---

## 18. Styl práce: ponytail (líný senior dev) — ale s pojistkou

Drž se ponytail filozofie: nejjednodušší funkční řešení, YAGNI, stdlib před závislostí,
nativní feature před knihovnou, mazání před přidáváním, nejméně souborů. Vědomé zkratky
označuj komentářem `// ponytail: <co je zjednodušené>, <upgrade path>`.

**ALE — v tomhle projektu NEJSI líný u věcí, které drží bezpečnost a audit.**
Tyhle NIKDY neořezávej jako „over-engineering", jsou load-bearing:

- `ExtractedValue<T>` separace (raw vs normalized vs approved)
- AuditLog u každé změny stavu / override pole
- konzervativní klasifikace (raději ke kontrole než hádat)
- validace na trust boundary (vytěžená data z OCR jsou nedůvěryhodná)
- Pohoda XML namespace pravidla (sekce 9)

Pokud bys měl pocit, že některá z těchto věcí je zbytečně složitá — není. Nech ji být.
Líný buď u UI, abstrakcí, konfigurace, počtu souborů. Ne u kontroly a auditu.

---

## 19. Aktuální stav repa (co je hotové)

Bootuje hned po `pnpm install && pnpm --filter api prisma:migrate`:

- pnpm workspace (jen `apps/api`), root scripts
- Azure Functions v4 skeleton: `GET /api/health`, `GET /api/invoices`
- Prisma schema: Company, Supplier, Batch, Invoice, AuditLog (SQLite)
- typy: `ExtractedValue`, enums, `ExtractedInvoiceData`
- `lib/prisma.ts` (PrismaClient singleton)
- `data/rules.json` skeleton, datové složky
- VS Code config: extensions, settings, launch (Attach to Node Functions), tasks
- `apps/web/README.md` + `invoicesClient.ts` (SPFx se scaffolduje přes yeoman)

**Tvůj první úkol = Den 2 z plánu (sekce 12):** `InvoicePipeline` + timer trigger +
`POST /invoices/upload` + repository vrstva. Postupuj po dnech, nepředbíhej scope.
