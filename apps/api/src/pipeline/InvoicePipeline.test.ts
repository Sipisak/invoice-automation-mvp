import { test, before, after, beforeEach } from 'node:test';
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

// Each test starts from an empty DB — Day 4 dedup/hash logic queries prior rows, so leftover
// records from other tests would cross-contaminate (false hash/hard duplicates).
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

async function run(fileName: string, buffer: Buffer) {
  const batch = await BatchRepository.create('upload');
  return InvoicePipeline.run({ fileName, filePath: 'n/a', buffer }, batch.id);
}

function sample(fileName: string): Buffer {
  return readFileSync(path.join(SAMPLES, fileName));
}

async function actions(invoiceId: string): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({
    where: { invoiceId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => r.action);
}

// ── Day 4 classification: the three demo scenarios (CLAUDE.md §12/§16) ──

test('faktura-A: complete + rule -> K_ODSOUHLASENI, CLASSIFIED, routes Pohoda+Intranet', async () => {
  const inv = await run('faktura-A.pdf', sample('faktura-A.pdf'));

  assert.equal(inv.businessStatus, 'K_ODSOUHLASENI');
  assert.equal(inv.technicalStatus, 'CLASSIFIED');
  assert.equal(inv.ruleMatched, true);
  assert.equal(inv.ruleId, 'rule-kovo-novak');
  assert.equal(inv.routingToPohoda, true);
  assert.equal(inv.routingToIntranet, true);
  assert.equal(inv.isHardDuplicate, false);

  // born NEPRECTENO_NEUPLNE -> K_ODSOUHLASENI is a real transition, so it gets its own row.
  const biz = await prisma.auditLog.findFirst({ where: { invoiceId: inv.id, after: 'K_ODSOUHLASENI' } });
  assert.ok(biz, 'business STATUS_CHANGED to K_ODSOUHLASENI is audited');
});

test('faktura-B: readable but no rule -> DOPLNIT_PRAVIDLO, ruleMatched false', async () => {
  const inv = await run('faktura-B.pdf', sample('faktura-B.pdf'));

  assert.equal(inv.businessStatus, 'DOPLNIT_PRAVIDLO');
  assert.equal(inv.technicalStatus, 'CLASSIFIED');
  assert.equal(inv.ruleMatched, false);
  assert.equal(inv.ruleId, null);
  assert.equal(inv.routingToPohoda, true); // readable normal faktura -> will route once a rule is added
});

test('faktura-C-scan: incomplete + low confidence -> NEPRECTENO_NEUPLNE, no fabricated biz transition', async () => {
  const inv = await run('faktura-C-scan.pdf', sample('faktura-C-scan.pdf'));

  assert.equal(inv.businessStatus, 'NEPRECTENO_NEUPLNE');
  assert.equal(inv.technicalStatus, 'CLASSIFIED');
  assert.equal(inv.routingToPohoda, false);
  assert.equal(inv.routingToIntranet, false);
  const missing = JSON.parse(inv.missingFields ?? '[]') as string[];
  assert.ok(missing.includes('totalAmount'), 'unreadable amount reported as missing');

  // born NEPRECTENO_NEUPLNE and classified NEPRECTENO_NEUPLNE -> no business row (§18 truthfulness).
  // Only CREATED, the EXTRACTED transition, and the technical CLASSIFIED transition.
  assert.deepEqual(await actions(inv.id), ['CREATED', 'STATUS_CHANGED', 'STATUS_CHANGED']);
  const toBiz = await prisma.auditLog.findFirst({
    where: { invoiceId: inv.id, before: 'NEPRECTENO_NEUPLNE', after: 'NEPRECTENO_NEUPLNE' },
  });
  assert.equal(toBiz, null, 'no NEPRECTENO->NEPRECTENO no-op transition');
});

// ── duplicates ──

test('hash-dup: same bytes twice -> second born DUPLICITA, CREATED only (no transition)', async () => {
  const buffer = sample('faktura-B.pdf');
  const first = await run('faktura-B.pdf', buffer);
  const second = await run('faktura-B.pdf', buffer);

  assert.notEqual(first.id, second.id);
  assert.equal(second.businessStatus, 'DUPLICITA');
  assert.deepEqual(await actions(second.id), ['CREATED']); // born DUPLICITA, never transitioned
});

test('hard-dup: same invoice data, different bytes -> second is hard duplicate (§8 post-extraction)', async () => {
  const original = sample('faktura-A.pdf');
  // Different bytes, identical text layer: bytes appended after %%EOF are ignored by PDF
  // readers, so the hash differs (not a hash-dup) but extraction yields the same data.
  const variant = Buffer.concat([original, Buffer.from('\n% hard-dup variant\n')]);

  const first = await run('faktura-A.pdf', original);
  const second = await run('faktura-A-copy.pdf', variant);

  assert.notEqual(first.fileHash, second.fileHash, 'different bytes -> not a hash duplicate');
  assert.equal(first.isHardDuplicate, false);
  assert.equal(second.isHardDuplicate, true);
  assert.equal(second.businessStatus, 'DUPLICITA');
});

// ── failure path (unchanged) ──

test('OCR failure -> FAILED, record stays visible, STATUS_CHANGED carries reason', async () => {
  const inv = await run('broken.pdf', Buffer.from('NOT A PDF — pipeline FAILED-path test'));

  assert.equal(inv.technicalStatus, 'FAILED');
  const stillThere = await prisma.invoice.findUnique({ where: { id: inv.id } });
  assert.ok(stillThere, 'FAILED record is not dropped (§12)');
  const sc = await prisma.auditLog.findFirst({ where: { invoiceId: inv.id, action: 'STATUS_CHANGED' } });
  assert.equal(sc?.after, 'FAILED');
  assert.match(sc?.reason ?? '', /ocr failed/);
});
