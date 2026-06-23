// Czech money strings -> number. Returns null when it can't parse safely (§0: never guess).
// Handles "1 234,56", "1.234,56 Kč", "12 345.67", "1234,5", "1234". Czech convention:
// comma is the decimal separator; space / NBSP / dot are thousands separators.

/** Parse a Czech money string to a number, or null if unrecognized. */
export function parseCzechAmount(raw: string | null | undefined): number | null {
  if (!raw) return null;

  // drop currency words/symbols and any char that isn't a digit, separator or sign
  let s = raw
    .replace(/(kč|czk|eur|€|usd|\$)/gi, '')
    .replace(/[  ]/g, ' ') // NBSP / narrow NBSP -> space
    .replace(/[^\d.,\- ]/g, '')
    .trim();
  if (!s) return null;

  s = s.replace(/\s/g, ''); // spaces are thousands separators -> remove

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    // both present: the LAST one is the decimal separator, the other is thousands
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56 -> 1234.56
    } else {
      s = s.replace(/,/g, ''); // 1,234.56 -> 1234.56
    }
  } else if (hasComma) {
    s = s.replace(',', '.'); // comma is decimal: 1234,56 -> 1234.56
  }
  // only dot (or neither): already valid JS number form

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
