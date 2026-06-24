// Mirror of apps/api ExtractedValue / ExtractedInvoiceData (web is standalone — small,
// stable shapes, duplicated on purpose rather than coupling the build to the API package).

export interface ExtractedValue<T> {
  rawValue: string | null;
  normalizedValue: T | null;
  confidence: number;
  sourceText?: string;
  approvedValue?: T | null;
}

export interface ExtractedInvoiceData {
  ourCompany?: ExtractedValue<string>;
  supplier?: ExtractedValue<string>;
  supplierIco?: ExtractedValue<string>;
  invoiceNumber?: ExtractedValue<string>;
  variableSymbol?: ExtractedValue<string>;
  issueDate?: ExtractedValue<string>;
  dueDate?: ExtractedValue<string>;
  taxDate?: ExtractedValue<string>;
  currency?: ExtractedValue<string>;
  totalAmount?: ExtractedValue<number>;
  totalAmountCzk?: ExtractedValue<number>;
  bankAccount?: ExtractedValue<string>;
  bankCode?: ExtractedValue<string>;
  iban?: ExtractedValue<string>;
  bic?: ExtractedValue<string>;
}

// Business statuses a human can move an invoice to (mirror of BUSINESS_STATUS in the API).
export const BUSINESS_STATUSES = [
  'K_ODSOUHLASENI',
  'DOPLNIT_PRAVIDLO',
  'NEPRECTENO_NEUPLNE',
  'DUPLICITA',
  'SCHVALENO',
  'EXPORTOVANO',
] as const;
export type BusinessStatus = (typeof BUSINESS_STATUSES)[number];

export function parseExtracted(json: string | null): ExtractedInvoiceData {
  if (!json) return {};
  try {
    return JSON.parse(json) as ExtractedInvoiceData;
  } catch {
    return {};
  }
}

export function parseStringArray(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}
