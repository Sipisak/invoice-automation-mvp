import type { DocumentType, BusinessStatus } from '../types/enums';
import type { ValidationResult } from './ValidationService';
import type { AccountingRule } from './RuleMatchingService';

export interface ClassifyInput {
  isHardDuplicate: boolean;
  validation: ValidationResult;
  rule: AccountingRule | null;
  documentType: DocumentType;
}

export interface Routing {
  toPohoda: boolean;
  toIntranet: boolean;
  reason: string;
}

export interface Classification {
  businessStatus: BusinessStatus;
  routing: Routing;
  reason: string;
}

/**
 * §6 conservative classification — first matching rule wins, in this exact order. The golden
 * rule (§0): never guess. Anything short of "readable + complete + rule exists" lands in a
 * status a human looks at, never silently in K_ODSOUHLASENI.
 */
export function classifyInvoice(input: ClassifyInput): Classification {
  const { isHardDuplicate, validation, rule, documentType } = input;

  if (isHardDuplicate) {
    return done('DUPLICITA', documentType, 'hard duplicate (firma+dodavatel+číslo+částka+měna)');
  }

  if (validation.missingFields.length > 0 || validation.lowConfidence) {
    const why = validation.missingFields.length
      ? `missing/unreadable: ${validation.missingFields.join(', ')}`
      : 'low OCR confidence';
    return done('NEPRECTENO_NEUPLNE', documentType, why);
  }

  if (!rule) {
    return done('DOPLNIT_PRAVIDLO', documentType, 'readable but no accounting rule for supplier');
  }

  return done('K_ODSOUHLASENI', documentType, `rule ${rule.id} matched`);
}

function done(status: BusinessStatus, docType: DocumentType, reason: string): Classification {
  return { businessStatus: status, routing: routeFor(status, docType), reason };
}

/**
 * §11 routing — where the invoice WILL go once approved. DUPLICITA: nowhere. Unreadable:
 * undetermined (false/false). Objednávka / nedaňový doklad: Intranet only. Everything else:
 * both. (Soft-dup "už v Intranetu přes objednávku" = backlog, not MVP.)
 */
function routeFor(status: BusinessStatus, docType: DocumentType): Routing {
  if (status === 'DUPLICITA') {
    return { toPohoda: false, toIntranet: false, reason: 'duplicita: nikam' };
  }
  if (status === 'NEPRECTENO_NEUPLNE') {
    return { toPohoda: false, toIntranet: false, reason: 'nepřečteno: routing neurčen' };
  }
  if (docType === 'OBJEDNAVKA' || docType === 'NEDANOVY_DOKLAD') {
    return { toPohoda: false, toIntranet: true, reason: 'objednávka/nedaňový: jen Intranet' };
  }
  return { toPohoda: true, toIntranet: true, reason: 'běžná faktura: Pohoda + Intranet' };
}
