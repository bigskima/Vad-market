export type MarketStatusTone = 'yes' | 'brand' | 'warning' | 'neutral';
export type MarketTimingTone = 'yes' | 'brand' | 'warning' | 'danger' | 'secondary';

export type MarketTiming = {
  available: boolean;
  isPastClose: boolean;
  remainingMs: number | null;
  headline: string;
  compact: string;
  absolute: string | null;
  detail: string;
  tone: MarketTimingTone;
};

export function marketStatusMeta(status: string) {
  const normalized = status.toUpperCase();

  if (normalized === 'OPEN' || normalized === 'ACTIVE') {
    return { label: 'LIVE', detail: 'Trading is open', tone: 'yes' as MarketStatusTone, tradeOpen: true };
  }
  if (normalized === 'SUSPENDED') {
    return { label: 'PAUSED', detail: 'Trading is temporarily paused', tone: 'warning' as MarketStatusTone, tradeOpen: false };
  }
  if (normalized === 'CLOSED' || normalized === 'AWAITING_ORACLE' || normalized === 'RESOLVING') {
    return { label: 'AWAITING RESULT', detail: 'Trading has closed and the result is being determined', tone: 'brand' as MarketStatusTone, tradeOpen: false };
  }
  if (normalized === 'RESOLVED' || normalized === 'FINALIZED' || normalized === 'SETTLEMENT_PENDING') {
    return { label: 'RESULT FINAL', detail: 'The result is final and settlement is pending or in progress', tone: 'brand' as MarketStatusTone, tradeOpen: false };
  }
  if (normalized === 'SETTLED') {
    return { label: 'SETTLED', detail: 'Settlement is complete', tone: 'neutral' as MarketStatusTone, tradeOpen: false };
  }
  if (normalized === 'VOID' || normalized === 'VOIDED') {
    return { label: 'VOIDED', detail: 'This market was voided', tone: 'neutral' as MarketStatusTone, tradeOpen: false };
  }
  if (normalized === 'CANCELLED' || normalized === 'CANCELED') {
    return { label: 'CANCELLED', detail: 'This market was cancelled', tone: 'neutral' as MarketStatusTone, tradeOpen: false };
  }

  return { label: 'UNAVAILABLE', detail: 'Market state is unavailable', tone: 'neutral' as MarketStatusTone, tradeOpen: false };
}

export function describeMarketTiming(closesAt: string | null | undefined, status: string, now: number): MarketTiming {
  const statusMeta = marketStatusMeta(status);
  const parsed = closesAt ? Date.parse(closesAt) : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return {
      available: false,
      isPastClose: !statusMeta.tradeOpen,
      remainingMs: null,
      headline: statusMeta.tradeOpen ? 'Closing time unavailable' : statusMeta.detail,
      compact: statusMeta.tradeOpen ? 'Close time unavailable' : statusMeta.label,
      absolute: null,
      detail: statusMeta.tradeOpen
        ? 'Trading is live, but the public closing time is not available.'
        : statusMeta.detail,
      tone: statusMeta.tradeOpen ? 'secondary' : statusMeta.tone === 'warning' ? 'warning' : 'secondary',
    };
  }

  const remainingMs = parsed - now;
  const isPastClose = remainingMs <= 0;
  const absolute = new Date(parsed).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  if (!statusMeta.tradeOpen) {
    const normalized = status.toUpperCase();
    const compact = normalized === 'SUSPENDED'
      ? `Paused · ${isPastClose ? 'close reached' : `closes ${formatDuration(remainingMs)}`}`
      : normalized === 'CLOSED' || normalized === 'AWAITING_ORACLE' || normalized === 'RESOLVING'
        ? 'Awaiting result'
        : normalized === 'RESOLVED' || normalized === 'FINALIZED' || normalized === 'SETTLEMENT_PENDING'
          ? 'Result final'
          : normalized === 'SETTLED'
            ? 'Settled'
            : normalized === 'VOID' || normalized === 'VOIDED'
              ? 'Voided'
              : statusMeta.label;

    return {
      available: true,
      isPastClose,
      remainingMs,
      headline: statusMeta.detail,
      compact,
      absolute,
      detail: normalized === 'CLOSED' || normalized === 'AWAITING_ORACLE' || normalized === 'RESOLVING'
        ? `Trading closed ${formatElapsed(parsed, now)}. The market is waiting for an official result.`
        : statusMeta.detail,
      tone: normalized === 'SUSPENDED' ? 'warning' : normalized === 'SETTLED' ? 'yes' : 'brand',
    };
  }

  if (isPastClose) {
    return {
      available: true,
      isPastClose: true,
      remainingMs,
      headline: 'Closing time reached',
      compact: 'Closing now',
      absolute,
      detail: 'The scheduled close has been reached. Final trade acceptance still follows the authoritative market state.',
      tone: 'warning',
    };
  }

  const duration = formatDuration(remainingMs);
  const critical = remainingMs <= 10 * 60 * 1000;
  const soon = remainingMs <= 60 * 60 * 1000;
  const today = remainingMs <= 24 * 60 * 60 * 1000;

  return {
    available: true,
    isPastClose: false,
    remainingMs,
    headline: critical ? `Closing in ${duration}` : soon ? `Closes in ${duration}` : `Trading closes in ${duration}`,
    compact: `Closes ${duration}`,
    absolute,
    detail: critical
      ? 'Very little trading time remains. Review the order carefully before submitting.'
      : soon
        ? 'This market is in its final trading hour.'
        : today
          ? 'This market closes within the next 24 hours.'
          : `Scheduled close: ${absolute}.`,
    tone: critical ? 'danger' : soon || today ? 'warning' : 'brand',
  };
}

export function formatRelativeTimestamp(value: string | null | undefined, now: number) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;

  const delta = now - parsed;
  if (delta < 0) return 'just now';
  if (delta < 10_000) return 'just now';
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 60 * 60_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 24 * 60 * 60_000) return `${Math.floor(delta / (60 * 60_000))}h ago`;
  if (delta < 7 * 24 * 60 * 60_000) return `${Math.floor(delta / (24 * 60 * 60_000))}d ago`;

  return new Date(parsed).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainderSeconds = seconds % 60;

  if (days >= 7) return `${days}d`;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes >= 10) return `${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainderSeconds}s`;
  return `${remainderSeconds}s`;
}

function formatElapsed(timestamp: number, now: number) {
  const elapsed = Math.max(0, now - timestamp);
  const duration = formatDuration(elapsed);
  return duration === '0s' ? 'just now' : `${duration} ago`;
}
