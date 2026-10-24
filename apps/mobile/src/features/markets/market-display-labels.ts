const CATEGORY_LABELS: Record<string, string> = {
  MULTI_OUTCOME: 'Multiple outcomes',
  ARTIFICIAL_INTELLIGENCE: 'AI',
  CRYPTO_WEB3: 'Crypto',
  MUSIC: 'Music & Entertainment',
  PLAYER_STATS: 'Player Stats',
  AWARDS: 'Awards',
  SPORTS: 'Sports',
  POLITICS: 'Politics',
  FINANCE: 'Finance',
  TRENDING: 'Trending',
  GENERAL: 'General',
  OTHER: 'Other',
};

export function marketCategoryLabel(value?: string | null) {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Other';
  const key = raw.toUpperCase().replace(/[\\s-]+/g, '_');
  const known = CATEGORY_LABELS[key];
  if (known) return known;
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\\b\\w/g, (character) => character.toUpperCase());
}

export function marketStatusLabel(value?: string | null) {
  const raw = String(value ?? '').trim().toUpperCase();
  const labels: Record<string, string> = {
    OPEN: 'Open',
    ACTIVE: 'Open',
    SCHEDULED: 'Scheduled',
    CLOSED: 'Closed',
    RESOLVING: 'Result processing',
    RESOLVED: 'Result confirmed',
    SETTLEMENT_PENDING: 'Payout processing',
    SETTLED: 'Completed',
    VOID: 'Cancelled',
    VOIDED: 'Cancelled',
    CANCELLED: 'Cancelled',
    SUSPENDED: 'Paused',
    DRAFT: 'Draft',
  };
  return labels[raw] ?? marketCategoryLabel(raw);
}

export function marketOutcomeLabel(code?: string | null, suppliedLabel?: string | null) {
  const label = String(suppliedLabel ?? '').trim();
  if (label) return label;
  const raw = String(code ?? '').trim().toUpperCase();
  if (!raw) return 'Outcome';
  if (raw === 'YES') return 'Yes';
  if (raw === 'NO') return 'No';
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
