import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadInput } from '@/components/ui/vad-input';
import { VadSegmentedControl } from '@/components/ui/vad-segmented-control';
import { VadText } from '@/components/ui/vad-text';
import { runtimeCapabilityReason } from '@/features/policy/runtime-capability-copy';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import {
  placeOrder,
  quoteTrade,
  type MarketCatalogItem,
  type TradeQuote,
} from '@/services/market-api';
import { assetMoney, probability } from '../format';

const SHARE_PRESETS = ['25', '50', '100', '250'] as const;
const SIDES = [
  { value: 'BUY', label: 'Buy' },
  { value: 'SELL', label: 'Sell' },
] as const;

function priceInput(value: number | string | null) {
  if (value == null || value === '') return '';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : '';
}

export function TradingTicket({
  market,
  canTrade,
  tradeReason,
  capabilityLoading = false,
  onPlaced,
}: {
  market: MarketCatalogItem;
  canTrade: boolean;
  tradeReason?: string;
  capabilityLoading?: boolean;
  onPlaced: () => Promise<void>;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const splitReview = density.width >= 860;
  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [price, setPrice] = useState(() => priceInput(market.yes_price));
  const [quantity, setQuantity] = useState('100');
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [working, setWorking] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);

  const tradeReady = canTrade && !capabilityLoading;

  function clearReviewState() {
    setQuote(null);
    setQuoteError(null);
    setPlaceError(null);
    setPlacedOrderId(null);
  }

  function chooseOutcome(next: 'YES' | 'NO') {
    if (!tradeReady || working) return;
    setOutcome(next);
    setPrice(priceInput(next === 'YES' ? market.yes_price : market.no_price));
    clearReviewState();
  }

  function chooseQuantity(next: string) {
    if (!tradeReady || working) return;
    setQuantity(next);
    clearReviewState();
  }

  async function preview() {
    if (!tradeReady || working || !inputValid) return;
    setWorking(true);
    setQuoteError(null);
    setPlaceError(null);
    setPlacedOrderId(null);

    try {
      setQuote(await quoteTrade({
        instrumentPublicId: market.instrument_public_id,
        outcomeCode: outcome,
        side,
        price: Number(price),
        quantity: Number(quantity),
      }));
    } catch (error) {
      setQuote(null);
      setQuoteError(error instanceof Error ? error.message : 'We could not prepare this trade. Check the order details and try again.');
    } finally {
      setWorking(false);
    }
  }

  async function execute() {
    if (!tradeReady || working || !quote) return;
    setWorking(true);
    setPlaceError(null);

    try {
      const orderId = await placeOrder(quote);
      setPlacedOrderId(orderId);
      setQuote(null);
      await onPlaced();
    } catch (error) {
      setPlaceError(error instanceof Error ? error.message : 'We could not place this order. Please try again.');
    } finally {
      setWorking(false);
    }
  }

  const currentProbability = outcome === 'YES' ? market.yes_price : market.no_price;
  const priceValue = Number(price);
  const quantityValue = Number(quantity);
  const inputValid =
    price.trim().length > 0 &&
    Number.isFinite(priceValue) && priceValue > 0 && priceValue <= 1 &&
    Number.isFinite(quantityValue) && quantityValue > 0;

  const estimatedNotional = useMemo(
    () => assetMoney(
      (Number.isFinite(priceValue) ? priceValue : 0) *
        (Number.isFinite(quantityValue) ? quantityValue : 0),
      market.asset_code,
    ),
    [market.asset_code, priceValue, quantityValue],
  );

  if (placedOrderId) {
    return (
      <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
        <VadCard variant="raised" style={{ borderColor: theme.colors.yes, gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
          <VadChip label="ORDER PLACED" tone="yes" />
          <View style={{ gap: 2 }}>
            <VadText variant="heading">Your order is live.</VadText>
            <VadText variant="caption" tone="secondary">
              It may fill when matching orders become available. You can track its progress from Portfolio.
            </VadText>
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm, gap: 1 }}>
            <VadText variant="caption" tone="tertiary">ORDER REFERENCE</VadText>
            <VadText variant="bodyStrong" selectable>{placedOrderId}</VadText>
          </View>
        </VadCard>
        <View style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
          <VadButton label="Open Portfolio" onPress={() => router.push('/portfolio')} style={{ flex: 1 }} />
          <VadButton label="Trade again" variant="secondary" disabled={!tradeReady} onPress={() => setPlacedOrderId(null)} style={{ flex: 1 }} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: splitReview && quote ? 'row' : 'column', alignItems: 'flex-start', gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
      <VadCard variant="raised" style={{ width: '100%', flex: splitReview && quote ? 1.15 : undefined, gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'center' }}>
          <View style={{ flex: 1, gap: 1 }}>
            <VadText variant="caption" tone="brand">TRADE · {market.asset_code}</VadText>
            <VadText variant="heading">{side === 'BUY' ? 'Build a position' : 'Reduce a position'}</VadText>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 0 }}>
            <VadText variant="caption" tone="secondary">{outcome} price</VadText>
            <VadText variant="heading" tone={currentProbability == null ? 'tertiary' : outcome === 'YES' ? 'yes' : 'no'}>{probability(currentProbability)}</VadText>
          </View>
        </View>

        {capabilityLoading ? (
          <InlineMessage tone="warning" title="Checking trading availability" body={runtimeCapabilityReason('CAPABILITIES_LOADING')} />
        ) : !canTrade ? (
          <InlineMessage tone="warning" title="Trading unavailable" body={runtimeCapabilityReason(tradeReason, 'Trading is not available for your account right now.')} />
        ) : null}

        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 6 }}>
          <OutcomeChoice active={outcome === 'YES'} label="YES" value={probability(market.yes_price)} tone="yes" available={market.yes_price != null} disabled={!tradeReady || working} onPress={() => chooseOutcome('YES')} />
          <OutcomeChoice active={outcome === 'NO'} label="NO" value={probability(market.no_price)} tone="no" available={market.no_price != null} disabled={!tradeReady || working} onPress={() => chooseOutcome('NO')} />
        </View>

        <VadSegmentedControl
          value={side}
          options={SIDES}
          onChange={(next) => {
            if (!tradeReady || working) return;
            setSide(next);
            clearReviewState();
          }}
        />

        <View style={{ flexDirection: density.width >= 620 ? 'row' : 'column', gap: theme.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <VadInput
              label={`Price per share · ${market.asset_code}`}
              hint={tradeReady ? (currentProbability == null ? 'There is no current trade price yet. Enter the price you are willing to trade at, above 0 and up to 1.' : 'Enter the price you are willing to trade at, above 0 and up to 1 per share.') : 'Available when trading is enabled.'}
              value={price}
              editable={tradeReady && !working}
              onChangeText={(value) => { setPrice(value); clearReviewState(); }}
              keyboardType="decimal-pad"
              placeholder="0.64"
              error={tradeReady && price.length > 0 && (!Number.isFinite(priceValue) || priceValue <= 0 || priceValue > 1) ? 'Enter a price above 0 and no more than 1.' : undefined}
            />
          </View>
          <View style={{ flex: 1 }}>
            <VadInput
              label="Shares"
              hint={tradeReady ? 'Use a preset or enter a quantity.' : 'Available when trading is enabled.'}
              value={quantity}
              editable={tradeReady && !working}
              onChangeText={(value) => { setQuantity(value); clearReviewState(); }}
              keyboardType="decimal-pad"
              placeholder="100"
              error={tradeReady && quantity.length > 0 && (!Number.isFinite(quantityValue) || quantityValue <= 0) ? 'Shares must be greater than 0.' : undefined}
            />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {SHARE_PRESETS.map((preset) => (
            <VadChip
              key={preset}
              label={preset}
              selected={quantity === preset}
              tone={quantity === preset ? 'brand' : 'neutral'}
              onPress={() => chooseQuantity(preset)}
              disabled={!tradeReady || working}
            />
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <MiniMetric label="Estimated order value" value={inputValid ? estimatedNotional : '—'} />
          <MiniMetric label="Currency" value={market.asset_code} />
        </View>

        {quoteError ? <InlineMessage tone="danger" title="Trade review unavailable" body={quoteError} /> : null}

        <VadButton
          label={quote ? 'Refresh review' : 'Review trade'}
          loading={working || capabilityLoading}
          disabled={!tradeReady || working || !inputValid}
          onPress={() => void preview()}
        />
      </VadCard>

      {quote ? (
        <VadCard variant="brand" style={{ width: '100%', flex: splitReview ? 0.85 : undefined, gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
          <View style={{ gap: 1 }}>
            <VadText variant="caption" tone="brand">ORDER REVIEW · {market.asset_code}</VadText>
            <VadText variant="heading">Check before placing.</VadText>
            <VadText variant="caption" tone="secondary">Review these figures carefully. They apply to this order if you place it now.</VadText>
          </View>

          <QuoteLine label="Order value" value={assetMoney(quote.notional, market.asset_code)} />
          <QuoteLine label="Fee if matched later" value={assetMoney(quote.makerFee, market.asset_code)} />
          <QuoteLine label="Fee if matched immediately" value={assetMoney(quote.takerFee, market.asset_code)} />
          {quote.side === 'BUY' ? (
            <QuoteLine label="Maximum amount held" value={assetMoney(quote.maximumCashReservation, market.asset_code)} />
          ) : (
            <QuoteLine label="Shares available" value={String(quote.availableSharesToSell)} />
          )}
          <QuoteLine label="Payout before fees if correct" value={assetMoney(quote.potentialGrossSettlement, market.asset_code)} />

          {placeError ? <InlineMessage tone="danger" title="Order not placed" body={placeError} /> : null}
          {!tradeReady ? <InlineMessage tone="warning" title="Trading unavailable" body={runtimeCapabilityReason(tradeReason)} /> : null}

          <VadButton label="Place order" loading={working} disabled={!tradeReady || working} onPress={() => void execute()} />
          <VadButton label="Edit order" variant="ghost" size="small" disabled={working} onPress={() => { setQuote(null); setPlaceError(null); }} />
        </VadCard>
      ) : null}
    </View>
  );
}

function OutcomeChoice({ active, label, value, tone, available, disabled = false, onPress }: { active: boolean; label: string; value: string; tone: 'yes' | 'no'; available: boolean; disabled?: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const color = tone === 'yes' ? theme.colors.yes : theme.colors.no;
  const background = tone === 'yes' ? theme.colors.yesSoft : theme.colors.noSoft;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active, disabled }}
      accessibilityLabel={`${label} outcome at ${available ? value : 'no current price'}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: density.compact ? 50 : 56,
        borderWidth: 1,
        borderColor: active ? color : theme.colors.border,
        backgroundColor: active ? background : theme.colors.surface,
        borderRadius: theme.radius.md,
        paddingHorizontal: density.compact ? 10 : 12,
        paddingVertical: density.compact ? 7 : 9,
        gap: 0,
        opacity: disabled ? 0.5 : pressed ? 0.72 : 1,
      })}
    >
      <VadText variant="caption" tone={available ? tone : 'tertiary'}>{label}</VadText>
      <VadText variant={density.compact ? 'bodyStrong' : 'heading'} tone={available ? tone : 'tertiary'}>{value}</VadText>
    </Pressable>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 0 }}>
      <VadText variant="caption" tone="tertiary">{label}</VadText>
      <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{value}</VadText>
    </View>
  );
}

function QuoteLine({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  return (
    <View style={{ minHeight: density.compact ? 36 : 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      <VadText variant="caption" tone="secondary" style={{ flex: 1 }}>{label}</VadText>
      <VadText variant="bodyStrong" numberOfLines={1}>{value}</VadText>
    </View>
  );
}

function InlineMessage({ tone, title, body }: { tone: 'warning' | 'danger'; title: string; body: string }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const danger = tone === 'danger';
  return (
    <View accessibilityRole="alert" style={{ borderLeftWidth: 3, borderLeftColor: danger ? theme.colors.danger : theme.colors.warning, backgroundColor: danger ? theme.colors.noSoft : theme.colors.warningSoft, padding: density.compact ? 9 : 11, gap: 2, borderRadius: theme.radius.sm }}>
      <VadText variant="caption" tone={tone}>{title.toUpperCase()}</VadText>
      <VadText variant="caption" tone="secondary">{body}</VadText>
    </View>
  );
}
