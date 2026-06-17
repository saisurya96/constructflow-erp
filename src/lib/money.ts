/** Numeric/money helpers. DB numerics arrive as strings to preserve precision. */

export function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function formatMoney(
  v: string | number | null | undefined,
  currency = "USD",
  opts: { compact?: boolean } = {},
): string {
  const value = num(v);
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      // narrowSymbol prefers the glyph ($, £, €, ₹) over the ISO code where one
      // exists; currencies without a glyph (AED, SAR, …) still show their code.
      currencyDisplay: "narrowSymbol",
      // Compact keeps up to one decimal so $1.1M and $1.4M stay distinct, but
      // minimumFractionDigits:0 stops ICU padding round values to "$1.0M"/"$0.0".
      minimumFractionDigits: 0,
      maximumFractionDigits: opts.compact ? 1 : 0,
      notation: opts.compact ? "compact" : "standard",
    }).format(value);
  } catch {
    // Unknown/invalid currency code — fall back to a plain prefixed number.
    return `${currency} ${formatNumber(value, 0)}`;
  }
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
