import { mkdir, rename, access } from 'node:fs/promises';
import path from 'node:path';
import { DATA } from '../utils/paths';
import { logger } from '../utils/logger';

// Diacritics-and-spaces -> filesystem-safe slug ("Montáže Dvořák a.s." -> "montaze-dvorak-a-s").
function slug(s: string): string {
  return (
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '') // strip combining diacritics
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'neznama'
  );
}

export interface ArchiveInput {
  filePath: string; // current location of the stored PDF
  ourCompany: string;
  supplier: string;
  invoiceNumber: string;
  issueDate?: string; // ISO yyyy-mm-dd — drives the year/month folders
}

export const ArchiveService = {
  /**
   * Rename + move the stored file into archive/{company}/{year}/{month}/ (§12). Standalone on
   * purpose (NOT wired into approve — that would couple the filesystem to a DB action). Returns
   * the new path. Throws if the source file is missing (don't silently "archive" nothing).
   */
  async archive(input: ArchiveInput): Promise<string> {
    await access(input.filePath); // throws if the source isn't there

    const [year, month] = (input.issueDate ?? '0000-00').split('-');
    const dir = path.join(DATA.archive, slug(input.ourCompany), year, month);
    await mkdir(dir, { recursive: true });

    const ext = path.extname(input.filePath) || '.pdf';
    const base = `${slug(input.supplier)}_${slug(input.invoiceNumber)}${input.issueDate ? `_${input.issueDate}` : ''}`;
    const target = path.join(dir, `${base}${ext}`);

    await rename(input.filePath, target);
    logger.info(`archive: ${input.filePath} -> ${target}`);
    return target;
  },
};
