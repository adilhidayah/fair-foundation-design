// UI number formatting (en-US grouping, fixed decimals; non-finite -> "—"). Display only — lib/ uses .toFixed().
// One Intl.NumberFormat per decimal count, reused: n.toLocaleString(locale, opts) builds a new formatter on every call,
// which dominated recalcAll() once there are 100+ load combinations (tens of thousands of fmt() calls per recalculation).
const formatters = new Map();
export function fmt(n, dec=2) {
  if (!isFinite(n)) return '—';
  let f = formatters.get(dec);
  if (!f) { f = new Intl.NumberFormat('en-US', {minimumFractionDigits: dec, maximumFractionDigits: dec}); formatters.set(dec, f); }
  return f.format(n);
}
