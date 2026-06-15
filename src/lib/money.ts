/** Numeric/money helpers. DB numerics arrive as strings to preserve precision. */

export function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function formatMoney(
  v: string | number | null | undefined,
  currency = "AED",
  opts: { compact?: boolean } = {},
): string {
  const value = num(v);
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    notation: opts.compact ? "compact" : "standard",
  }).format(value);
}

export function formatNumber(
  v: string | number | null | undefined,
  maximumFractionDigits = 2,
): string {
  return new Intl.NumberFormat("en-AE", { maximumFractionDigits }).format(num(v));
}

export function formatPercent(
  v: string | number | null | undefined,
  digits = 0,
): string {
  return `${num(v).toFixed(digits)}%`;
}

/** Round to 2 dp and return as a string suitable for a numeric(_,2) column. */
export function money(v: number): string {
  return (Math.round(v * 100) / 100).toFixed(2);
}

/** Round to 3 dp for quantity columns. */
export function quantity(v: number): string {
  return (Math.round(v * 1000) / 1000).toFixed(3);
}
