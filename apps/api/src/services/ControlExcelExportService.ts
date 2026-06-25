import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { InvoiceRepository } from '../repositories/InvoiceRepository';
import { parseExtracted, type ExtractedInvoiceData } from '../types/invoice';
import { DATA } from '../utils/paths';
import { logger } from '../utils/logger';

// Control workbook (§6/§12): one sheet per "needs a human" bucket so an accountant can scan
// what's ready, what lacks a rule, and what couldn't be read — before anything is imported.
const SHEETS: { status: string; title: string }[] = [
  { status: 'K_ODSOUHLASENI', title: 'K_odsouhlaseni' },
  { status: 'DOPLNIT_PRAVIDLO', title: 'Doplnit_pravidlo' },
  { status: 'NEPRECTENO_NEUPLNE', title: 'Neprecteno_neuplne' },
];

function val<T>(v: { normalizedValue: T | null } | undefined): T | string {
  return v?.normalizedValue ?? '';
}

function noteFor(status: string, missingJson: string | null, warnJson: string | null): string {
  const parts: string[] = [];
  const missing = safeArr(missingJson);
  const warn = safeArr(warnJson);
  if (missing.length) parts.push(`chybí: ${missing.join(', ')}`);
  if (warn.length) parts.push(warn.join(' · '));
  return parts.join(' | ');
}

function safeArr(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

export interface ExcelExportResult {
  filePath: string;
  counts: Record<string, number>;
}

export const ControlExcelExportService = {
  // Build the workbook and write it to data/output/. Returns the path + per-sheet counts.
  async generate(): Promise<ExcelExportResult> {
    const all = await InvoiceRepository.list();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'CFIG Invoice Automation';
    const counts: Record<string, number> = {};

    for (const { status, title } of SHEETS) {
      const ws = wb.addWorksheet(title);
      ws.columns = [
        { header: 'Dodavatel', key: 'supplier', width: 28 },
        { header: 'IČO', key: 'ico', width: 12 },
        { header: 'Číslo faktury', key: 'number', width: 16 },
        { header: 'VS', key: 'vs', width: 12 },
        { header: 'Datum', key: 'date', width: 12 },
        { header: 'Částka', key: 'amount', width: 12 },
        { header: 'Měna', key: 'currency', width: 8 },
        { header: 'Pozn. (chybí / upozornění)', key: 'note', width: 40 },
      ];
      ws.getRow(1).font = { bold: true };

      const rows = all.filter((i) => i.businessStatus === status);
      counts[status] = rows.length;
      for (const inv of rows) {
        const d: ExtractedInvoiceData = parseExtracted(inv.extractedData);
        ws.addRow({
          supplier: val(d.supplier),
          ico: val(d.supplierIco),
          number: val(d.invoiceNumber),
          vs: val(d.variableSymbol),
          date: val(d.issueDate),
          amount: val(d.totalAmount),
          currency: val(d.currency),
          note: noteFor(status, inv.missingFields, inv.warnings),
        });
      }
    }

    await mkdir(DATA.output, { recursive: true });
    const filePath = path.join(DATA.output, `kontrola-${new Date().toISOString().slice(0, 10)}.xlsx`);
    await wb.xlsx.writeFile(filePath);
    logger.info(`excel export: ${filePath} (${JSON.stringify(counts)})`);
    return { filePath, counts };
  },
};
