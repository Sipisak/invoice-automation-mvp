import { sha256 } from '../utils/fileHash';
import { logger } from '../utils/logger';
import { InvoiceRepository } from '../repositories/InvoiceRepository';
import { AuditLogService } from '../services/AuditLogService';
import { OcrService } from '../services/OcrService';
import { RuleMatchingService } from '../services/RuleMatchingService';
import { ValidationService } from '../services/ValidationService';
import { classifyInvoice } from '../services/ClassificationService';
import type { ExtractedInvoiceData } from '../types/invoice';

// Hard-duplicate key (§8): firma+dodavatel+číslo+částka+měna from extracted data. Null when
// the identifying core is unreadable — then "duplicate" is meaningless and it's NEPRECTENO anyway.
function computeDedupKey(data: ExtractedInvoiceData): string | null {
  const supplier = data.supplier?.normalizedValue;
  const number = data.invoiceNumber?.normalizedValue;
  const amount = data.totalAmount?.normalizedValue;
  if (!supplier || !number || amount === null || amount === undefined) return null;
  const ourCompany = data.ourCompany?.normalizedValue ?? '';
  const currency = data.currency?.normalizedValue ?? '';
  return [ourCompany, supplier, number, amount, currency].join('|');
}

/**
 * Storage-agnostic file handed to the pipeline. The trigger (timer/upload) is the
 * storage adapter: it has already placed the bytes at `filePath`. The pipeline only
 * hashes the buffer and records metadata — it never touches the filesystem (§3).
 */
export interface IncomingFile {
  fileName: string;
  filePath: string; // canonical stored location (local FS now; blob URL in prod)
  buffer: Buffer;
}

/**
 * The single orchestrator (§3, §17). Timer and upload both call this; it doesn't
 * know which. Full flow: hash → hash-dedup → create → OCR/extract (Day 3) →
 * rule match → validate → hard-dup → classify (Day 4) → persist + audit.
 */
export const InvoicePipeline = {
  async run(file: IncomingFile, batchId: string) {
    // 1. content hash at the trust boundary — independent of whatever named the file.
    const fileHash = sha256(file.buffer);

    // 2. pre-extraction hash-duplicate check (cheap; §8). Distinct from the
    //    post-extraction hard-duplicate (Day 4) — different concepts, kept separate.
    const original = await InvoiceRepository.findByHash(fileHash);
    const isHashDuplicate = original !== null;

    // 3. create the record. Conservative (§0, §14): a hash-dup is born DUPLICITA so a
    //    human sees the exact file arrived again — never silently dropped. Non-dups stay
    //    NEPRECTENO_NEUPLNE until Day 4 classification gives them a real status.
    const warnings = isHashDuplicate
      ? [`hash-duplicate of invoice ${original!.id}`]
      : null;

    const invoice = await InvoiceRepository.create({
      batchId,
      fileName: file.fileName,
      filePath: file.filePath,
      fileHash,
      businessStatus: isHashDuplicate ? 'DUPLICITA' : 'NEPRECTENO_NEUPLNE',
      technicalStatus: 'PROCESSING',
      warnings,
    });

    // 4. audit: one truthful CREATED entry. The dup was *born* DUPLICITA, it never
    //    transitioned — so no fabricated STATUS_CHANGED (audit truthfulness, §18).
    await AuditLogService.log(invoice.id, {
      action: 'CREATED',
      after: invoice.businessStatus,
      reason: isHashDuplicate ? `hash duplicate of ${original!.id}` : undefined,
    });

    logger.info(
      `pipeline: ${file.fileName} -> ${invoice.id} (${invoice.businessStatus})` +
        (isHashDuplicate ? ' [hash-dup]' : ''),
    );

    // A hash-dup is the identical file as an already-processed original — born terminal
    // DUPLICITA (§8/§11: Pohoda NE, Intranet NE). No point re-running OCR on it.
    if (isHashDuplicate) return invoice;

    // 5. OCR + field extraction (§3 step 4). On failure the record stays visible as
    //    FAILED (§12) — never dropped.
    try {
      const ocr = await OcrService.extract(file);
      await InvoiceRepository.update(invoice.id, {
        technicalStatus: 'EXTRACTED',
        documentType: ocr.documentType,
        extractedData: ocr.data,
      });
      await AuditLogService.log(invoice.id, {
        action: 'STATUS_CHANGED',
        before: invoice.technicalStatus,
        after: 'EXTRACTED',
        reason: `ocr extracted (confidence ${ocr.overallConfidence.toFixed(2)})`,
      });
      logger.info(`pipeline: ${invoice.id} extracted (conf ${ocr.overallConfidence.toFixed(2)})`);

      // 6–9. rule match → validate → hard-dup → classify (§3 steps 6–9, Den 4). Pure
      //      decisions over the extracted data; the conservative order lives in classifyInvoice.
      const rule = RuleMatchingService.match(ocr.data);
      const validation = ValidationService.validate(ocr.data, ocr.documentType);
      const dedupKey = computeDedupKey(ocr.data);
      const original = dedupKey ? await InvoiceRepository.findByDedupKey(dedupKey) : null;
      const isHardDuplicate = original !== null;

      const result = classifyInvoice({
        isHardDuplicate,
        validation,
        rule,
        documentType: ocr.documentType,
      });

      const classified = await InvoiceRepository.update(invoice.id, {
        technicalStatus: 'CLASSIFIED',
        businessStatus: result.businessStatus,
        ruleMatched: rule !== null,
        ruleId: rule?.id ?? null,
        routingToPohoda: result.routing.toPohoda,
        routingToIntranet: result.routing.toIntranet,
        missingFields: validation.missingFields,
        isHardDuplicate,
        dedupKey,
      });

      // Audit: the technical EXTRACTED -> CLASSIFIED transition is always real. The business
      // status only gets its own row when it ACTUALLY changed from its born NEPRECTENO_NEUPLNE
      // — no fabricated no-op transition (audit truthfulness, §18).
      await AuditLogService.log(invoice.id, {
        action: 'STATUS_CHANGED',
        before: 'EXTRACTED',
        after: 'CLASSIFIED',
        reason: `classified ${result.businessStatus}: ${result.reason}`,
      });
      if (result.businessStatus !== invoice.businessStatus) {
        await AuditLogService.log(invoice.id, {
          action: 'STATUS_CHANGED',
          before: invoice.businessStatus,
          after: result.businessStatus,
          reason: result.reason,
        });
      }

      logger.info(`pipeline: ${invoice.id} classified ${result.businessStatus} (${result.reason})`);
      return classified;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failed = await InvoiceRepository.update(invoice.id, { technicalStatus: 'FAILED' });
      await AuditLogService.log(invoice.id, {
        action: 'STATUS_CHANGED',
        before: invoice.technicalStatus,
        after: 'FAILED',
        reason: `ocr failed: ${message}`,
      });
      logger.error(`pipeline: ${invoice.id} OCR failed: ${message}`);
      return failed;
    }
  },
};
