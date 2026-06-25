import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { rmSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';

const TEST_DB = path.join(process.cwd(), 'prisma', 'test-exports.db');
process.env.DATABASE_URL = `file:${TEST_DB}`; // BEFORE any import that builds PrismaClient

let PohodaXmlExportService: typeof import('./PohodaXmlExportService.js').PohodaXmlExportService;
let ControlExcelExportService: typeof import('./ControlExcelExportService.js').ControlExcelExportService;
let ArchiveService: typeof import('./ArchiveService.js').ArchiveService;
let InvoiceRepository: typeof import('../repositories/InvoiceRepository.js').InvoiceRepository;
let BatchRepository: typeof import('../repositories/BatchRepository.js').BatchRepository;
let prisma: typeof import('../lib/prisma.js').prisma;

before(async () => {
  rmSync(TEST_DB, { force: true });
  rmSync(`${TEST_DB}-journal`, { force: true });
  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'ignore' });
  ({ PohodaXmlExportService } = await import('./PohodaXmlExportService.js'));
  ({ ControlExcelExportService } = await import('./ControlExcelExportService.js'));
  ({ ArchiveService } = await import('./ArchiveService.js'));
  ({ InvoiceRepository } = await import('../repositories/InvoiceRepository.js'));
  ({ BatchRepository } = await import('../repositories/BatchRepository.js'));
  ({ prisma } = await import('../lib/prisma.js'));
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.batch.deleteMany();
});

after(async () => {
  if (prisma) await prisma.$disconnect();
  rmSync(TEST_DB, { force: true });
  rmSync(`${TEST_DB}-journal`, { force: true });
});

function ev<T>(normalizedValue: T) {
  return { rawValue: String(normalizedValue), normalizedValue, confidence: 0.9 };
}

let seq = 0;
async function makeInvoice(opts: {
  businessStatus: string;
  routingToPohoda?: boolean;
  ruleId?: string | null;
  ourCompany?: string;
  supplier?: string;
  missingFields?: string[];
}) {
  const batch = await BatchRepository.create('upload');
  const inv = await InvoiceRepository.create({
    batchId: batch.id,
    fileName: `inv-${seq}.pdf`,
    filePath: 'n/a',
    fileHash: `h-${seq++}`,
    businessStatus: opts.businessStatus as never,
    technicalStatus: 'CLASSIFIED',
  });
  return InvoiceRepository.update(inv.id, {
    routingToPohoda: opts.routingToPohoda ?? false,
    ruleId: opts.ruleId ?? null,
    ruleMatched: !!opts.ruleId,
    missingFields: opts.missingFields ?? null,
    extractedData: {
      ourCompany: ev(opts.ourCompany ?? 'Montáže Dvořák a.s.'),
      supplier: ev(opts.supplier ?? 'Kovo Novák s.r.o.'),
      supplierIco: ev('25896314'),
      invoiceNumber: ev('2024010'),
      variableSymbol: ev('2024010'),
      issueDate: ev('2024-03-15'),
      totalAmount: ev(24200),
      currency: ev('CZK'),
    },
  });
}

test('Pohoda generate: one dataPack per accounting unit for SCHVALENO + routingToPohoda', async () => {
  await makeInvoice({ businessStatus: 'SCHVALENO', routingToPohoda: true, ruleId: 'rule-kovo-novak' });
  await makeInvoice({ businessStatus: 'K_ODSOUHLASENI', routingToPohoda: true, ruleId: 'rule-kovo-novak' }); // not approved -> excluded

  const { exports, warnings } = await PohodaXmlExportService.generate();
  assert.equal(exports.length, 1, 'only the SCHVALENO invoice is exported');
  assert.equal(exports[0].ico, '27654321');
  assert.equal(exports[0].count, 1);
  assert.match(exports[0].xml, /<inv:originalDocument>2024010<\/inv:originalDocument>/);
  assert.deepEqual(warnings, []);
});

test('Pohoda generate: unknown company -> skipped + warning, NOT a dataPack with empty ico (§0)', async () => {
  await makeInvoice({
    businessStatus: 'SCHVALENO',
    routingToPohoda: true,
    ruleId: 'rule-kovo-novak',
    ourCompany: 'Neznámá Firma s.r.o.',
  });
  const { exports, warnings } = await PohodaXmlExportService.generate();
  assert.equal(exports.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Neznámá Firma/);
});

test('Control Excel: 3 sheets with the right per-status row counts', async () => {
  await makeInvoice({ businessStatus: 'K_ODSOUHLASENI', ruleId: 'rule-kovo-novak' });
  await makeInvoice({ businessStatus: 'DOPLNIT_PRAVIDLO' });
  await makeInvoice({ businessStatus: 'DOPLNIT_PRAVIDLO' });
  await makeInvoice({ businessStatus: 'NEPRECTENO_NEUPLNE', missingFields: ['totalAmount'] });

  const { filePath, counts } = await ControlExcelExportService.generate();
  assert.deepEqual(counts, { K_ODSOUHLASENI: 1, DOPLNIT_PRAVIDLO: 2, NEPRECTENO_NEUPLNE: 1 });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['K_odsouhlaseni', 'Doplnit_pravidlo', 'Neprecteno_neuplne']);
  // header row + 2 data rows on the DOPLNIT sheet
  assert.equal(wb.getWorksheet('Doplnit_pravidlo')!.rowCount, 3);
  rmSync(filePath, { force: true });
});

test('Archive: file is renamed + moved into archive/{company}/{year}/{month}/', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'arch-'));
  const src = path.join(tmp, 'upload.pdf');
  writeFileSync(src, '%PDF-1.4 dummy');

  const dest = await ArchiveService.archive({
    filePath: src,
    ourCompany: 'Montáže Dvořák a.s.',
    supplier: 'Kovo Novák s.r.o.',
    invoiceNumber: '2024010',
    issueDate: '2024-03-15',
  });

  assert.match(dest, /archive\/montaze-dvorak-a-s\/2024\/03\/kovo-novak-s-r-o_2024010_2024-03-15\.pdf$/);
  assert.ok(existsSync(dest), 'archived file exists at the new path');
  assert.ok(!existsSync(src), 'source file was moved, not copied');
  rmSync(dest, { force: true });
  rmSync(tmp, { recursive: true, force: true });
});
