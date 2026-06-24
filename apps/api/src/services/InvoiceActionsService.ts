import { InvoiceRepository } from '../repositories/InvoiceRepository';
import { AuditLogService } from './AuditLogService';
import { BUSINESS_STATUS, type BusinessStatus } from '../types/enums';
import { logger } from '../utils/logger';

// Business logic for the human-facing actions (§17 — never in the HTTP trigger). HTTP status
// is carried on the error so the thin function wrappers just map it to a response.
export class ActionError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ActionError';
  }
}

function isBusinessStatus(v: string): v is BusinessStatus {
  return (BUSINESS_STATUS as readonly string[]).includes(v);
}

export const InvoiceActionsService = {
  /**
   * Human sign-off (§0/§14): the approved invoice becomes authoritative for export. Conservative
   * guard — only a ready invoice (K_ODSOUHLASENI) can be approved; a duplicate / unreadable /
   * rule-less doc must be fixed or moved first. This is load-bearing (§18), not over-engineering.
   */
  async approve(id: string, actor: string) {
    const invoice = await InvoiceRepository.findById(id);
    if (!invoice) throw new ActionError(404, 'invoice not found');
    if (invoice.businessStatus !== 'K_ODSOUHLASENI') {
      throw new ActionError(409, `only K_ODSOUHLASENI can be approved (is ${invoice.businessStatus})`);
    }
    const updated = await InvoiceRepository.update(id, {
      businessStatus: 'SCHVALENO',
      technicalStatus: 'APPROVED',
      approvedBy: actor,
      approvedAt: new Date(),
    });
    await AuditLogService.log(id, {
      action: 'APPROVED',
      before: invoice.businessStatus,
      after: 'SCHVALENO',
      actor,
    });
    logger.info(`approve: ${id} by ${actor}`);
    return updated;
  },

  /**
   * Manual business-status move (§7). MVP has no full state machine (§15 backlog), so any valid
   * target is allowed — but a no-op move is rejected so the audit never records a fake
   * transition (truthfulness, §18). Every move is audited with the reason.
   */
  async moveStatus(id: string, targetStatus: string, opts: { reason?: string; actor?: string } = {}) {
    const invoice = await InvoiceRepository.findById(id);
    if (!invoice) throw new ActionError(404, 'invoice not found');
    if (!isBusinessStatus(targetStatus)) {
      throw new ActionError(400, `invalid targetStatus '${targetStatus}'`);
    }
    if (targetStatus === invoice.businessStatus) {
      throw new ActionError(400, `already ${targetStatus}`);
    }
    const updated = await InvoiceRepository.update(id, { businessStatus: targetStatus });
    await AuditLogService.log(id, {
      action: 'STATUS_CHANGED',
      before: invoice.businessStatus,
      after: targetStatus,
      reason: opts.reason ?? 'manual move',
      actor: opts.actor ?? 'demo-user',
    });
    logger.info(`move-status: ${id} ${invoice.businessStatus} -> ${targetStatus}`);
    return updated;
  },
};
