import { sha256 } from '../utils/fileHash';
import { logger } from '../utils/logger';
import { InvoiceRepository } from '../repositories/InvoiceRepository';
import { AuditLogService } from '../services/AuditLogService';
import { OcrService } from '../services/OcrService';

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
 * know which. Day 2 scope = hash → hash-dedup → create record → audit.
 * Day 3 adds OCR/normalize, Day 4 adds rules + hard-dup + classify.
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
    //    FAILED (§12) — never dropped. Classification of these values is Day 4.
    try {
      const ocr = await OcrService.extract(file);
      const extracted = await InvoiceRepository.update(invoice.id, {
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
      return extracted;
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
