# Architektura (přehled)

Detailní rozhodnutí a doménová pravidla jsou v [`../CLAUDE.md`](../CLAUDE.md) (§3, §9–§11).
Tohle je rychlý přehled vrstev.

## Event-driven pipeline

Žádný manuální `ingest → process`. Jedna sdílená pipeline, dva vstupy:

```
Timer trigger (poll data/input/ ~5s) ─┐
                                       ├─→ InvoicePipeline.run(file, batchId)
POST /api/invoices/upload ─────────────┘            │
   1. fileHash (SHA-256)
   2. hash-duplicita (pre-extraction)        → DUPLICITA (born)
   3. vytvoř Invoice (PROCESSING)
   4. OcrService.extract()                   → ExtractedValue<T> per pole
   5. EXTRACTED (nebo FAILED, záznam zůstává)
   6. RuleMatchingService.match()            (supplierIco → rules.json)
   7. ValidationService.validate()           (povinná pole, confidence, §6 payment tier)
   8. hard-duplicita (dedupKey)
   9. classifyInvoice()                       → business stav (CLASSIFIED) + routing
  10. AuditLog u každé změny stavu
```

`InvoicePipeline` je čistý orchestrátor — neví, jestli ho zavolal timer nebo upload.
Business logika je ve službách, ne v HTTP triggerech (§17).

## Vrstvy a mapování local → produkce

| Vrstva | Lokální MVP | Produkce |
|---|---|---|
| Trigger | Timer poll `data/input/` | Blob trigger / Power Automate webhook na SharePoint |
| Storage | lokální FS (`data/`) | SharePoint Document Library / OneDrive (Graph API) |
| OCR | pdf-parse + mock fixtures | Azure Document Intelligence |
| DB | SQLite (1 soubor) | Azure SQL |
| Rule/Company data | `rules.json` / `companies.json` | DB + UI editace |
| UI | Vite dev server (proxy `/api`) | statický build za API (Static Web App / SharePoint embed) |

Vyměňuje se jen trigger + storage adapter + OCR impl + hosting UI. Pipeline a business logika
zůstávají. Klíčové typy (`ExtractedValue<T>`, oddělení raw/normalized/approved) jsou load-bearing
a nesmí se ořezat (§18).

## Moduly (apps/api/src)

- `pipeline/InvoicePipeline.ts` — orchestrátor (jediné místo orchestrace)
- `services/` — `OcrService` (+ TextPdf/Mock extractors), `RuleMatchingService`,
  `ValidationService`, `ClassificationService`, `InvoiceActionsService` (approve/move),
  `CompanyRegistry`, `ControlExcelExportService`, `PohodaXmlExportService`, `ArchiveService`,
  `AuditLogService`
- `repositories/` — `InvoiceRepository`, `BatchRepository` (Prisma)
- `functions/` — HTTP/timer triggery (tenké wrappery)
- `types/` — `ExtractedValue`, `ExtractedInvoiceData`, enums

Frontend (`apps/web`) je standalone Vite + React SPA volající API — viz [`../apps/web/README.md`](../apps/web/README.md).
