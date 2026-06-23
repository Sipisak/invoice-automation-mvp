import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingFile } from '../pipeline/InvoicePipeline';
import type { ExtractedInvoiceData } from '../types/invoice';
import type { ExtractedValue } from '../types/ExtractedValue';
import type { OcrExtractor, OcrResult } from './OcrService';
import { DATA } from '../utils/paths';
import { logger } from '../utils/logger';

// Stand-in for Azure Document Intelligence on scanned docs (§2): a hand-authored fixture
// JSON already holds field-level ExtractedValue. Swapping in real OCR replaces only this file.
// ponytail: fixture path = data/mock-ocr/<basename>.json, upgrade path = Azure DI client.

function fixturePath(fileName: string): string {
  const base = path.basename(fileName, path.extname(fileName));
  return path.join(DATA.mockOcr, `${base}.json`);
}

// Overall confidence = mean of present fields' confidences (honest, §18). No fields read
// (empty fixture) -> 0, never a fabricated high score.
function meanConfidence(data: ExtractedInvoiceData): number {
  const values = Object.values(data).filter(Boolean) as ExtractedValue<unknown>[];
  if (!values.length) return 0;
  const sum = values.reduce((acc, v) => acc + (v.confidence ?? 0), 0);
  return sum / values.length;
}

export const MockOcrExtractor: OcrExtractor = {
  async extract(file: IncomingFile): Promise<OcrResult> {
    const fixture = fixturePath(file.fileName);
    const data = JSON.parse(await readFile(fixture, 'utf8')) as ExtractedInvoiceData;
    logger.info(`mock-ocr: ${file.fileName} <- ${path.basename(fixture)}`);
    return {
      // documentType isn't part of ExtractedInvoiceData; the mock represents a scan we
      // couldn't reliably type -> NEZNAMY (§6, conservative). Day 4 can refine.
      documentType: 'NEZNAMY',
      data,
      rawText: null, // a scan has no text layer
      overallConfidence: meanConfidence(data),
    };
  },
};
