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
  type OrderStatus,
  type TradeQuote,
} from '@/services/market-api';
import { assetMoney, probability } from '../format';

const SHARE_PRESETS = ['25', '50', '100', '250'] as const;
const SIDES = [
  { value: 'BUY', label: 'Build position' },
  { value: 'SELL', label: 'Reduce position' },
] as const;

type TradeStep = 'prediction' | 'order' | 'review' | 'result';

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
  const [step, setStep] = useState<TradeStep>('prediction');
  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [price, setPrice] = useState(() => priceInput(market.yes_price));
  const [quantity, setQuantity] = useState('100');
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const [working, setWorking] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);

  const tradeReady = canTrade && !capabilityLoading;
  const sandboxInstant = market.liquidity_mode === 'SANDBOX_INSTANT';
  const currentProbability = outcome === 'YES' ? market.yes_price : market.no_price;
  const priceValue = Number(price);
  const quantityValue = Number(quantity);
  const inputValid =
    price.trim().length > 0 &&
    Number.isFinite(priceValue) && priceValue > 0 && priceValue < 1 &&
    Number.isFinite(quantityValue) && quantityValue > 0;

  const estimatedNotional = useMemo(
    () => assetMoney(
      (Number.isFinite(priceValue) ? priceValue : 0) *
        (Number.isFinite(quantityValue) ? quantityValue : 0),
      market.asset_code,
    ),
    [market.asset_code, priceValue, quantityValue],
  );

  function resetDownstream() {
    setQuote(null);
    setQuoteError(null);
    setPlaceError(null);
    setOrderStatus(null);
  }

  function chooseOutcome(next: 'YES' | 'NO') {
    if (!tradeReady || working) return;
    setOutcome(next);
    setPrice(priceInput(next === 'YES' ? market.yes_price : market.no_price));
    resetDownstream();
  }

  function chooseQuantity(next: string) {
    if (!tradeReady || working) return;
    setQuantity(next);
    resetDownstream();
  }

  async function prepareReview() {
    if (!tradeReady || working || !inputValid) return;
    setWorking(true);
    setQuoteError(null);
    setPlaceError(null);
    try {
      const nextQuote = await quoteTrade({
        instrumentPublicId: market.instrument_public_id,
        outcomeCode: outcome,
        side,
        price: priceValue,
        quantity: quantityValue,
      });
      setQuote(nextQuote);
      setStep('review');
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
      const status = await placeOrder(quote);
      setOrderStatus(status);
      setStep('result');
      await onPlaced();
    } catch (error) {
      setPlaceError(error instanceof Error ? error.message : 'We could not place this order. Please try again.');
    } finally {
      setWorking(false);
    }
  }

  function startAgain() {
    resetDownstream();
    setStep('prediction');
  }

  return (
    <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
      <TradeStepRail step={step} />

      {capabilityLoading ? (
        <InlineMessage tone="warning" title="Checking trading availability" body={runtimeCapabilityReason('CAPABILITIES_LOADING')} />
      ) : !canTrade ? (
        <InlineMessage tone="warning" title="Trading unavailable" body={runtimeCapabilityReason(tradeReason, 'Trading is not available for your account right now.')} />
      ) : null}

      {step === 'prediction' ? (
        <VadCard variant="raised" style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: 3 }}>
            <VadText variant="caption" tone="brand">STEP 1 · YOUR VIEW</VadText>
            <VadText variant="title">What do you think happens?</VadText>
            <VadText variant="caption" tone="secondary">
              Pick an outcome first. You will set the amount and review every figure before anything is placed.
            </VadText>
          </View>

          {sandboxInstant ? (
            <VadCard variant="brand" style={{ gap: 3 }}>
              <VadChip label="TNGN SANDBOX" tone="brand" />
              <VadText variant="bodyStrong">Instant test liquidity is on.</VadText>
              <VadText variant="caption" tone="secondary">
                Eligible BUY orders can become test positions immediately. TNGN is synthetic and has no cash value.
              </VadText>
            </VadCard>
          ) : null}

          <View accessibilityRole="radiogroup" style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
            <OutcomeChoice
              active={outcome === 'YES'}
              label="YES"
              title="I think it will happen"
              value={probability(market.yes_price)}
              tone="yes"
              disabled={!tradeReady || working}
              onPress={() => chooseOutcome('YES')}
            />
            <OutcomeChoice
              active={outcome === 'NO'}
              label="NO"
              title="I think it will not happen"
              value={probability(market.no_price)}
              tone="no"
              disabled={!tradeReady || working}
              onPress={() => chooseOutcome('NO')}
            />
          </View>

          <VadButton
            label={`Continue with ${outcome}`}
            disabled={!tradeReady || working}
            onPress={() => setStep('order')}
          />
        </VadCard>
      ) : null}

      {step === 'order' ? (
        <VadCard variant="raised" style={{ gap: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, gap: 3 }}>
              <VadText variant="caption" tone="brand">STEP 2 · ORDER</VadText>
              <VadText variant="title">Set your position.</VadText>
              <VadText variant="caption" tone="secondary">
                Your {outcome} view is selected. Choose how you want to trade and how many shares.
              </VadText>
            </View>
            <VadChip label={outcome} tone={outcome === 'YES' ? 'yes' : 'no'} />
          </View>

          <VadSegmentedControl
            value={side}
            options={SIDES}
            onChange={(next) => {
              if (!tradeReady || working) return;
              setSide(next);
              resetDownstream();
            }}
          />

          {sandboxInstant && side === 'BUY' ? (
            <InlineMessage
              tone="brand"
              title="Instant sandbox execution"
              body={`TNGN test liquidity is available around ${probability(market.reference_price ?? currentProbability)}. A valid BUY can create your position immediately.`}
            />
          ) : sandboxInstant && side === 'SELL' ? (
            <InlineMessage
              tone="warning"
              title="Sell orders still use the order book"
              body="Instant sandbox liquidity applies to building test positions. Reducing a position still waits for a compatible buyer."
            />
          ) : null}

          <View style={{ flexDirection: density.width >= 620 ? 'row' : 'column', gap: theme.spacing.sm }}>
            <View style={{ flex: 1 }}>
              <VadInput
                label={`Limit price · ${market.asset_code}`}
                hint="Enter a price above 0 and below 1 per share."
                value={price}
                editable={tradeReady && !working}
                onChangeText={(value) => { setPrice(value); resetDownstream(); }}
                keyboardType="decimal-pad"
                placeholder="0.50"
                error={price.length > 0 && (!Number.isFinite(priceValue) || priceValue <= 0 || priceValue >= 1) ? 'Price must be above 0 and below 1.' : undefined}
              />
            </View>
            <View style={{ flex: 1 }}>
              <VadInput
                label="Shares"
                hint="Use a preset or enter a quantity."
                value={quantity}
                editable={tradeReady && !working}
                onChangeText={(value) => { setQuantity(value); resetDownstream(); }}
                keyboardType="decimal-pad"
                placeholder="100"
                error={quantity.length > 0 && (!Number.isFinite(quantityValue) || quantityValue <= 0) ? 'Shares must be greater than 0.' : undefined}
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

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <MiniMetric label="Outcome" value={outcome} />
            <MiniMetric label="Estimated order" value={inputValid ? estimatedNotional : '—'} />
            <MiniMetric label="Currency" value={market.asset_code} />
          </View>

          {quoteError ? <InlineMessage tone="danger" title="Trade review unavailable" body={quoteError} /> : null}

          <View style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
            <VadButton label="Back" variant="secondary" onPress={() => setStep('prediction')} style={{ flex: 1 }} />
            <VadButton
              label="Review trade"
              loading={working}
              disabled={!tradeReady || working || !inputValid}
              onPress={() => void prepareReview()}
              style={{ flex: 1.4 }}
            />
          </View>
        </VadCard>
      ) : null}

      {step === 'review' && quote ? (
        <VadCard variant="brand" style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: 3 }}>
            <VadText variant="caption" tone="brand">STEP 3 · REVIEW</VadText>
            <VadText variant="title">Confirm before placing.</VadText>
            <VadText variant="caption" tone="secondary">
              Nothing has been placed yet. Check your outcome, amount, fees and possible payout.
            </VadText>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <VadChip label={outcome} tone={outcome === 'YES' ? 'yes' : 'no'} />
            <VadChip label={quote.side} tone="brand" />
            <VadChip label={market.asset_code} />
            {sandboxInstant ? <VadChip label="SANDBOX" tone="brand" /> : null}
          </View>

          <View style={{ gap: 2 }}>
            <QuoteLine label="Order value" value={assetMoney(quote.notional, market.asset_code)} />
            <QuoteLine label="Price per share" value={assetMoney(quote.price, market.asset_code)} />
            <QuoteLine label="Shares" value={Number(quote.quantity).toLocaleString()} />
            <QuoteLine label="Fee if matched later" value={assetMoney(quote.makerFee, market.asset_code)} />
            <QuoteLine label="Fee if matched immediately" value={assetMoney(quote.takerFee, market.asset_code)} />
            {quote.side === 'BUY' ? (
              <QuoteLine label="Maximum amount held" value={assetMoney(quote.maximumCashReservation, market.asset_code)} />
            ) : (
              <QuoteLine label="Shares available" value={String(quote.availableSharesToSell)} />
            )}
            <QuoteLine label="Payout before fees if correct" value={assetMoney(quote.potentialGrossSettlement, market.asset_code)} />
          </View>

          {sandboxInstant ? (
            <InlineMessage
              tone="brand"
              title="Sandbox only"
              body="TNGN is test money. This validates VAD matching, positions, resolution and settlement without moving real NGN."
            />
          ) : null}

          {placeError ? <InlineMessage tone="danger" title="Order not placed" body={placeError} /> : null}

          <View style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
            <VadButton
              label="Edit order"
              variant="secondary"
              disabled={working}
              onPress={() => { setStep('order'); setPlaceError(null); }}
              style={{ flex: 1 }}
            />
            <VadButton
              label="Place order"
              loading={working}
              disabled={!tradeReady || working}
              onPress={() => void execute()}
              style={{ flex: 1.4 }}
            />
          </View>
        </VadCard>
      ) : null}

      {step === 'result' && orderStatus ? (
        <TradeResult
          status={orderStatus}
          sandboxInstant={sandboxInstant}
          onPortfolio={() => router.push('/portfolio')}
          onAgain={startAgain}
        />
      ) : null}
    </View>
  );
}

