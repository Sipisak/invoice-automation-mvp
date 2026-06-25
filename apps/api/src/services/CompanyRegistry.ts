import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DATA } from '../utils/paths';
import { logger } from '../utils/logger';

// One of OUR accounting units (group company). Its IČO is the Pohoda dataPack root ico (§9).
export interface OurCompany {
  name: string;
  ico: string;
  dic?: string;
}

// ponytail: read+parse per call (tiny mock file). Move to DB when companies are UI-managed.
function loadCompanies(): OurCompany[] {
  const file = path.join(DATA.root, 'companies.json');
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { companies?: OurCompany[] };
    return parsed.companies ?? [];
  } catch (err) {
    logger.error(`companies: failed to load ${file}: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

// Loose match: trim + lowercase + collapse inner whitespace, so "Montáže  Dvořák a.s." matches.
function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export const CompanyRegistry = {
  // Resolve an extracted ourCompany name to a known accounting unit. null on miss — the caller
  // MUST NOT emit a dataPack with a guessed/empty ico (§0): skip + warn instead.
  byName(name: string | null | undefined): OurCompany | null {
    if (!name) return null;
    const target = normalize(name);
    return loadCompanies().find((c) => normalize(c.name) === target) ?? null;
  },
};
