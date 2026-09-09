export const money = (value: unknown) => `₦${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
export const pct = (value: unknown) => `${Math.round(Number(value ?? 0) * 100)}%`;
