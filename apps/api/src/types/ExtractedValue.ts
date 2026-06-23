/**
 * Core type of the whole system: separates what OCR/AI read from what a human approved.
 * NEVER mix rawValue with approvedValue.
 */
export interface ExtractedValue<T> {
  rawValue: string | null; // verbatim from OCR / pdf-parse
  normalizedValue: T | null; // parsed (date, number, currency, account)
  confidence: number; // 0..1
  sourceText?: string; // where in the document
  approvedValue?: T | null; // confirmed by a human
  approvedBy?: string | null;
  approvedAt?: string | null;
}

export function extracted<T>(
  rawValue: string | null,
  normalizedValue: T | null,
  confidence: number,
  sourceText?: string,
): ExtractedValue<T> {
  return { rawValue, normalizedValue, confidence, sourceText };
}
