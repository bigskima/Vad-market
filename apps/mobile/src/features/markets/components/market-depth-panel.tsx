import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getMarketOrderBook,
  type MarketOrderBook,
  type MarketOrderBookLevel,
} from '@/services/market-api';

export function MarketDepthPanel({ instrumentId }: { instrumentId: string }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [book, setBook] = useState<MarketOrderBook | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let firstLoad = true;
    const loadBook = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      if (firstLoad) setLoading(true);
      try {
        const next = await getMarketOrderBook(instrumentId);
        if (active) {
          setBook(next);
          setFailed(false);
        }
      } catch {
        if (active) setFailed(true);
      } finally {
        inFlight = false;
        if (active && firstLoad) {
          firstLoad = false;
          setLoading(false);
        }
      }
    };
    void Promise.resolve().then(loadBook);
    const interval = setInterval(() => void loadBook(), 15_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [instrumentId]);

  const yes = (book?.yesBids ?? []).slice(0, 4);
  const no = (book?.noBids ?? []).slice(0, 4);
  const hasLevels = yes.length > 0 || no.length > 0;
  const maxQuantity = Math.max(
    1,
    ...yes.map((level) => Number(level.quantity) || 0),
    ...no.map((level) => Number(level.quantity) || 0),
  );

  return (
    <VadCard variant="surface" style={{ gap: 10, padding: density.compact ? 10 : 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <VadText variant="bodyStrong">Order book</VadText>
          <VadText variant="caption" tone="secondary">Current bids</VadText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.colors.surfaceRaised }}>
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.yes }} />
          <VadText variant="caption" tone="secondary">Depth</VadText>
        </View>
      </View>

      {failed ? (
        <VadText variant="caption" tone="secondary">Can't load order book.</VadText>
      ) : loading || !book ? (
        <View style={{ height: 54, justifyContent: 'center' }}>
          <VadText variant="caption" tone="tertiary">Loading current bids…</VadText>
        </View>
      ) : !hasLevels ? (
        <View style={{ gap: 4, paddingVertical: 8 }}>
          <VadText variant="bodyStrong">No resting bids yet</VadText>
          <VadText variant="caption" tone="secondary">Open orders will appear here when traders place them.</VadText>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
              <VadText variant="caption" tone="yes">YES bids</VadText>
              {yes.length ? yes.map((level, index) => (
                <DepthRow key={`yes-${index}-${level.price}`} level={level} maxQuantity={maxQuantity} positive />
              )) : <VadText variant="caption" tone="tertiary">No bids</VadText>}
            </View>
            <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
              <VadText variant="caption" tone="no">NO bids</VadText>
              {no.length ? no.map((level, index) => (
                <DepthRow key={`no-${index}-${level.price}`} level={level} maxQuantity={maxQuantity} positive={false} />
              )) : <VadText variant="caption" tone="tertiary">No bids</VadText>}
            </View>
          </View>
          <VadText variant="caption" tone="tertiary">Bars compare visible quantities only; they are not a price-history chart.</VadText>
        </View>
      )}
    </VadCard>
  );
}

function DepthRow({ level, maxQuantity, positive }: {
  level: MarketOrderBookLevel;
  maxQuantity: number;
  positive: boolean;
}) {
  const theme = useVadTheme();
  const price = Number(level.price);
  const quantity = Number(level.quantity);
  const ratio = Math.max(0, Math.min(1, (Number.isFinite(quantity) ? quantity : 0) / maxQuantity));
  const tint = positive ? theme.colors.yes : theme.colors.no;
  const formattedPrice = Number.isFinite(price) ? `${Math.round(price * 100)}%` : '—';
  const formattedQuantity = Number.isFinite(quantity)
    ? new Intl.NumberFormat('en', { notation: quantity >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 2 }).format(quantity)
    : '—';

  return (
    <View style={{ gap: 3 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 5 }}>
        <VadText variant="caption" tone={positive ? 'yes' : 'no'}>{formattedPrice}</VadText>
        <VadText variant="caption" tone="secondary">{formattedQuantity}</VadText>
      </View>
      <View style={{ height: 5, borderRadius: 4, overflow: 'hidden', backgroundColor: theme.colors.surfaceMuted, alignItems: positive ? 'flex-start' : 'flex-end' }}>
        <View style={{ height: '100%', width: `${ratio * 100}%`, borderRadius: 4, backgroundColor: tint, opacity: 0.75 }} />
      </View>
    </View>
  );
}
