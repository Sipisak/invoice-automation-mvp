import pdf from 'pdf-parse';
import type { IncomingFile } from '../pipeline/InvoicePipeline';
import type { ExtractedInvoiceData } from '../types/invoice';
import { extracted, type ExtractedValue } from '../types/ExtractedValue';
import type { DocumentType } from '../types/enums';
import type { OcrExtractor, OcrResult } from './OcrService';
import { parseCzechDate } from '../utils/dateParser';
import { parseCzechAmount } from '../utils/moneyParser';
import { logger } from '../utils/logger';

// Local stand-in for Azure Document Intelligence on TEXT PDFs (§2): pdf-parse gives the
// text layer, labeled regexes lift fields. Digital text is reliable but a regex can still
// grab the wrong token, so a clean hit scores 0.9, never 1.0 (honest confidence, §18).
// Scans (no text layer) go through MockOcrExtractor instead — picked by the OcrService facade.

const LABEL_CONFIDENCE = 0.9; // clean hit on an explicitly-labeled field

// First capturing group of the first matching pattern = the raw value.
function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

// A string field: present only if found (§0 — absent != fabricated null field).
function strField(text: string, patterns: RegExp[]): ExtractedValue<string> | undefined {
  const raw = firstMatch(text, patterns);
  if (raw === null) return undefined;
  return extracted(raw, raw, LABEL_CONFIDENCE);
}

// Like strField but for the line-after-label name heuristic (lower confidence).
function nameField(text: string, patterns: RegExp[]): ExtractedValue<string> | undefined {
  const raw = firstMatch(text, patterns);
  if (raw === null) return undefined;
  return extracted(raw, raw, NAME_CONFIDENCE);
}

// A date field: found but unparseable -> kept with normalizedValue null + low confidence
// (honest "read it, couldn't parse it"), so Day 4 sees the attempt.
function dateField(text: string, patterns: RegExp[]): ExtractedValue<string> | undefined {
  const raw = firstMatch(text, patterns);
  if (raw === null) return undefined;
  const iso = parseCzechDate(raw);
  return extracted(raw, iso, iso ? LABEL_CONFIDENCE : 0.3);
}

function amountField(text: string, patterns: RegExp[]): ExtractedValue<number> | undefined {
  const raw = firstMatch(text, patterns);
  if (raw === null) return undefined;
  const n = parseCzechAmount(raw);
  return extracted(raw, n, n !== null ? LABEL_CONFIDENCE : 0.3);
}

function detectDocumentType(text: string): DocumentType {
  const t = text.toLowerCase();
  if (/zálohov\w+\s+faktur/.test(t)) return 'ZALOHOVA_FAKTURA';
  if (/dobropis|opravný daňový doklad/.test(t)) return 'DOBROPIS';
  if (/objednávk/.test(t)) return 'OBJEDNAVKA';
  if (/faktur|daňový doklad/.test(t)) return 'FAKTURA';
  return 'NEZNAMY'; // §6: don't force FAKTURA when unsure
}

// NOTE: patterns are first-draft against typical Czech invoice labels; verified/tuned
// against the real pdf-parse output of faktura-A in the Day 3 end-to-end test.
const NAME_CONFIDENCE = 0.8; // "line after the label" heuristic — cleaner hits but more fragile

function extractFields(text: string): ExtractedInvoiceData {
  const data: ExtractedInvoiceData = {
    // supplier / ourCompany are the line following the label (free text, no inline value).
    // §10 forbidden-name validation is Day 4 — here we only emit what we read.
    supplier: nameField(text, [/dodavatel\s*:?\s*\n\s*([^\n]+)/i]),
    ourCompany: nameField(text, [/odb[ěe]ratel\s*:?\s*\n\s*([^\n]+)/i]),
    invoiceNumber: strField(text, [
      /(?:číslo\s+(?:faktury|dokladu)|faktura\s+č\.?|daňový doklad č\.?)\s*:?\s*([A-Za-z0-9\-\/]+)/i,
    ]),
    variableSymbol: strField(text, [/variabiln[ií]\s+symbol\s*:?\s*(\d{1,10})/i]),
    supplierIco: strField(text, [/i[čc]o?\s*:?\s*(\d{6,8})/i]),
    issueDate: dateField(text, [/datum\s+vystaven[ií]\s*:?\s*(\d{1,2}\s*\.\s*\d{1,2}\s*\.\s*\d{4})/i]),
    dueDate: dateField(text, [/datum\s+splatnosti\s*:?\s*(\d{1,2}\s*\.\s*\d{1,2}\s*\.\s*\d{4})/i]),
    taxDate: dateField(text, [
      /(?:duzp|datum\s+(?:zdaniteln\w+\s+pln\w+|usk\.\s*zdan\.\s*pln\w+))\s*:?\s*(\d{1,2}\s*\.\s*\d{1,2}\s*\.\s*\d{4})/i,
    ]),
    currency: undefined,
    totalAmount: amountField(text, [
      /celkem\s+k\s+úhrad[eě]\s*:?\s*([\d  .,]+)/i,
      /k\s+úhrad[eě]\s*:?\s*([\d  .,]+)/i,
    ]),
    iban: strField(text, [/iban\s*:?\s*([A-Z]{2}\d{2}[A-Z0-9 ]{10,30})/i]),
    bic: strField(text, [/(?:bic|swift)\s*:?\s*([A-Z0-9]{8,11})/i]),
  };

  // currency: CZK/Kč/EUR token anywhere — labeled by symbol, modest confidence
  const cur = /\b(CZK|EUR|USD)\b/.exec(text) ?? (/Kč/.test(text) ? ['', 'CZK'] : null);
  if (cur) data.currency = extracted(cur[0] || 'Kč', cur[1], 0.7);

  // bank account "123456789/0100" -> account + bank code (two fields, one source)
  const acc = /(?:číslo\s+účtu|účet)\s*:?\s*(\d{1,6}-?\d{2,10})\s*\/\s*(\d{4})/i.exec(text);
  if (acc) {
    data.bankAccount = extracted(acc[1], acc[1], LABEL_CONFIDENCE);
    data.bankCode = extracted(acc[2], acc[2], LABEL_CONFIDENCE);
  }

  return data;
}

function meanConfidence(data: ExtractedInvoiceData): number {
  const values = Object.values(data).filter(Boolean) as ExtractedValue<unknown>[];
  if (!values.length) return 0;
  return values.reduce((acc, v) => acc + (v.confidence ?? 0), 0) / values.length;
}

export const TextPdfExtractor: OcrExtractor = {
  async extract(file: IncomingFile): Promise<OcrResult> {
    const parsed = await pdf(file.buffer);
    const text = parsed.text ?? '';
    const data = extractFields(text);
    logger.info(
      `text-pdf: ${file.fileName} ${text.length} chars, ` +
        `${Object.values(data).filter(Boolean).length} fields`,
    );
    return {
      documentType: text.trim().length ? detectDocumentType(text) : 'NEZNAMY',
      data,
      rawText: text,
      overallConfidence: meanConfidence(data),
    };
  },
};
