import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

// Load-bearing behaviors per §18: audit on every state change, conservative born-status,
// FAILED record stays visible. These touch Prisma, so run on a throwaway DB (absolute path
// so CLI migrate and runtime client agree) — keeps `pnpm test` non-destructive vs dev.db.
const TEST_DB = path.join(process.cwd(), 'prisma', 'test-pipeline.db');
process.env.DATABASE_URL = `file:${TEST_DB}`; // set BEFORE any import that builds PrismaClient

const SAMPLES = path.join(process.cwd(), 'data', 'input-samples');

let InvoicePipeline: typeof import('../pipeline/InvoicePipeline.js').InvoicePipeline;
let BatchRepository: typeof import('../repositories/BatchRepository.js').BatchRepository;
let prisma: typeof import('../lib/prisma.js').prisma;

before(async () => {
  rmSync(TEST_DB, { force: true });
  rmSync(`${TEST_DB}-journal`, { force: true });
  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'ignore' });
  // dynamic import AFTER DATABASE_URL is set so the client binds to the test DB
  ({ InvoicePipeline } = await import('../pipeline/InvoicePipeline.js'));
  ({ BatchRepository } = await import('../repositories/BatchRepository.js'));
  ({ prisma } = await import('../lib/prisma.js'));
});

after(async () => {
  if (prisma) await prisma.$disconnect();
  rmSync(TEST_DB, { force: true });
  rmSync(`${TEST_DB}-journal`, { force: true });
});

async function actions(invoiceId: string): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({
    where: { invoiceId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => r.action);
}

test('non-duplicate -> EXTRACTED, audit = CREATED then STATUS_CHANGED', async () => {
  const batch = await BatchRepository.create('upload');
  const buffer = readFileSync(path.join(SAMPLES, 'faktura-A.pdf'));
  const inv = await InvoicePipeline.run({ fileName: 'faktura-A.pdf', filePath: 'n/a', buffer }, batch.id);

  assert.equal(inv.technicalStatus, 'EXTRACTED');
  assert.deepEqual(await actions(inv.id), ['CREATED', 'STATUS_CHANGED']);
  const sc = await prisma.auditLog.findFirst({ where: { invoiceId: inv.id, action: 'STATUS_CHANGED' } });
  assert.equal(sc?.before, 'PROCESSING');
  assert.equal(sc?.after, 'EXTRACTED');
});

test('OCR failure -> FAILED, record stays visible, STATUS_CHANGED carries reason', async () => {
  const batch = await BatchRepository.create('upload');
  const buffer = Buffer.from('NOT A PDF — pipeline FAILED-path test'); // no fixture -> pdf-parse throws
  const inv = await InvoicePipeline.run({ fileName: 'broken.pdf', filePath: 'n/a', buffer }, batch.id);

  assert.equal(inv.technicalStatus, 'FAILED');
  const stillThere = await prisma.invoice.findUnique({ where: { id: inv.id } });
  assert.ok(stillThere, 'FAILED record is not dropped (§12)');
  const sc = await prisma.auditLog.findFirst({ where: { invoiceId: inv.id, action: 'STATUS_CHANGED' } });
  assert.equal(sc?.after, 'FAILED');
  assert.match(sc?.reason ?? '', /ocr failed/);
});

test('same bytes twice -> second born DUPLICITA, CREATED only (no fabricated transition)', async () => {
  const buffer = readFileSync(path.join(SAMPLES, 'faktura-B.pdf'));
  const first = await InvoicePipeline.run(
    { fileName: 'faktura-B.pdf', filePath: 'n/a', buffer },
    (await BatchRepository.create('upload')).id,
  );
  const second = await InvoicePipeline.run(
    { fileName: 'faktura-B.pdf', filePath: 'n/a', buffer },
    (await BatchRepository.create('upload')).id,
  );

  assert.notEqual(first.id, second.id);
  assert.equal(second.businessStatus, 'DUPLICITA');
  // born DUPLICITA — it never transitioned, so NO STATUS_CHANGED (audit truthfulness, §18)
  assert.deepEqual(await actions(second.id), ['CREATED']);
});
