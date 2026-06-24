import type { ExtractedInvoiceData } from '../types/invoice';
import type { ExtractedValue } from '../types/ExtractedValue';
import type { DocumentType } from '../types/enums';

/**
 * Validates the trust boundary (§14): extracted OCR data is untrusted. Decides whether an
 * invoice is READABLE enough to be approvable. This is ONLY the set OCR extracts — by design
 * it does NOT check vatClassification/accountingPredefinition/routing, which are rule- and
 * pipeline-derived and gate later in classifyInvoice(). Folding those in here would push
 * every readable invoice into NEPRECTENO_NEUPLNE and the rule gate would never be reached.
 */

// §6 "Povinná pole" — the readable-invoice essentials.
const REQUIRED: (keyof ExtractedInvoiceData)[] = [
  'ourCompany',
  'supplier',
  'invoiceNumber',
  'variableSymbol',
  'issueDate',
  'totalAmount',
  'currency',
];

// Below this, a read is too shaky to trust (§0/§14) -> send to control, don't approve.
const MIN_FIELD_CONFIDENCE = 0.5;

// §6 "Pro platbu navíc": a payable invoice also needs dueDate + (account+code | IBAN).
// Missing payment fields => to control (NEPRECTENO_NEUPLNE), user decision 2026-06-24.
// ponytail: FAKTURA only for the MVP; extend to ZALOHOVA_FAKTURA/DOBROPIS when in scope
// (objednávka / nedaňový doklad aren't paid, so the tier must NOT over-flag them).
const PAYABLE_DOC_TYPES: DocumentType[] = ['FAKTURA'];

// §10: tokens that are a label/heading, NOT a real supplier — OCR grabbed the wrong line.
const FORBIDDEN_SUPPLIER = [
  'není plátce dph',
  'faktura',
  'daňový doklad',
  'variabilní symbol',
  'celkem k úhradě',
  'odběratel',
  'naše firma',
];

function has(v?: ExtractedValue<unknown>): boolean {
  return !!v && v.normalizedValue !== null && v.normalizedValue !== undefined;
}

// §6: VS may be safely derived from the numeric part of the invoice number -> not "missing".
function variableSymbolDerivable(data: ExtractedInvoiceData): boolean {
  const num = data.invoiceNumber?.normalizedValue;
  return !!num && /\d/.test(num);
}

export interface ValidationResult {
  missingFields: string[];
  lowConfidence: boolean;
}

export const ValidationService = {
  validate(data: ExtractedInvoiceData, documentType: DocumentType): ValidationResult {
    const missingFields: string[] = [];

    for (const field of REQUIRED) {
      if (field === 'variableSymbol' && !has(data.variableSymbol) && variableSymbolDerivable(data)) {
        continue;
      }
      if (!has(data[field])) missingFields.push(field);
    }

    // §10: forbidden token in the supplier name means we didn't actually read a supplier.
    const supplierName = data.supplier?.normalizedValue?.toLowerCase().trim();
    if (supplierName && FORBIDDEN_SUPPLIER.some((bad) => supplierName.includes(bad))) {
      if (!missingFields.includes('supplier')) missingFields.push('supplier');
    }

    // §6 payment tier — only for payable doc types (an objednávka has no bank details by design).
    if (PAYABLE_DOC_TYPES.includes(documentType)) {
      if (!has(data.dueDate)) missingFields.push('dueDate');
      const hasBankPair = has(data.bankAccount) && has(data.bankCode);
      if (!hasBankPair && !has(data.iban)) missingFields.push('bankAccount/iban');
    }

    // Low confidence on any PRESENT required field -> shaky read -> to control.
    const lowConfidence = REQUIRED.some((field) => {
      const v = data[field] as ExtractedValue<unknown> | undefined;
      return has(v) && (v!.confidence ?? 0) < MIN_FIELD_CONFIDENCE;
    });

    return { missingFields, lowConfidence };
  },
};
