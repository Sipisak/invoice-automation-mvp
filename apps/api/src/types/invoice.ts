import type { ExtractedValue } from './ExtractedValue';

/**
 * Shape of the JSON blob stored in Invoice.extractedData.
 * Every field optional – the pipeline fills what it can read.
 */
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

export function parseExtracted(json: string | null): ExtractedInvoiceData {
  if (!json) return {};
  try {
    return JSON.parse(json) as ExtractedInvoiceData;
  } catch {
    return {};
  }
}
