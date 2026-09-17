import type { MarketCatalogItem } from '@/services/market-api';

export type EffectiveMarketStage =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'OPEN'
  | 'CLOSED'
  | 'RESOLVING'
  | 'SETTLEMENT_PENDING'
  | 'SETTLED'
  | 'VOIDED'
  | 'SUSPENDED';

function timestamp(value?: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatCountdown(targetMs: number | null, nowMs: number) {
  if (targetMs == null) return null;
  const delta = Math.max(0, targetMs - nowMs);
  const totalSeconds = Math.ceil(delta / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export function exactTime(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString();
}

export function getMarketTiming(market: MarketCatalogItem, nowMs: number) {
  const backendStatus = market.status.toUpperCase();
  const resolutionStatus = market.resolution_status?.toUpperCase() ?? null;
  const opensAt = timestamp(market.opens_at);
  const closesAt = timestamp(market.closes_at);
  const resolvesAt = timestamp(market.resolves_after);
  const resolutionFinal = resolutionStatus === 'FINAL' || resolutionStatus === 'VOID';

  let stage: EffectiveMarketStage;
  if (backendStatus === 'SETTLED') stage = 'SETTLED';
  else if (backendStatus === 'VOID' || backendStatus === 'VOIDED' || resolutionStatus === 'VOID') stage = 'VOIDED';
  else if (backendStatus === 'SETTLEMENT_PENDING' || resolutionFinal) stage = 'SETTLEMENT_PENDING';
  else if (backendStatus === 'RESOLVING' || backendStatus === 'RESOLVED') stage = 'RESOLVING';
  else if (backendStatus === 'CLOSED') stage = resolvesAt != null && nowMs >= resolvesAt ? 'RESOLVING' : 'CLOSED';
  else if ((backendStatus === 'OPEN' || backendStatus === 'ACTIVE') && resolvesAt != null && nowMs >= resolvesAt) stage = 'RESOLVING';
  else if ((backendStatus === 'OPEN' || backendStatus === 'ACTIVE') && closesAt != null && nowMs >= closesAt) stage = 'CLOSED';
  else if ((backendStatus === 'OPEN' || backendStatus === 'ACTIVE' || backendStatus === 'SCHEDULED') && opensAt != null && nowMs < opensAt) stage = 'SCHEDULED';
  else if (backendStatus === 'OPEN' || backendStatus === 'ACTIVE') stage = 'OPEN';
  else if (backendStatus === 'SUSPENDED') stage = 'SUSPENDED';
  else if (backendStatus === 'DRAFT') stage = 'DRAFT';
  else if (backendStatus === 'SCHEDULED') stage = 'SCHEDULED';
  else stage = 'CLOSED';

  const tradingOpen =
    stage === 'OPEN' &&
    !resolutionFinal &&
    (opensAt == null || nowMs >= opensAt) &&
    (closesAt == null || nowMs < closesAt);

  const closeCountdown = closesAt != null && nowMs < closesAt ? formatCountdown(closesAt, nowMs) : null;
  const openCountdown = opensAt != null && nowMs < opensAt ? formatCountdown(opensAt, nowMs) : null;
  const resolutionCountdown = resolvesAt != null && nowMs < resolvesAt ? formatCountdown(resolvesAt, nowMs) : null;

  const statusLabel =
    stage === 'OPEN' ? 'Open'
      : stage === 'SCHEDULED' ? 'Scheduled'
        : stage === 'CLOSED' ? 'Closed'
          : stage === 'RESOLVING' ? 'Result processing'
            : stage === 'SETTLEMENT_PENDING' ? 'Payout processing'
              : stage === 'SETTLED' ? 'Completed'
                : stage === 'VOIDED' ? 'Cancelled'
                  : stage === 'SUSPENDED' ? 'Paused'
                    : 'Draft';

  const primaryTiming =
    stage === 'SCHEDULED' && openCountdown ? `Opens in ${openCountdown}`
      : stage === 'OPEN' && closeCountdown ? `Closes in ${closeCountdown}`
        : stage === 'CLOSED' && resolutionCountdown ? `Result check in ${resolutionCountdown}`
          : stage === 'CLOSED' ? 'Trading closed'
            : stage === 'RESOLVING' ? 'Result processing'
              : stage === 'SETTLEMENT_PENDING' ? 'Payout processing'
                : stage === 'SETTLED' ? 'Settlement complete'
                  : stage === 'VOIDED' ? 'Market cancelled'
                    : statusLabel;

  return {
    stage,
    backendStatus,
    resolutionStatus,
    resolutionOutcome: market.resolution_outcome ?? null,
    resolutionFinal,
    tradingOpen,
    opensAt,
    closesAt,
    resolvesAt,
    openCountdown,
    closeCountdown,
    resolutionCountdown,
    statusLabel,
    primaryTiming,
  };
}
