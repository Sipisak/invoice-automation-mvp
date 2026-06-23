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

  // Patch a record after extraction. extractedData is the JSON blob (ExtractedInvoiceData);
  // statuses move PROCESSING -> EXTRACTED (or FAILED). Caller writes the AuditLog (§17).
  update(
    id: string,
    patch: {
      technicalStatus?: TechnicalStatus;
      businessStatus?: BusinessStatus;
      documentType?: string;
      extractedData?: object | null;
    },
  ) {
    const { extractedData, ...rest } = patch;
    return prisma.invoice.update({
      where: { id },
      data: {
        ...rest,
        ...(extractedData !== undefined
          ? { extractedData: extractedData ? JSON.stringify(extractedData) : null }
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
