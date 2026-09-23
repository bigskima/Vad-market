const NGN_REFERENCE = /(?:\bNGN\b|\bnaira\b|₦)/i;

export function normalizeActiveAssetCodes(codes: readonly string[] | null | undefined) {
  return [...new Set((codes ?? []).map((code) => code.trim().toUpperCase()).filter(Boolean))];
}

export function isAssetVisible(assetCode: string | null | undefined, activeAssetCodes: readonly string[]) {
  if (!assetCode) return false;
  return activeAssetCodes.includes(assetCode.trim().toUpperCase());
}

export function filterAssetRows<T extends { asset_code: string }>(
  rows: readonly T[],
  activeAssetCodes: readonly string[],
) {
  return rows.filter((row) => isAssetVisible(row.asset_code, activeAssetCodes));
}

export function filterMarketsByAssets<T extends { asset_code: string }>(
  markets: readonly T[],
  activeAssetCodes: readonly string[],
) {
  return filterAssetRows(markets, activeAssetCodes);
}

export function containsRestrictedAssetReference(
  text: string | null | undefined,
  activeAssetCodes: readonly string[],
) {
  if (!text) return false;
  if (activeAssetCodes.includes('NGN')) return false;
  return NGN_REFERENCE.test(text);
}

export function sanitizeAssistantAssetResponse(
  text: string,
  activeAssetCodes: readonly string[],
) {
  if (!containsRestrictedAssetReference(text, activeAssetCodes)) return text;

  const allowed = activeAssetCodes.length ? activeAssetCodes.join(' and ') : 'the currencies available to your account';
  return `This answer included a currency that is not available for your account, so VAD did not display that financial guidance. Ask again about ${allowed} and I’ll answer using only assets available in your jurisdiction.`;
}

export function isAssetScopedNotificationVisible(
  notification: {
    title: string;
    body: string;
    market_public_id: string | null;
    data: Record<string, unknown>;
  },
  activeAssetCodes: readonly string[],
  visibleMarketIds: ReadonlySet<string>,
) {
  if (notification.market_public_id && !visibleMarketIds.has(notification.market_public_id)) {
    return false;
  }

  const explicitAsset = typeof notification.data.asset_code === 'string'
    ? notification.data.asset_code
    : typeof notification.data.assetCode === 'string'
      ? notification.data.assetCode
      : null;

  if (explicitAsset && !isAssetVisible(explicitAsset, activeAssetCodes)) {
    return false;
  }

  return !containsRestrictedAssetReference(
    `${notification.title}\n${notification.body}`,
    activeAssetCodes,
  );
}

export function isGenericContentVisible(
  parts: readonly (string | null | undefined)[],
  activeAssetCodes: readonly string[],
) {
  return !parts.some((part) => containsRestrictedAssetReference(part, activeAssetCodes));
}
