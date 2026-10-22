/**
 * Negative threshold-touch outcomes require sampled history spanning the target
 * window with no gap larger than the configured evidence tolerance.
 */
export function hasContinuousTimestampCoverage(
  timestamps: number[],
  startMs: number,
  endMs: number,
  maximumGapSeconds: number,
): boolean {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return false;
  if (!Number.isFinite(maximumGapSeconds) || maximumGapSeconds <= 0) return false;
  const maximumGapMs = maximumGapSeconds * 1000;
  const points = timestamps
    .filter((value) => Number.isFinite(value) && value >= startMs && value <= endMs)
    .sort((a, b) => a - b);
  if (!points.length) return false;
  if (points[0] > startMs + maximumGapMs) return false;
  if (points[points.length - 1] < endMs - maximumGapMs) return false;
  for (let index = 1; index < points.length; index += 1) {
    if (points[index] - points[index - 1] > maximumGapMs) return false;
  }
  return true;
}
