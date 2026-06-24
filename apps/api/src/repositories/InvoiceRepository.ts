import { prisma } from '../lib/prisma';
import type { BusinessStatus, TechnicalStatus } from '../types/enums';

export interface CreateInvoiceInput {
  batchId: string;
  fileName: string;
  filePath: string;
  fileHash: string;
  businessStatus: BusinessStatus;
  technicalStatus?: TechnicalStatus;
  warnings?: string[] | null;
}

// One include shape so list/detail payloads stay identical (SPFx binds to this — Day 5).
const include = { supplier: true, ourCompany: true } as const;

export const InvoiceRepository = {
  create(input: CreateInvoiceInput) {
    const { warnings, technicalStatus, ...rest } = input;
    return prisma.invoice.create({
      data: {
        ...rest,
        technicalStatus: technicalStatus ?? 'PROCESSING',
        warnings: warnings && warnings.length ? JSON.stringify(warnings) : null,
      },
    });
  },

  // Patch a record after extraction/classification. extractedData/missingFields are stored
  // as JSON strings; statuses move PROCESSING -> EXTRACTED -> CLASSIFIED (or FAILED). The
  // Day 4 fields (rule/routing/dedup) are denormalized columns. Caller writes AuditLog (§17).
  update(
    id: string,
    patch: {
      technicalStatus?: TechnicalStatus;
      businessStatus?: BusinessStatus;
      documentType?: string;
      extractedData?: object | null;
      ruleMatched?: boolean;
      ruleId?: string | null;
      routingToPohoda?: boolean;
      routingToIntranet?: boolean;
      missingFields?: string[] | null;
      isHardDuplicate?: boolean;
      dedupKey?: string | null;
      approvedBy?: string | null;
      approvedAt?: Date | null;
    },
  ) {
    const { extractedData, missingFields, ...rest } = patch;
    return prisma.invoice.update({
      where: { id },
      data: {
        ...rest,
        ...(extractedData !== undefined
          ? { extractedData: extractedData ? JSON.stringify(extractedData) : null }
          : {}),
        ...(missingFields !== undefined
          ? { missingFields: missingFields && missingFields.length ? JSON.stringify(missingFields) : null }
          : {}),
      },
    });
  },

  // Earliest record with this content hash = the "original" a later copy duplicates.
  findByHash(fileHash: string) {
    return prisma.invoice.findFirst({
      where: { fileHash },
      orderBy: { createdAt: 'asc' },
    });
  },

  // Hard-duplicate (§8, post-extraction): earliest record sharing the dedupKey
  // (firma+dodavatel+číslo+částka+měna). Caller queries BEFORE setting its own key, so this
  // never self-matches; the earliest is the original this one duplicates.
  findByDedupKey(dedupKey: string) {
    return prisma.invoice.findFirst({
      where: { dedupKey },
      orderBy: { createdAt: 'asc' },
    });
  },

  findById(id: string) {
    return prisma.invoice.findUnique({ where: { id }, include });
  },

  list(status?: string) {
    return prisma.invoice.findMany({
      where: status ? { businessStatus: status } : undefined,
      orderBy: { createdAt: 'desc' },
      include,
    });
  },
};
