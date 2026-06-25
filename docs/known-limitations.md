# Známá omezení (MVP)

Tohle je **týdenní demo MVP**, ne produkční systém. Cíl byl ukázat bezpečný end-to-end průchod
faktury, ne pokrýt všechny případy. Co MVP **záměrně** neřeší:

## Bezpečnost / provoz
- **Žádná autentizace.** API je `authLevel: 'anonymous'`, běží jen lokálně. Produkčně musí být
  za SSO (Azure AD) a API zabezpečené. `actor` u akcí je teď volný string (default `demo-user`).
- **Produkční faktury neposílat do veřejných LLM** bez schválení (§14). Testovací faktury A/B/C
  jsou anonymizované.
- **Žádné rate-limiting / validace velikosti uploadu** kromě prázdného souboru.

## Data jsou mock
- **`rules.json`** je mock rule engine; matchuje jen na `supplierIco` (vytěžené IČO dodavatele).
  `ourCompanyIco` se nevytěžuje, takže je v pravidle jen jako volitelný scope — produkčně klíčovat
  na `ourCompanyIco + supplierIco` (stejný dodavatel se účtuje různě pro různé firmy skupiny).
- **`companies.json`** je mock registr našich účetních jednotek (jméno → IČO). IČO jsou smyšlená
  pro anonymizované fixtures. Produkčně z DB / číselníku firem.
- **Předkontace / členění DPH v pravidle jsou ilustrativní**, ne ověřené z historických exportů.

## OCR / extrakce
- **pdf-parse + mock fixtures** jen pro textová PDF a připravené scany. Produkčně Azure Document
  Intelligence (za `OcrService`, swap bez dotčení pipeline).
- Regexová extrakce polí je laděná na typické české faktury — nerobustní vůči netypickým layoutům.
- **Cizí měna: kurz se nevytěžuje** (§10 roční/denní ČNB kurz). Pro foreign fakturu chybí
  `typ:rate` hodnota — nutno doplnit ručně.

## Pohoda XML export (§9 dodrženo, ale skeleton)
- **EU reverse-charge** (např. Meta): `partnerIdentity` emituje jen `typ:company` + `typ:ico`,
  chybí `typ:dic` dodavatele (potřeba pro VIES / souhrnné hlášení). Žádný fixture EU případ
  reálně nevyrábí, takže neověřeno end-to-end.
- Jedna souhrnná položka na fakturu (ne rozpad na řádky). Sazby: ošetřena základní (priceHigh) a
  nulová (priceNone); snížené sazby (priceLow) jsou strukturně snadné, ale neimplementované.
- **Pořadí elementů** v hlavičce nebylo ověřeno proti `invoice.xsd` sekvenci.
- Export je **náhled (preview)** — nemutuje stav. Žádný „commit“ krok, který by faktury překlopil
  na EXPORTOVANO, ani odeslání do Pohoda mServeru.

## Archivace
- **`ArchiveService` není napojený na žádný endpoint** — je to služba + test. Pro demo se volá
  ručně. Produkčně cíl = SharePoint Document Library / OneDrive přes Microsoft Graph (ne lokální FS).

## UI (vynecháno z Den 5 backlogu)
- **PDF náhled** v UI (bundling problémy / mimo scope).
- **Editace polí v UI** + `override-field` endpoint (`reason` povinný) — endpoint není hotový.
- **History/audit panel** v UI (audit se zapisuje do DB, jen se nezobrazuje).
- UI nemá produkční hosting — pivot ze SPFx na standalone Vite SPA; produkčně build za API
  (Static Web App / embed v SharePointu), rozhodnutí o hostingu odloženo.

## Ostatní (backlog z §15)
- Přímé Pohoda mServer / Intranet API, Azure SQL, plná DB dodavatelů, kompletní DPH pravidla a
  předkontace, soft-duplicity (objednávka+faktura), pokročilé anomálie, dashboardy, bank report,
  full state-machine guardy.
