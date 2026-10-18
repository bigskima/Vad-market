import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useLiveNow } from '@/hooks/use-live-now';
import { useVadTheme } from '@/providers/theme-provider';
import { getMarketPriceHistory, getPeerPoolStakeHistory, type MarketPriceHistoryPoint } from '@/services/market-api';

type RangeKey = '1D' | '1W' | 'ALL';
type SeriesKey = 'YES' | 'NO' | 'BOTH';

const ranges: { value: RangeKey; label: string; ms: number | null }[] = [
  { value: '1D', label: '1D', ms: 24 * 60 * 60 * 1000 },
  { value: '1W', label: '1W', ms: 7 * 24 * 60 * 60 * 1000 },
  { value: 'ALL', label: 'All', ms: null },
];

export function MarketPriceHistoryPanel({ instrumentId, liquidityMode }: { instrumentId: string; liquidityMode?: string | null }) {
  const theme = useVadTheme();
  const poolMode = String(liquidityMode ?? '').toUpperCase().includes('POOL');
  const density = useProductDensity();
  const now = useLiveNow();
  const [points, setPoints] = useState<MarketPriceHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [range, setRange] = useState<RangeKey>('ALL');
  const [series, setSeries] = useState<SeriesKey>('YES');
  const [plotWidth, setPlotWidth] = useState(0);
  const [selectedTimestamp, setSelectedTimestamp] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setLoading(true);
      setFailed(false);
      setSelectedTimestamp(null);
      return poolMode
        ? getPeerPoolStakeHistory(instrumentId, 120)
        : getMarketPriceHistory(instrumentId, 240);
    }).then((result) => {
      if (!active || !result) return;
      setPoints([...result].sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at)));
    }).catch(() => {
      if (active) setFailed(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [instrumentId, poolMode]);

  const visiblePoints = useMemo(() => {
    const selected = ranges.find((item) => item.value === range);
    if (!selected?.ms || points.length === 0) return points;
    const cutoff = now - selected.ms;
    return points.filter((point) => Date.parse(point.observed_at) >= cutoff);
  }, [points, range, now]);

  const yesValues = useMemo(() => makeSeries(visiblePoints, 'YES'), [visiblePoints]);
  const noValues = useMemo(() => makeSeries(visiblePoints, 'NO'), [visiblePoints]);
  const selectedValues = series === 'YES' ? yesValues : series === 'NO' ? noValues : [...yesValues, ...noValues];
  const latestYes = yesValues[yesValues.length - 1]?.value;
  const latestNo = noValues[noValues.length - 1]?.value;
  const firstSelected = (series === 'NO' ? noValues : yesValues)[0]?.value;
  const lastSelected = (series === 'NO' ? noValues : yesValues).slice(-1)[0]?.value;
  const change = firstSelected != null && lastSelected != null ? (lastSelected - firstSelected) * 100 : null;
  const chartHeight = density.compact ? 116 : 142;
  const horizontalInset = 34;
  const usableWidth = Math.max(0, plotWidth - horizontalInset - 6);
  const allPrices = selectedValues.map((point) => point.value);
  const min = allPrices.length ? Math.max(0, Math.floor((Math.min(...allPrices) * 100 - 5) / 5) * 5 / 100) : 0;
  const max = allPrices.length ? Math.min(1, Math.ceil((Math.max(...allPrices) * 100 + 5) / 5) * 5 / 100) : 1;
  const span = Math.max(0.1, max - min);
  const timeStart = visiblePoints.length ? Date.parse(visiblePoints[0].observed_at) : 0;
  const timeEnd = visiblePoints.length ? Date.parse(visiblePoints[visiblePoints.length - 1].observed_at) : timeStart;
  const timeSpan = Math.max(1, timeEnd - timeStart);
  const selectedAt = selectedTimestamp != null && selectedTimestamp >= timeStart && selectedTimestamp <= timeEnd
    ? selectedTimestamp
    : null;

  function coordinates(values: { at: number; value: number }[]) {
    return values.map((point) => ({
      x: timeEnd === timeStart ? usableWidth / 2 : ((point.at - timeStart) / timeSpan) * usableWidth,
      y: chartHeight - 12 - ((point.value - min) / span) * (chartHeight - 24),
      value: point.value,
      at: point.at,
    }));
  }

  const yesCoords = coordinates(yesValues);
  const noCoords = coordinates(noValues);
  const renderYes = series === 'YES' || series === 'BOTH';
  const renderNo = series === 'NO' || series === 'BOTH';
  const selectedYes = selectedAt == null ? null : nearestHistoryPoint(visiblePoints, 'YES', selectedAt);
  const selectedNo = selectedAt == null ? null : nearestHistoryPoint(visiblePoints, 'NO', selectedAt);
  const selectedYesCoord = selectedAt == null ? null : nearestCoordinate(yesCoords, selectedAt);
  const selectedNoCoord = selectedAt == null ? null : nearestCoordinate(noCoords, selectedAt);
  const cursorX = selectedAt == null
    ? null
    : timeEnd === timeStart ? usableWidth / 2 : ((selectedAt - timeStart) / timeSpan) * usableWidth;

  function inspectAt(x: number) {
    if (usableWidth <= 0 || visiblePoints.length === 0) return;
    const ratio = Math.max(0, Math.min(1, x / usableWidth));
    const targetAt = timeStart + ratio * timeSpan;
    const source = series === 'YES'
      ? visiblePoints.filter((point) => point.outcome_code.toUpperCase() === 'YES')
      : series === 'NO'
        ? visiblePoints.filter((point) => point.outcome_code.toUpperCase() === 'NO')
        : visiblePoints;
    const nearestAt = nearestHistoryTimestamp(source, targetAt);
    if (nearestAt != null) setSelectedTimestamp(nearestAt);
  }

  return (
    <VadCard variant="surface" style={{ gap: density.compact ? 7 : 9, padding: density.compact ? 8 : 11 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <VadText variant="bodyStrong">{poolMode ? 'Pool split history' : 'Price history'}</VadText>
          <VadText variant="caption" tone="secondary">{poolMode ? 'Recorded YES / NO share over time' : 'Recorded executions · latest 240 fills'}</VadText>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <VadText variant="caption" tone="tertiary">LATEST</VadText>
          <VadText variant="bodyStrong" style={{ color: series === 'NO' ? theme.colors.no : theme.colors.yes }}>
            {series === 'NO'
              ? formatPercent(latestNo)
              : series === 'BOTH'
                ? `Y ${formatPercent(latestYes)} · N ${formatPercent(latestNo)}`
                : formatPercent(latestYes)}
          </VadText>
        </View>
      </View>

      {points.length > 0 && !loading && !failed ? <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
        {(['YES', 'NO', 'BOTH'] as SeriesKey[]).map((item) => {
          const active = series === item;
          const tint = item === 'NO' ? theme.colors.no : theme.colors.yes;
          return (
            <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setSeries(item)}
              style={{ borderRadius: 8, borderWidth: 1, borderColor: active ? tint : theme.colors.border, backgroundColor: active ? (item === 'NO' ? theme.colors.noSoft : theme.colors.yesSoft) : theme.colors.surface, paddingHorizontal: 8, paddingVertical: 4 }}>
              <VadText variant="caption" style={{ color: active ? tint : theme.colors.textSecondary, fontWeight: '600' }}>{item === 'BOTH' ? 'YES + NO' : item}</VadText>
            </Pressable>
          );
        })}
        <View style={{ flex: 1 }} />
        {ranges.map((item) => {
          const active = range === item.value;
          return (
            <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => { setRange(item.value); setSelectedTimestamp(null); }}
              style={{ borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, backgroundColor: active ? theme.colors.brandSoft : 'transparent' }}>
              <VadText variant="caption" tone={active ? 'brand' : 'tertiary'}>{item.label}</VadText>
            </Pressable>
          );
        })}
      </View> : null}

      {failed ? (
        <View style={{ borderRadius: 9, backgroundColor: theme.colors.surfaceMuted, paddingHorizontal: 9, paddingVertical: 8 }}>
          <VadText variant="caption" tone="secondary">Price history unavailable right now.</VadText>
        </View>
      ) : loading ? (
        <View style={{ height: chartHeight, justifyContent: 'center', gap: 8 }}>
          <View style={{ height: 1, backgroundColor: theme.colors.border }} />
          <View style={{ height: 1, backgroundColor: theme.colors.border }} />
          <View style={{ height: 1, backgroundColor: theme.colors.border }} />
          <VadText variant="caption" tone="tertiary">Loading executed prices…</VadText>
        </View>
      ) : visiblePoints.length === 0 || (series === 'YES' && yesValues.length === 0) || (series === 'NO' && noValues.length === 0) || (series === 'BOTH' && yesValues.length === 0 && noValues.length === 0) ? (
        <View style={{ borderRadius: 9, backgroundColor: theme.colors.surfaceMuted, paddingHorizontal: 9, paddingVertical: 8 }}>
          <VadText variant="caption" tone="secondary">{points.length === 0 ? 'No recorded history yet. This chart appears after real market activity is recorded.' : 'No trades in this range. Choose a wider range.'}</VadText>
        </View>
      ) : (
        <View onLayout={(event) => setPlotWidth(event.nativeEvent.layout.width)} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <View style={{ width: 30, height: chartHeight, justifyContent: 'space-between', alignItems: 'flex-end', paddingVertical: 3 }}>
              {[max, max - span / 3, max - (span * 2) / 3, min].map((value) => (
                <VadText key={value.toFixed(3)} variant="caption" tone="tertiary" style={{ fontSize: 9, lineHeight: 11 }}>{Math.round(value * 100)}%</VadText>
              ))}
            </View>
            <View
              accessibilityLabel="Interactive chart. Touch or drag to inspect recorded market prices."
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={(event) => inspectAt(event.nativeEvent.locationX)}
              onResponderMove={(event) => inspectAt(event.nativeEvent.locationX)}
              style={{ flex: 1, height: chartHeight, overflow: 'hidden' }}
            >
              {[0, 1, 2, 3].map((line) => (
                <View key={line} style={{ position: 'absolute', left: 0, right: 0, top: (chartHeight - 12) * line / 3 + 4, height: 1, backgroundColor: theme.colors.border, opacity: 0.7 }} />
              ))}
              {plotWidth > 0 && renderYes ? <LineSeries points={yesCoords} color={theme.colors.yes} /> : null}
              {plotWidth > 0 && renderNo ? <LineSeries points={noCoords} color={theme.colors.no} /> : null}
              {cursorX != null ? <View pointerEvents="none" style={{ position: 'absolute', left: cursorX, top: 4, bottom: 8, width: 1, backgroundColor: theme.colors.textTertiary, opacity: 0.9 }} /> : null}
              {selectedYesCoord && renderYes ? <View pointerEvents="none" style={{ position: 'absolute', left: selectedYesCoord.x - 4, top: selectedYesCoord.y - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.yes, borderWidth: 2, borderColor: theme.colors.surface }} /> : null}
              {selectedNoCoord && renderNo ? <View pointerEvents="none" style={{ position: 'absolute', left: selectedNoCoord.x - 4, top: selectedNoCoord.y - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.no, borderWidth: 2, borderColor: theme.colors.surface }} /> : null}
            </View>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 34 }}>
            <VadText variant="caption" tone="tertiary" style={{ fontSize: 9 }}>{formatTime(visiblePoints[0]?.observed_at)}</VadText>
            <VadText variant="caption" tone="tertiary" style={{ fontSize: 9 }}>{formatTime(visiblePoints[visiblePoints.length - 1]?.observed_at)}</VadText>
          </View>
        </View>
      )}

      {selectedAt != null ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 9, backgroundColor: theme.colors.surfaceMuted }}>
          <View style={{ flex: 1, minWidth: 120, gap: 2 }}>
            <VadText variant="caption" tone="tertiary">NEAREST RECORDED VALUES</VadText>
            <VadText variant="caption" tone="secondary">{formatTime(new Date(selectedAt).toISOString())}</VadText>
          </View>
          {renderYes && selectedYes ? <VadText variant="caption" style={{ color: theme.colors.yes, fontWeight: '700' }}>{poolMode ? 'YES share' : 'YES'} {formatPercent(clamp(Number(selectedYes.price)))} · {formatTime(selectedYes.observed_at)}</VadText> : null}
          {renderNo && selectedNo ? <VadText variant="caption" style={{ color: theme.colors.no, fontWeight: '700' }}>{poolMode ? 'NO share' : 'NO'} {formatPercent(clamp(Number(selectedNo.price)))} · {formatTime(selectedNo.observed_at)}</VadText> : null}
        </View>
      ) : null}

      {points.length > 0 && !loading && !failed ? <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <LegendDot color={theme.colors.yes} label={poolMode ? "YES stake" : "YES price"} />
          <LegendDot color={theme.colors.no} label={poolMode ? "NO stake" : "NO price"} />
        </View>
        <VadText variant="caption" tone={change == null ? 'tertiary' : change >= 0 ? 'yes' : 'no'}>{change == null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(1)} pts`}</VadText>
      </View> : null}
    </VadCard>
  );
}

function nearestHistoryTimestamp(points: MarketPriceHistoryPoint[], targetAt: number) {
  let nearestAt: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const at = Date.parse(point.observed_at);
    if (!Number.isFinite(at)) continue;
    const distance = Math.abs(at - targetAt);
    if (distance < nearestDistance) {
      nearestAt = at;
      nearestDistance = distance;
    }
  }
  return nearestAt;
}

function nearestHistoryPoint(points: MarketPriceHistoryPoint[], outcome: 'YES' | 'NO', targetAt: number) {
  let nearest: MarketPriceHistoryPoint | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const point of points) {
    if (point.outcome_code.toUpperCase() !== outcome) continue;
    const at = Date.parse(point.observed_at);
    if (!Number.isFinite(at)) continue;
    const distance = Math.abs(at - targetAt);
    if (distance < nearestDistance) {
      nearest = point;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function nearestCoordinate(points: { at: number; x: number; y: number; value: number }[], targetAt: number) {
  let nearest: { at: number; x: number; y: number; value: number } | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const distance = Math.abs(point.at - targetAt);
    if (distance < nearestDistance) {
      nearest = point;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function makeSeries(points: MarketPriceHistoryPoint[], outcome: 'YES' | 'NO') {
  const actualPoints = points
    .filter((point) => point.outcome_code.toUpperCase() === outcome)
    .map((point) => ({ at: Date.parse(point.observed_at), value: clamp(Number(point.price)) }))
    .filter((point) => Number.isFinite(point.at) && Number.isFinite(point.value));
  if (actualPoints.length <= 80) return actualPoints;
  const sampled = Array.from({ length: 80 }, (_, index) => actualPoints[Math.round(index * (actualPoints.length - 1) / 79)]);
  return sampled.filter((point, index) => index === 0 || point.at !== sampled[index - 1]?.at || point.value !== sampled[index - 1]?.value);
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function formatPercent(value: number | undefined) {
  return value == null ? '—' : `${Math.round(value * 100)}%`;
}

function formatTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <VadText variant="caption" tone="secondary">{label}</VadText>
    </View>
  );
}

function LineSeries({ points, color }: { points: { x: number; y: number }[]; color: string }) {
  if (points.length === 1) {
    return <View style={{ position: 'absolute', left: points[0].x, top: points[0].y, width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />;
  }
  return (
    <>
      {points.slice(1).map((point, index) => {
        const previous = points[index];
        const dx = point.x - previous.x;
        const dy = point.y - previous.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        return (
          <View key={`${index}-${point.x}`} style={{ position: 'absolute', left: (previous.x + point.x) / 2 - length / 2, top: (previous.y + point.y) / 2 - 1.25, width: length, height: 2, borderRadius: 2, backgroundColor: color, transform: [{ rotate: `${angle}rad` }] }} />
        );
      })}
      {points.map((point, index) => (
        <View key={`point-${index}`} style={{ position: 'absolute', left: point.x - 2.5, top: point.y - 2.5, width: 4, height: 4, borderRadius: 2, backgroundColor: color, borderWidth: 1, borderColor: color }} />
      ))}
    </>
  );
}
