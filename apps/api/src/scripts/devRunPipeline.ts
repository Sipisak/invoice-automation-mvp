/**
 * Dev-only end-to-end check for the pipeline (§12 Day 3 "test: faktura A skrz pipeline").
 * Runs sample invoices straight through InvoicePipeline.run — no func/timer/azurite — and
 * prints the resulting record, its extracted fields and audit trail.
 *
 *   pnpm run dev:pipeline            # all samples
 *   pnpm run dev:pipeline faktura-A  # one
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../lib/prisma';
import { BatchRepository } from '../repositories/BatchRepository';
import { InvoiceRepository } from '../repositories/InvoiceRepository';
import { InvoicePipeline } from '../pipeline/InvoicePipeline';
import { parseExtracted } from '../types/invoice';
import { DATA } from '../utils/paths';

const SAMPLES = path.join(DATA.root, 'input-samples');
const DEFAULT = ['faktura-A.pdf', 'faktura-B.pdf', 'faktura-C-scan.pdf'];

async function runOne(fileName: string) {
  const filePath = path.join(SAMPLES, fileName);
  const buffer = await readFile(filePath);

  const batch = await BatchRepository.create('upload');
  const created = await InvoicePipeline.run({ fileName, filePath, buffer }, batch.id);

  const invoice = await InvoiceRepository.findById(created.id);
  const audits = await prisma.auditLog.findMany({
    where: { invoiceId: created.id },
    orderBy: { createdAt: 'asc' },
  });
  const data = parseExtracted(invoice?.extractedData ?? null);

  console.log(`\n===== ${fileName} =====`);
  console.log(`id              ${invoice?.id}`);
  console.log(`documentType    ${invoice?.documentType}`);
  console.log(`technicalStatus ${invoice?.technicalStatus}`);
  console.log(`businessStatus  ${invoice?.businessStatus}`);
  console.log('extracted fields:');
  for (const [k, v] of Object.entries(data)) {
    console.log(`  ${k.padEnd(15)} raw=${JSON.stringify(v?.rawValue)} norm=${JSON.stringify(v?.normalizedValue)} conf=${v?.confidence}`);
  }
  console.log('audit:');
  for (const a of audits) {
    console.log(`  ${a.action} ${a.before ?? ''}->${a.after ?? ''} ${a.reason ? `(${a.reason})` : ''}`);
  }
}

async function main() {
  const arg = process.argv[2];
  const files = arg ? [arg.endsWith('.pdf') ? arg : `${arg}.pdf`] : DEFAULT;
  for (const f of files) await runOne(f);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
