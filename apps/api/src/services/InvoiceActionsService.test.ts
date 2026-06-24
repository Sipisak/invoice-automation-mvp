import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';

// Touches Prisma -> throwaway DB (absolute path so CLI migrate and runtime client agree).
const TEST_DB = path.join(process.cwd(), 'prisma', 'test-actions.db');
process.env.DATABASE_URL = `file:${TEST_DB}`; // set BEFORE any import that builds PrismaClient

let InvoiceActionsService: typeof import('./InvoiceActionsService.js').InvoiceActionsService;
let ActionError: typeof import('./InvoiceActionsService.js').ActionError;
let InvoiceRepository: typeof import('../repositories/InvoiceRepository.js').InvoiceRepository;
let BatchRepository: typeof import('../repositories/BatchRepository.js').BatchRepository;
let prisma: typeof import('../lib/prisma.js').prisma;

before(async () => {
  rmSync(TEST_DB, { force: true });
  rmSync(`${TEST_DB}-journal`, { force: true });
  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'ignore' });
  ({ InvoiceActionsService, ActionError } = await import('./InvoiceActionsService.js'));
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

let seq = 0;
async function makeInvoice(businessStatus: string) {
  const batch = await BatchRepository.create('upload');
  return InvoiceRepository.create({
    batchId: batch.id,
    fileName: `inv-${seq}.pdf`,
    filePath: 'n/a',
    fileHash: `hash-${seq++}`, // unique so create never hits a constraint
    businessStatus: businessStatus as never,
    technicalStatus: 'CLASSIFIED',
  });
}

test('approve: K_ODSOUHLASENI -> SCHVALENO + APPROVED, approvedBy set, audit APPROVED', async () => {
  const inv = await makeInvoice('K_ODSOUHLASENI');
  const updated = await InvoiceActionsService.approve(inv.id, 'tester');

  assert.equal(updated.businessStatus, 'SCHVALENO');
  assert.equal(updated.technicalStatus, 'APPROVED');
  assert.equal(updated.approvedBy, 'tester');
  assert.ok(updated.approvedAt, 'approvedAt timestamp set');

  const audit = await prisma.auditLog.findFirst({ where: { invoiceId: inv.id, action: 'APPROVED' } });
  assert.equal(audit?.after, 'SCHVALENO');
  assert.equal(audit?.actor, 'tester');
});

test('approve: non-ready status is refused (§0 conservative) -> ActionError 409', async () => {
  const inv = await makeInvoice('DOPLNIT_PRAVIDLO');
  await assert.rejects(
    () => InvoiceActionsService.approve(inv.id, 'tester'),
    (err: unknown) => err instanceof ActionError && err.status === 409,
  );
  // unchanged + no audit row
  const after = await InvoiceRepository.findById(inv.id);
  assert.equal(after?.businessStatus, 'DOPLNIT_PRAVIDLO');
  assert.equal(await prisma.auditLog.count({ where: { invoiceId: inv.id } }), 0);
});

test('approve: missing invoice -> ActionError 404', async () => {
  await assert.rejects(
    () => InvoiceActionsService.approve('does-not-exist', 'tester'),
    (err: unknown) => err instanceof ActionError && err.status === 404,
  );
});

test('moveStatus: valid target -> businessStatus changed + STATUS_CHANGED audited with reason', async () => {
  const inv = await makeInvoice('NEPRECTENO_NEUPLNE');
  const updated = await InvoiceActionsService.moveStatus(inv.id, 'DOPLNIT_PRAVIDLO', { reason: 'doplněno ručně', actor: 'ucetni' });

  assert.equal(updated.businessStatus, 'DOPLNIT_PRAVIDLO');
  const audit = await prisma.auditLog.findFirst({ where: { invoiceId: inv.id, action: 'STATUS_CHANGED' } });
  assert.equal(audit?.before, 'NEPRECTENO_NEUPLNE');
  assert.equal(audit?.after, 'DOPLNIT_PRAVIDLO');
  assert.equal(audit?.reason, 'doplněno ručně');
  assert.equal(audit?.actor, 'ucetni');
});

test('moveStatus: invalid target -> ActionError 400, nothing changes', async () => {
  const inv = await makeInvoice('K_ODSOUHLASENI');
  await assert.rejects(
    () => InvoiceActionsService.moveStatus(inv.id, 'NONSENSE', {}),
    (err: unknown) => err instanceof ActionError && err.status === 400,
  );
  const after = await InvoiceRepository.findById(inv.id);
  assert.equal(after?.businessStatus, 'K_ODSOUHLASENI');
});

test('moveStatus: no-op move (same status) -> ActionError 400 (no fabricated transition, §18)', async () => {
  const inv = await makeInvoice('K_ODSOUHLASENI');
  await assert.rejects(
    () => InvoiceActionsService.moveStatus(inv.id, 'K_ODSOUHLASENI', {}),
    (err: unknown) => err instanceof ActionError && err.status === 400,
  );
  assert.equal(await prisma.auditLog.count({ where: { invoiceId: inv.id } }), 0);
});
