// UI number formatting (en-US grouping, fixed decimals; non-finite -> "—"). Display only — lib/ uses .toFixed().
export function fmt(n, dec=2) {
  if (!isFinite(n)) return '—';
  return n.toLocaleString('en-US', {minimumFractionDigits: dec, maximumFractionDigits: dec});
}
