import { create } from 'xmlbuilder2';
import type { XMLBuilder } from 'xmlbuilder2/lib/interfaces';
import { InvoiceRepository } from '../repositories/InvoiceRepository';
import { RuleMatchingService } from './RuleMatchingService';
import { CompanyRegistry } from './CompanyRegistry';
import { parseExtracted } from '../types/invoice';
import { logger } from '../utils/logger';

// Pohoda data-package namespaces (Stormware schema v2).
const NS = {
  dat: 'http://www.stormware.cz/schema/version_2/data.xsd',
  inv: 'http://www.stormware.cz/schema/version_2/invoice.xsd',
  typ: 'http://www.stormware.cz/schema/version_2/type.xsd',
};

// Normalized, export-ready invoice. Built from extracted data + the resolved rule. This is the
// pure builder's input, so the §9-critical branches (none-rate, foreign currency) are unit-
// testable WITHOUT a PDF.
export interface PohodaItem {
  supplier: string;
  supplierIco?: string;
  invoiceNumber: string; // -> inv:originalDocument (NEVER inv:number / inv:originalDocumentNumber)
  variableSymbol?: string;
  issueDate?: string; // ISO yyyy-mm-dd
  taxDate?: string;
  dueDate?: string;
  currency: string; // 'CZK' -> homeCurrency; anything else -> foreignCurrency
  totalAmount: number; // GROSS (incl. VAT)
  rate?: number; // foreign exchange rate (CZK per unit); required for foreign currency
  vatRate: string; // 'none' (reverse charge / zero) | '21' | '12' ...
  accountingPredefinition: string; // předkontace
  vatClassification: string; // členění DPH
}

function fmt(n: number): string {
  return n.toFixed(2);
}

// Emit the VAT-split price elements into a currency wrapper (typ: namespace — §9). §9: a zero/
// none rate goes to typ:priceNone and NEVER into priceHigh*. For a real rate the GROSS must NOT
// land in priceHigh (that's the base) — derive base + VAT so Pohoda doesn't re-tax on import.
function appendPrices(wrapper: XMLBuilder, item: PohodaItem): void {
  if (item.vatRate === 'none' || item.vatRate === '0') {
    wrapper.ele('typ:priceNone').txt(fmt(item.totalAmount));
    return;
  }
  const rate = Number(item.vatRate);
  const base = Math.round((item.totalAmount / (1 + rate / 100)) * 100) / 100;
  const vat = Math.round((item.totalAmount - base) * 100) / 100;
  wrapper.ele('typ:priceHigh').txt(fmt(base));
  wrapper.ele('typ:priceHighVAT').txt(fmt(vat));
  wrapper.ele('typ:priceHighSum').txt(fmt(item.totalAmount));
}

// CZK -> inv:homeCurrency; foreign -> inv:foreignCurrency with typ:currency/rate/amount (§9).
// Used in BOTH the item and the summary — never in the header.
function appendCurrency(parent: XMLBuilder, item: PohodaItem): void {
  if (item.currency === 'CZK') {
    appendPrices(parent.ele('inv:homeCurrency'), item);
    return;
  }
  const fc = parent.ele('inv:foreignCurrency');
  fc.ele('typ:currency').ele('typ:ids').txt(item.currency);
  if (item.rate != null) {
    fc.ele('typ:rate').txt(fmt(item.rate));
    fc.ele('typ:amount').txt('1');
  }
  appendPrices(fc, item);
}

/**
 * Build ONE Pohoda dataPack for a single accounting unit (§9: each company = its own XML, root
 * ico = that unit's IČO). Pure — no DB. The §9 rules are enforced structurally here:
 *  - inv:originalDocument carries the supplier doc number (NOT inv:number / originalDocumentNumber)
 *  - all amount/currency elements are in the typ: namespace
 *  - none-rate -> typ:priceNone; real rate -> base/VAT/gross split
 *  - foreign currency lives in item + summary, never the header
 */