function TradeStepRail({ step }: { step: TradeStep }) {
  const theme = useVadTheme();
  const steps: { key: TradeStep; label: string }[] = [
    { key: 'prediction', label: 'Predict' },
    { key: 'order', label: 'Order' },
    { key: 'review', label: 'Review' },
    { key: 'result', label: 'Done' },
  ];
  const current = steps.findIndex((item) => item.key === step);

  return (
    <VadCard variant="muted" style={{ paddingVertical: 10, gap: 7 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {steps.map((item, index) => {
          const complete = index < current;
          const active = index === current;
          return (
            <View key={item.key} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: active ? 24 : 18,
                  height: active ? 24 : 18,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: complete ? theme.colors.yesSoft : active ? theme.colors.brandSoft : theme.colors.surface,
                  borderWidth: 1,
                  borderColor: complete ? theme.colors.yes : active ? theme.colors.brandPrimary : theme.colors.border,
                }}
              >
                <VadText variant="caption" tone={complete ? 'yes' : active ? 'brand' : 'tertiary'}>{index + 1}</VadText>
              </View>
              {index < steps.length - 1 ? (
                <View style={{ height: 1, flex: 1, backgroundColor: index < current ? theme.colors.yes : theme.colors.border, marginHorizontal: 5 }} />
              ) : null}
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {steps.map((item, index) => (
          <VadText key={item.key} variant="caption" tone={index === current ? 'brand' : index < current ? 'yes' : 'tertiary'} style={{ flex: 1 }}>
            {item.label}
          </VadText>
        ))}
      </View>
    </VadCard>
  );
}

function TradeResult({
  status,
  sandboxInstant,
  onPortfolio,
  onAgain,
}: {
  status: OrderStatus;
  sandboxInstant: boolean;
  onPortfolio: () => void;
  onAgain: () => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const filled = status.status === 'FILLED' && status.positionCreated;
  const partial = status.status === 'PARTIALLY_FILLED';

  return (
    <VadCard variant={filled ? 'brand' : 'raised'} style={{ gap: theme.spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, gap: 3 }}>
          <VadText variant="caption" tone={filled ? 'yes' : 'brand'}>STEP 4 · {filled ? 'POSITION CONFIRMED' : 'ORDER PLACED'}</VadText>
          <VadText variant="title">{filled ? 'Your position is live.' : partial ? 'Your order partially matched.' : 'Your order is waiting for a match.'}</VadText>
          <VadText variant="caption" tone="secondary">
            {filled
              ? sandboxInstant
                ? 'VAD used isolated TNGN sandbox liquidity to create this test position immediately.'
                : 'Your order matched and the resulting position is now in Portfolio.'
              : 'The order is valid, but unmatched shares remain open. VAD will keep the order in the book while the market is tradable.'}
          </VadText>
        </View>
        <VadChip label={status.outcomeCode} tone={status.outcomeCode === 'YES' ? 'yes' : 'no'} />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        <MiniMetric label="Status" value={friendlyStatus(status.status)} />
        <MiniMetric label="Filled" value={`${Number(status.filledQuantity).toLocaleString()} / ${Number(status.quantity).toLocaleString()}`} />
        <MiniMetric label="Position" value={Number(status.positionQuantity).toLocaleString()} />
      </View>

      {sandboxInstant && filled ? (
        <InlineMessage
          tone="brand"
          title="End-to-end sandbox path connected"
          body="This TNGN position can now move through market close, oracle resolution, automatic settlement and payout history without real money."
        />
      ) : null}

      <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm, gap: 2 }}>
        <VadText variant="caption" tone="tertiary">ORDER REFERENCE</VadText>
        <VadText variant="bodyStrong" selectable>{status.orderId}</VadText>
      </View>

      <View style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
        <VadButton label="Open Portfolio" onPress={onPortfolio} style={{ flex: 1.4 }} />
        <VadButton label="Trade again" variant="secondary" onPress={onAgain} style={{ flex: 1 }} />
      </View>
    </VadCard>
  );
}

function OutcomeChoice({
  active,
  label,
  title,
  value,
  tone,
  disabled = false,
  onPress,
}: {
  active: boolean;
  label: string;
  title: string;
  value: string;
  tone: 'yes' | 'no';
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const color = tone === 'yes' ? theme.colors.yes : theme.colors.no;
  const background = tone === 'yes' ? theme.colors.yesSoft : theme.colors.noSoft;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active, disabled }}
      accessibilityLabel={`${label}: ${title}, current price ${value}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: density.compact ? 110 : 130,
        borderWidth: active ? 2 : 1,
        borderColor: active ? color : theme.colors.border,
        backgroundColor: active ? background : theme.colors.surface,
        borderRadius: theme.radius.lg,
        padding: density.compact ? 14 : 18,
        justifyContent: 'space-between',
        gap: 8,
        opacity: disabled ? 0.5 : pressed ? 0.74 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <VadChip label={label} tone={tone} />
        <VadText variant="heading" tone={tone}>{value}</VadText>
      </View>
      <VadText variant="bodyStrong">{title}</VadText>
      <VadText variant="caption" tone="secondary">Select {label}, then continue to set your order.</VadText>
    </Pressable>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: 105, minWidth: 0, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, padding: 10, gap: 1 }}>
      <VadText variant="caption" tone="tertiary" numberOfLines={1}>{label}</VadText>
      <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{value}</VadText>
    </View>
  );
}

function QuoteLine({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ minHeight: 42, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      <VadText variant="caption" tone="secondary" style={{ flex: 1 }}>{label}</VadText>
      <VadText variant="bodyStrong" numberOfLines={1}>{value}</VadText>
    </View>
  );
}

function InlineMessage({ tone, title, body }: { tone: 'warning' | 'danger' | 'brand'; title: string; body: string }) {
  const theme = useVadTheme();
  const borderColor = tone === 'danger' ? theme.colors.danger : tone === 'warning' ? theme.colors.warning : theme.colors.brandPrimary;
  const backgroundColor = tone === 'danger' ? theme.colors.noSoft : tone === 'warning' ? theme.colors.warningSoft : theme.colors.brandSoft;
  return (
    <View style={{ width: '100%', borderWidth: 1, borderColor, backgroundColor, borderRadius: theme.radius.md, padding: theme.spacing.sm, gap: 2 }}>
      <VadText variant="bodyStrong">{title}</VadText>
      <VadText variant="caption" tone="secondary">{body}</VadText>
    </View>
  );
}

function friendlyStatus(status: string) {
  return status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
