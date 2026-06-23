import { existsSync } from 'node:fs';
import path from 'node:path';
import type { IncomingFile } from '../pipeline/InvoicePipeline';
import type { ExtractedInvoiceData } from '../types/invoice';
import type { DocumentType } from '../types/enums';
import { DATA } from '../utils/paths';
import { MockOcrExtractor } from './MockOcrExtractor';
import { TextPdfExtractor } from './TextPdfExtractor';

/**
 * Output of OCR + field extraction. Mirrors what a structured OCR (prod: Azure Document
 * Intelligence) returns: field-level ExtractedValue, not just raw text. That's why the
 * interface lives here and swapping the impl never touches the pipeline (§3, §17).
 */
export interface OcrResult {
  documentType: DocumentType; // best-effort; NEZNAMY when unsure (§6, not forced to FAKTURA)
  data: ExtractedInvoiceData;
  rawText: string | null; // verbatim text for audit/debug; null when no text layer (mock/scan)
  overallConfidence: number; // 0..1, honest (§18) — low when little could be read
}

/** An OCR backend. Local: pdf-parse for text PDFs, fixture JSON for scans. */
export interface OcrExtractor {
  extract(file: IncomingFile): Promise<OcrResult>;
}

/** Basename without extension: "faktura-C-scan.pdf" -> "faktura-C-scan". */
function fixtureFor(fileName: string): string {
  const base = path.basename(fileName, path.extname(fileName));
  return path.join(DATA.mockOcr, `${base}.json`);
}

/**
 * Facade the pipeline calls. Picks the backend: a scanned doc ships with a mock-ocr
 * fixture (no extractable text layer), so a fixture wins; otherwise we try pdf-parse.
 * One entry point keeps the pipeline storage/OCR-agnostic.
 */
export const OcrService = {
  async extract(file: IncomingFile): Promise<OcrResult> {
    if (existsSync(fixtureFor(file.fileName))) {
      return MockOcrExtractor.extract(file);
    }
    return TextPdfExtractor.extract(file);
  },
};
