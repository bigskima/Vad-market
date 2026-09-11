function amount(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function optionalNumber(value: unknown) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export const money = (value: unknown) =>
  `₦${amount(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function assetMoney(value: unknown, assetCode?: string | null) {
  const code = String(assetCode ?? 'NGN').trim().toUpperCase();
  const numeric = amount(value);
  const formatted = numeric.toLocaleString(undefined, {
    minimumFractionDigits: code === 'USDC' ? 2 : 0,
    maximumFractionDigits: code === 'USDC' ? 6 : 2,
  });

  if (code === 'NGN') return `₦${formatted}`;
  if (code === 'USDC') return `${formatted} USDC`;
  return code ? `${formatted} ${code}` : formatted;
}

export const pct = (value: unknown) => `${Math.round(amount(value) * 100)}%`;

export function probability(value: unknown) {
  const numeric = optionalNumber(value);
  if (numeric == null) return '—';
  return `${Math.round(Math.max(0, Math.min(1, numeric)) * 100)}%`;
}
