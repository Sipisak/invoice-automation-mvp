# Demo script

Cíl sdělení: **systém nic neúčtuje sám. Přitáhne, vytěží, zařadí, počká na člověka.**
Kontrolovaný auditovatelný asistent, ne černá skříňka.

## Příprava (čistý start)

```bash
# 1. storage
azurite --silent --location /tmp/azurite-cfig

# 2. reset DB na prázdno (volitelné, pro čisté demo)
cd apps/api
#   func musí být zastavený: lsof -ti tcp:7071 | xargs kill -9
rm -f prisma/dev.db prisma/dev.db-journal && npx prisma migrate deploy

# 3. backend + UI
pnpm api:dev                                   # terminál 2
cd apps/web && pnpm dev                        # terminál 3
```

Otevři <http://localhost:4321> — prázdný seznam.

> Pozn.: testovací faktury jsou v `apps/api/data/input-samples/` (A = má pravidlo,
> B = nemá pravidlo, C = nečitelný scan). Do `data/input/` se kopírují, odtud je timer sebere.

## Scénář

1. **Prázdné UI.** Seznam je prázdný.
2. **Přetáhni fakturu A** do `apps/api/data/input/` (nebo tlačítko *Nahrát fakturu* v UI).
   Za ~5 s (timer) se sama objeví jako **K_ODSOUHLASENI** — čitelná, kompletní, má účetní pravidlo.
   > Pozn.: timer drainuje `input/` à 5 s a soubor přesune do `processed/` ještě před zpracováním,
   > takže se nereprocesuje (žádné duplicity). Po **studeném** `func start` může první tick přijít
   > až ~1 min po náběhu hostu — pak už spolehlivě à 5 s. Kdo nechce čekat, použije *Nahrát fakturu*.
3. **Přetáhni B a C** (jedna dávka).
   - **B → DOPLNIT_PRAVIDLO** — přečtená, ale dodavatel nemá pravidlo.
   - **C → NEPRECTENO_NEUPLNE** — scan, nízká confidence, chybí částka/datum.
4. **Detail B**: údaje přečtené, routing OK, jen chybí pravidlo (≠ nepřečteno).
5. **Detail C**: červené „Chybí“ (ourCompany, supplier, issueDate, totalAmount) + nízké confidence bary.
6. **Schválím A** (tlačítko *Schválit*) → **SCHVALENO**, zapíše se `approvedBy` + AuditLog.
   (Schválit jde jen K_ODSOUHLASENI — u B/C je tlačítko zakázané. To je ta konzervativnost.)
7. **Kontrolní Excel** → `POST /api/exports/control-excel` → 3 listy
   (K_odsouhlaseni / Doplnit_pravidlo / Neprecteno_neuplne) do `data/output/`.
8. **Pohoda XML náhled** → `POST /api/exports/pohoda-xml-preview` → 1 dataPack pro
   *Montáže Dvořák a.s.* (IČO 27654321) s fakturou A. Ukázat §9: `inv:originalDocument`,
   částky v `typ:` namespace, base/DPH/brutto split.
9. **Archivovaný soubor** → `data/archive/montaze-dvorak-a-s/2024/03/kovo-novak-s-r-o_2024010_2024-03-15.pdf`
   (přejmenovaný a uložený podle firmy/roku/měsíce).

## Rychlá verze přes curl (bez UI)

```bash
cd apps/api/data/input-samples
for f in faktura-A.pdf faktura-B.pdf faktura-C-scan.pdf; do
  curl -s -X POST http://localhost:7071/api/invoices/upload -F "file=@$f"; echo
done
curl -s http://localhost:7071/api/invoices            # zařazení A/B/C
AID=$(curl -s http://localhost:7071/api/invoices | python3 -c "import sys,json;print(next(x['id'] for x in json.load(sys.stdin) if x['fileName']=='faktura-A.pdf'))")
curl -s -X POST http://localhost:7071/api/invoices/$AID/approve -d '{"actor":"ucetni@cfig.cz"}' -H 'Content-Type: application/json'
curl -s -X POST http://localhost:7071/api/exports/control-excel
curl -s -X POST http://localhost:7071/api/exports/pohoda-xml-preview
```

Ověřeno end-to-end z čisté DB (Den 7).
