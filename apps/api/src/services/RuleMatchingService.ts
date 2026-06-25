import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ExtractedInvoiceData } from '../types/invoice';
import { DATA } from '../utils/paths';
import { logger } from '../utils/logger';

/**
 * An accounting rule from data/rules.json. vatClassification/accountingPredefinition are
 * the payload the export (Den 6) needs; the pipeline stores only ruleId and resolves these
 * at export time (no DB columns — see rules.json _comment). ourCompanyIco is optional scope
 * metadata, NOT a match key in the MVP (odběratel IČO isn't reliably extracted yet).
 */
export interface AccountingRule {
  id: string;
  supplierIco: string;
  supplierName?: string;
  ourCompanyIco?: string | null;
  vatClassification: string;
  accountingPredefinition: string;
  vatRate?: string;
  note?: string;
}

// ponytail: read+parse per call — rules.json is tiny and rarely changes in the MVP. Add a
// cache (or move to DB) only when rule count or call frequency makes this matter.
function loadRules(): AccountingRule[] {
  const file = path.join(DATA.root, 'rules.json');
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { rules?: AccountingRule[] };
    return parsed.rules ?? [];
  } catch (err) {
    logger.error(`rules: failed to load ${file}: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

export const RuleMatchingService = {
  /**
   * §6 step 3 gate: is there an accounting rule for this supplier? MVP key = supplierIco
   * (reliably extracted). Returns null when supplier IČO is unknown or no rule matches —
   * the caller then classifies as DOPLNIT_PRAVIDLO (readable, but we won't guess accounting).
   */
  match(data: ExtractedInvoiceData): AccountingRule | null {
    const ico = data.supplierIco?.normalizedValue;
    if (!ico) return null;
    return loadRules().find((r) => r.supplierIco === ico) ?? null;
  },

  // Resolve a stored ruleId back to its rule (export resolves accounting payload here, §ruleId-only).
  byId(ruleId: string | null | undefined): AccountingRule | null {
    if (!ruleId) return null;
    return loadRules().find((r) => r.id === ruleId) ?? null;
  },
};
