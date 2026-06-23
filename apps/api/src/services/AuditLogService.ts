import { prisma } from '../lib/prisma';

// Load-bearing (§18): every state change / field override / creation gets a row.
export type AuditAction =
  | 'CREATED'
  | 'STATUS_CHANGED'
  | 'FIELD_OVERRIDDEN'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPORTED';

export interface AuditEntry {
  action: AuditAction;
  field?: string;
  before?: string;
  after?: string;
  reason?: string;
  actor?: string; // defaults to "system"
}

export const AuditLogService = {
  log(invoiceId: string, entry: AuditEntry) {
    const { actor, ...rest } = entry;
    return prisma.auditLog.create({
      data: { invoiceId, actor: actor ?? 'system', ...rest },
    });
  },
};
