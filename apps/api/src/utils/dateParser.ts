// Czech invoice dates -> ISO "YYYY-MM-DD". Returns null when it can't parse safely
// (§0: never guess). Normalization only; trust/judgement of the value is the caller's.

const DMY = /^(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})$/; // 1.2.2024 / 01. 02. 2024
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/; // already ISO

function valid(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Parse a Czech / ISO date string to ISO "YYYY-MM-DD", or null if unrecognized. */
export function parseCzechDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();

  const isoMatch = ISO.exec(s);
  if (isoMatch) {
    const [, y, m, d] = isoMatch.map(Number);
    return valid(y, m, d) ? iso(y, m, d) : null;
  }

  const dmy = DMY.exec(s);
  if (dmy) {
    const [, d, m, y] = dmy.map(Number);
    return valid(y, m, d) ? iso(y, m, d) : null;
  }

  return null;
}