export function buildDataPack(company: { name: string; ico: string }, items: PohodaItem[]): string {
  const root = create({ version: '1.0', encoding: 'Windows-1250' }).ele('dat:dataPack', {
    'xmlns:dat': NS.dat,
    'xmlns:inv': NS.inv,
    'xmlns:typ': NS.typ,
    version: '2.0',
    id: `cfig-${company.ico}`,
    ico: company.ico,
    application: 'CFIG Invoice Automation',
    note: `přijaté faktury — ${company.name}`,
  });

  items.forEach((item, i) => {
    const invoice = root
      .ele('dat:dataPackItem', { version: '2.0', id: `item-${i + 1}` })
      .ele('inv:invoice', { version: '2.0' });

    // Header — note: NO inv:number, NO inv:originalDocumentNumber, NO foreignCurrency here (§9).
    const header = invoice.ele('inv:invoiceHeader');
    header.ele('inv:invoiceType').txt('receivedInvoice');
    if (item.variableSymbol) header.ele('inv:symVar').txt(item.variableSymbol);
    header.ele('inv:originalDocument').txt(item.invoiceNumber);
    if (item.issueDate) header.ele('inv:date').txt(item.issueDate);
    if (item.taxDate) header.ele('inv:dateTax').txt(item.taxDate);
    if (item.dueDate) header.ele('inv:dateDue').txt(item.dueDate);
    header.ele('inv:accounting').ele('typ:ids').txt(item.accountingPredefinition);
    header.ele('inv:classificationVAT').ele('typ:ids').txt(item.vatClassification);
    const addr = header.ele('inv:partnerIdentity').ele('typ:address');
    addr.ele('typ:company').txt(item.supplier);
    if (item.supplierIco) addr.ele('typ:ico').txt(item.supplierIco);

    // Detail — one summary line; currency block carries the typ: prices (§9).
    const line = invoice.ele('inv:invoiceDetail').ele('inv:invoiceItem');
    line.ele('inv:text').txt(`Přijatá faktura ${item.invoiceNumber}`);
    appendCurrency(line, item);

    // Summary — totals, same currency block.
    appendCurrency(invoice.ele('inv:invoiceSummary'), item);
  });

  return root.end({ prettyPrint: true });
}

export interface CompanyExport {
  company: string;
  ico: string;
  count: number;
  xml: string;
}

export interface PohodaExportResult {
  exports: CompanyExport[];
  warnings: string[];
}

// Map a DB invoice (+ its rule) to a PohodaItem. Returns null when the rule can't be resolved
// (export-eligible invoices are SCHVALENO, which required a matched rule — but stay defensive).
function toItem(extractedJson: string | null, ruleId: string | null): PohodaItem | null {
  const rule = RuleMatchingService.byId(ruleId);
  const d = parseExtracted(extractedJson);
  const invoiceNumber = d.invoiceNumber?.normalizedValue;
  const amount = d.totalAmount?.normalizedValue;
  if (!rule || !invoiceNumber || amount == null) return null;
  return {
    supplier: d.supplier?.normalizedValue ?? '',
    supplierIco: d.supplierIco?.normalizedValue ?? undefined,
    invoiceNumber,
    variableSymbol: d.variableSymbol?.normalizedValue ?? undefined,
    issueDate: d.issueDate?.normalizedValue ?? undefined,
    taxDate: d.taxDate?.normalizedValue ?? undefined,
    dueDate: d.dueDate?.normalizedValue ?? undefined,
    currency: d.currency?.normalizedValue ?? 'CZK',
    totalAmount: amount,
    vatRate: rule.vatRate ?? 'none',
    accountingPredefinition: rule.accountingPredefinition,
    vatClassification: rule.vatClassification,
  };
}

export const PohodaXmlExportService = {
  /**
   * Generate one dataPack per accounting unit for the export-eligible invoices
   * (SCHVALENO + routingToPohoda, §0/§11). Preview only — does NOT mutate state. A company
   * whose name doesn't resolve to a known IČO is SKIPPED with a warning (§0: never emit a
   * dataPack with a guessed ico).
   */
  async generate(): Promise<PohodaExportResult> {
    const all = await InvoiceRepository.list();
    const eligible = all.filter((i) => i.businessStatus === 'SCHVALENO' && i.routingToPohoda);

    // group by ourCompany name
    const byCompany = new Map<string, typeof eligible>();
    const warnings: string[] = [];
    for (const inv of eligible) {
      const name = parseExtracted(inv.extractedData).ourCompany?.normalizedValue ?? '';
      const list = byCompany.get(name) ?? [];
      list.push(inv);
      byCompany.set(name, list);
    }

    const exports: CompanyExport[] = [];
    for (const [name, invoices] of byCompany) {
      const company = CompanyRegistry.byName(name);
      if (!company) {
        warnings.push(`firma "${name || '(neznámá)'}" není v companies.json — ${invoices.length} faktur přeskočeno (chybí IČO účetní jednotky)`);
        continue;
      }
      const items = invoices.map((i) => toItem(i.extractedData, i.ruleId)).filter((x): x is PohodaItem => x !== null);
      if (items.length === 0) continue;
      exports.push({
        company: company.name,
        ico: company.ico,
        count: items.length,
        xml: buildDataPack(company, items),
      });
    }

    logger.info(`pohoda export: ${exports.length} dataPack(s), ${warnings.length} warning(s)`);
    return { exports, warnings };
  },
};
