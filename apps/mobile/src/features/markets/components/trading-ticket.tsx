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
  placePoolStake,
  quotePoolStake,
  quoteTrade,
  type MarketCatalogItem,
  type OrderStatus,
  type PoolQuote,
  type PoolStakeStatus,
  type TradeQuote,
} from '@/services/market-api';
import { assetMoney, probability } from '../format';

const SHARE_PRESETS = ['25', '50', '100', '250'] as const;
const SIDES = [
  { value: 'BUY', label: 'Build position' },
  { value: 'SELL', label: 'Reduce position' },
] as const;

type TradeStep = 'prediction' | 'order' | 'review' | 'result';
type CompleteTradeQuote = TradeQuote & {
  estimatedSettlementFee?: number | string;
  estimatedNetSettlement?: number | string;
};

type TicketProps = {
  market: MarketCatalogItem;
  canTrade: boolean;
  tradeReason?: string;
  capabilityLoading?: boolean;
  onPlaced: () => Promise<void>;
};

export function TradingTicket(props: TicketProps) {
  if (props.market.liquidity_mode === 'POOL') return <PoolTradingTicket {...props} />;
  return <OrderBookTradingTicket {...props} />;
}

function PoolTradingTicket({ market, canTrade, tradeReason, capabilityLoading = false, onPlaced }: TicketProps) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [step, setStep] = useState<TradeStep>('prediction');
  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<PoolQuote | null>(null);
  const [stakeStatus, setStakeStatus] = useState<PoolStakeStatus | null>(null);
  const [working, setWorking] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);

  const tradeReady = canTrade && !capabilityLoading;
  const amountValue = Number(amount);
  const inputValid = amount.trim().length > 0 && Number.isFinite(amountValue) && amountValue > 0;

  function resetDownstream() {
    setQuote(null);
    setStakeStatus(null);
    setQuoteError(null);
    setPlaceError(null);
  }

  function chooseOutcome(next: 'YES' | 'NO') {
    if (!tradeReady || working) return;
    setOutcome(next);
    resetDownstream();
  }

  async function prepareReview() {
    if (!tradeReady || working || !inputValid) return;
    setWorking(true);
    setQuoteError(null);
    setPlaceError(null);
    try {
      const next = await quotePoolStake({
        instrumentPublicId: market.instrument_public_id,
        outcomeCode: outcome,
        amount: amountValue,
      });
      setQuote(next);
      setStep('review');
    } catch (error) {
      setQuote(null);
      setQuoteError(error instanceof Error ? error.message : 'We could not prepare this prediction right now.');
    } finally {
      setWorking(false);
    }
  }

  async function execute() {
    if (!tradeReady || working || !quote) return;
    setWorking(true);
    setPlaceError(null);
    try {
      const status = await placePoolStake(quote);
      setStakeStatus(status);
      setStep('result');
      await onPlaced();
    } catch (error) {
      setPlaceError(error instanceof Error ? error.message : 'We could not commit this prediction. Please try again.');
    } finally {
      setWorking(false);
    }
  }

  function startAgain() {
    setStep('prediction');
    setAmount('');
    resetDownstream();
  }

  return (
    <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
      <TradeStepRail step={step} secondLabel="Stake" />
      <CapabilityNotice canTrade={canTrade} capabilityLoading={capabilityLoading} tradeReason={tradeReason} />

      {step === 'prediction' ? (
        <VadCard variant="raised" style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: 3 }}>
            <VadText variant="caption" tone="brand">STEP 1 · YOUR VIEW</VadText>
            <VadText variant="title">What do you think happens?</VadText>
            <VadText variant="caption" tone="secondary">
              Choose YES or NO. Your stake goes into this market’s protected participant pool — VAD does not fund the other side.
            </VadText>
          </View>

          <View accessibilityRole="radiogroup" style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
            <OutcomeChoice active={outcome === 'YES'} label="YES" title="I think it will happen" value={probability(market.yes_price)} tone="yes" disabled={!tradeReady || working} onPress={() => chooseOutcome('YES')} />
            <OutcomeChoice active={outcome === 'NO'} label="NO" title="I think it will not happen" value={probability(market.no_price)} tone="no" disabled={!tradeReady || working} onPress={() => chooseOutcome('NO')} />
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            <MiniMetric label="Current pool" value={assetMoney(market.total_volume ?? 0, market.asset_code)} />
            <MiniMetric label="Participants" value={String(Number(market.participant_count ?? 0))} />
            <MiniMetric label="Funding" value="Peer funded" />
          </View>

          <VadButton label={`Continue with ${outcome}`} disabled={!tradeReady || working} onPress={() => setStep('order')} />
        </VadCard>
      ) : null}

      {step === 'order' ? (
        <VadCard variant="raised" style={{ gap: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, gap: 3 }}>
              <VadText variant="caption" tone="brand">STEP 2 · STAKE</VadText>
              <VadText variant="title">Choose your stake.</VadText>
              <VadText variant="caption" tone="secondary">
                Nothing is committed on this step. VAD calculates the stake, platform fee, wallet debit and estimated winning settlement before you confirm.
              </VadText>
            </View>
            <VadChip label={outcome} tone={outcome === 'YES' ? 'yes' : 'no'} />
          </View>

          <VadInput
            label={`Stake amount · ${market.asset_code}`}
            hint="Enter the amount you want to commit. The backend enforces the market minimum."
            value={amount}
            editable={tradeReady && !working}
            onChangeText={(value) => { setAmount(value); resetDownstream(); }}
            keyboardType="decimal-pad"
            placeholder="0"
            error={amount.length > 0 && !inputValid ? 'Enter an amount greater than 0.' : undefined}
          />

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <MiniMetric label="Outcome" value={outcome} />
            <MiniMetric label="Stake" value={inputValid ? assetMoney(amountValue, market.asset_code) : '—'} />
            <MiniMetric label="Currency" value={market.asset_code} />
          </View>

          {quoteError ? <InlineMessage tone="danger" title="Prediction review unavailable" body={quoteError} /> : null}

          <View style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
            <VadButton label="Back" variant="secondary" onPress={() => setStep('prediction')} style={{ flex: 1 }} />
            <VadButton label="Review prediction & fees" loading={working} disabled={!tradeReady || working || !inputValid} onPress={() => void prepareReview()} style={{ flex: 1.4 }} />
          </View>
        </VadCard>
      ) : null}

      {step === 'review' && quote ? (
        <VadCard variant="brand" style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: 3 }}>
            <VadText variant="caption" tone="brand">STEP 3 · MONEY & FEE PREVIEW · NOTHING CHARGED YET</VadText>
            <VadText variant="title">Confirm your prediction.</VadText>
            <VadText variant="caption" tone="secondary">
              Every current VAD charge is shown below before commitment. Estimated payout can still change as other users add stakes before the market closes.
            </VadText>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <VadChip label={quote.outcomeCode} tone={quote.outcomeCode === 'YES' ? 'yes' : 'no'} />
            <VadChip label="PEER POOL" tone="brand" />
            <VadChip label={market.asset_code} />
          </View>

          <View style={{ gap: 2 }}>
            <QuoteLine label="Your stake" value={assetMoney(quote.amount, market.asset_code)} />
            <QuoteLine label="VAD trading fee" value={assetMoney(quote.tradingFee, market.asset_code)} />
            <QuoteLine label="Total wallet debit now" value={assetMoney(quote.maximumCashDebit, market.asset_code)} />
            <QuoteLine label="Pool after your stake" value={assetMoney(quote.poolTotalAfter, market.asset_code)} />
            <QuoteLine label={`${quote.outcomeCode} pool after`} value={assetMoney(quote.outcomePoolAfter, market.asset_code)} />
            <QuoteLine label="Current implied share" value={probability(quote.impliedProbability)} />
            <QuoteLine label="Estimated gross payout if correct" value={assetMoney(quote.estimatedGrossPayout, market.asset_code)} />
            <QuoteLine label="Estimated VAD settlement fee if you win" value={assetMoney(quote.estimatedSettlementFee, market.asset_code)} />
            <QuoteLine label="Estimated net payout if you win" value={assetMoney(quote.estimatedNetPayout, market.asset_code)} />
          </View>

          <InlineMessage tone="brand" title="Fee transparency" body="The trading fee is charged with this stake. The settlement fee is only an estimate now and is charged from an eligible winning payout at settlement. VAD shows both before you commit." />
          <InlineMessage tone="brand" title="Peer-funded payout" body="Winning payouts can only come from the participant pool for this market. VAD does not inject company money to complete the payout." />
          {placeError ? <InlineMessage tone="danger" title="Prediction not committed" body={placeError} /> : null}

          <View style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
            <VadButton label="Edit stake" variant="secondary" disabled={working} onPress={() => { setStep('order'); setPlaceError(null); }} style={{ flex: 1 }} />
            <VadButton label="Confirm & commit prediction" loading={working} disabled={!tradeReady || working} onPress={() => void execute()} style={{ flex: 1.4 }} />
          </View>
        </VadCard>
      ) : null}

      {step === 'result' && stakeStatus ? (
        <VadCard variant="brand" style={{ gap: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, gap: 3 }}>
              <VadText variant="caption" tone="yes">STEP 4 · STAKE COMMITTED</VadText>
              <VadText variant="title">Your prediction is live.</VadText>
              <VadText variant="caption" tone="secondary">
                Your funds moved from your available wallet balance into this market’s protected peer pool. Result and settlement will update automatically.
              </VadText>
            </View>
            <VadChip label={stakeStatus.outcomeCode} tone={stakeStatus.outcomeCode === 'YES' ? 'yes' : 'no'} />
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            <MiniMetric label="Stake" value={assetMoney(stakeStatus.amount, market.asset_code)} />
            <MiniMetric label="VAD trading fee" value={assetMoney(stakeStatus.tradingFee, market.asset_code)} />
            <MiniMetric label="Status" value="Committed" />
          </View>

          <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm, gap: 2 }}>
            <VadText variant="caption" tone="tertiary">STAKE REFERENCE</VadText>
            <VadText variant="bodyStrong" selectable>{stakeStatus.stakeId}</VadText>
          </View>

          <View style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
            <VadButton label="Open Portfolio" onPress={() => router.push('/portfolio')} style={{ flex: 1.4 }} />
            <VadButton label="Predict again" variant="secondary" onPress={startAgain} style={{ flex: 1 }} />
          </View>
        </VadCard>
      ) : null}
    </View>
  );
}

function OrderBookTradingTicket({ market, canTrade, tradeReason, capabilityLoading = false, onPlaced }: TicketProps) {
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
  const priceValue = Number(price);
  const quantityValue = Number(quantity);
  const inputValid = price.trim().length > 0 && Number.isFinite(priceValue) && priceValue > 0 && priceValue < 1 && Number.isFinite(quantityValue) && quantityValue > 0;
  const estimatedNotional = useMemo(() => assetMoney((Number.isFinite(priceValue) ? priceValue : 0) * (Number.isFinite(quantityValue) ? quantityValue : 0), market.asset_code), [market.asset_code, priceValue, quantityValue]);

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

  async function prepareReview() {
    if (!tradeReady || working || !inputValid) return;
    setWorking(true);
    setQuoteError(null);
    try {
      const next = await quoteTrade({ instrumentPublicId: market.instrument_public_id, outcomeCode: outcome, side, price: priceValue, quantity: quantityValue });
      setQuote(next);
      setStep('review');
    } catch (error) {
      setQuoteError(error instanceof Error ? error.message : 'We could not prepare this order right now.');
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

  const completeQuote = quote as CompleteTradeQuote | null;

  return (
    <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
      <TradeStepRail step={step} secondLabel="Order" />
      <CapabilityNotice canTrade={canTrade} capabilityLoading={capabilityLoading} tradeReason={tradeReason} />

      {step === 'prediction' ? (
        <VadCard variant="raised" style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: 3 }}>
            <VadText variant="caption" tone="brand">STEP 1 · YOUR VIEW</VadText>
            <VadText variant="title">Choose an outcome.</VadText>
            <VadText variant="caption" tone="secondary">This market uses the order book. A position exists only when your order actually matches another participant.</VadText>
          </View>
          <View accessibilityRole="radiogroup" style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
            <OutcomeChoice active={outcome === 'YES'} label="YES" title="I think it will happen" value={probability(market.yes_price)} tone="yes" disabled={!tradeReady || working} onPress={() => chooseOutcome('YES')} />
            <OutcomeChoice active={outcome === 'NO'} label="NO" title="I think it will not happen" value={probability(market.no_price)} tone="no" disabled={!tradeReady || working} onPress={() => chooseOutcome('NO')} />
          </View>
          <VadButton label={`Continue with ${outcome}`} disabled={!tradeReady || working} onPress={() => setStep('order')} />
        </VadCard>
      ) : null}

      {step === 'order' ? (
        <VadCard variant="raised" style={{ gap: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, gap: 3 }}>
              <VadText variant="caption" tone="brand">STEP 2 · ORDER</VadText>
              <VadText variant="title">Set your limit order.</VadText>
              <VadText variant="caption" tone="secondary">Choose whether to build or reduce a position, then VAD will preview the order value and every applicable platform fee before placement.</VadText>
            </View>
            <VadChip label={outcome} tone={outcome === 'YES' ? 'yes' : 'no'} />
          </View>

          <VadSegmentedControl value={side} options={SIDES} onChange={(next) => { if (!tradeReady || working) return; setSide(next); resetDownstream(); }} />

          <View style={{ flexDirection: density.width >= 620 ? 'row' : 'column', gap: theme.spacing.sm }}>
            <View style={{ flex: 1 }}>
              <VadInput label={`Limit price · ${market.asset_code}`} hint="Above 0 and below 1 per share." value={price} editable={tradeReady && !working} onChangeText={(value) => { setPrice(value); resetDownstream(); }} keyboardType="decimal-pad" placeholder="0.50" error={price.length > 0 && (!Number.isFinite(priceValue) || priceValue <= 0 || priceValue >= 1) ? 'Price must be above 0 and below 1.' : undefined} />
            </View>
            <View style={{ flex: 1 }}>
              <VadInput label="Shares" hint="Use a preset or enter a quantity." value={quantity} editable={tradeReady && !working} onChangeText={(value) => { setQuantity(value); resetDownstream(); }} keyboardType="decimal-pad" placeholder="100" error={quantity.length > 0 && (!Number.isFinite(quantityValue) || quantityValue <= 0) ? 'Shares must be greater than 0.' : undefined} />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {SHARE_PRESETS.map((preset) => <VadChip key={preset} label={preset} selected={quantity === preset} tone={quantity === preset ? 'brand' : 'neutral'} onPress={() => { setQuantity(preset); resetDownstream(); }} disabled={!tradeReady || working} />)}
          </View>

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <MiniMetric label="Outcome" value={outcome} />
            <MiniMetric label="Order value" value={inputValid ? estimatedNotional : '—'} />
            <MiniMetric label="Currency" value={market.asset_code} />
          </View>
          {quoteError ? <InlineMessage tone="danger" title="Order review unavailable" body={quoteError} /> : null}
          <View style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
            <VadButton label="Back" variant="secondary" onPress={() => setStep('prediction')} style={{ flex: 1 }} />
            <VadButton label="Review order & fees" loading={working} disabled={!tradeReady || working || !inputValid} onPress={() => void prepareReview()} style={{ flex: 1.4 }} />
          </View>
        </VadCard>
      ) : null}

      {step === 'review' && quote ? (
        <VadCard variant="brand" style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: 3 }}>
            <VadText variant="caption" tone="brand">STEP 3 · MONEY & FEE PREVIEW · NOTHING PLACED YET</VadText>
            <VadText variant="title">Confirm before placing.</VadText>
            <VadText variant="caption" tone="secondary">An order can remain unmatched. Only filled quantity becomes a real position. Maker/taker treatment depends on how the order fills.</VadText>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <VadChip label={quote.outcomeCode} tone={quote.outcomeCode === 'YES' ? 'yes' : 'no'} />
            <VadChip label={quote.side} tone="brand" />
            <VadChip label="ORDER BOOK" />
          </View>
          <View style={{ gap: 2 }}>
            <QuoteLine label="Order value" value={assetMoney(quote.notional, market.asset_code)} />
            <QuoteLine label="Price per share" value={assetMoney(quote.price, market.asset_code)} />
            <QuoteLine label="Shares" value={Number(quote.quantity).toLocaleString()} />
            <QuoteLine label="VAD maker fee if maker" value={assetMoney(quote.makerFee, market.asset_code)} />
            <QuoteLine label="VAD taker fee if taker" value={assetMoney(quote.takerFee, market.asset_code)} />
            {quote.side === 'BUY' ? <QuoteLine label="Maximum VAD fee reserve" value={assetMoney(quote.maximumFeeReserve, market.asset_code)} /> : null}
            {quote.side === 'BUY' ? <QuoteLine label="Maximum wallet amount held" value={assetMoney(quote.maximumCashReservation, market.asset_code)} /> : <QuoteLine label="Shares available to sell" value={String(quote.availableSharesToSell)} />}
            <QuoteLine label="Gross settlement if fully filled and correct" value={assetMoney(quote.potentialGrossSettlement, market.asset_code)} />
            <QuoteLine label="Estimated VAD settlement fee if you win" value={assetMoney(completeQuote?.estimatedSettlementFee ?? 0, market.asset_code)} />
            <QuoteLine label="Estimated net settlement if you win" value={assetMoney(completeQuote?.estimatedNetSettlement ?? quote.potentialGrossSettlement, market.asset_code)} />
          </View>
          <InlineMessage tone="brand" title="Fee transparency" body="VAD reserves up to the displayed trading-fee amount for a BUY. The actual maker/taker fee follows the way each fill executes. The settlement fee applies only to an eligible winning payout and is shown here as an estimate before placement." />
          {placeError ? <InlineMessage tone="danger" title="Order not placed" body={placeError} /> : null}
          <View style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
            <VadButton label="Edit order" variant="secondary" disabled={working} onPress={() => setStep('order')} style={{ flex: 1 }} />
            <VadButton label="Confirm & place order" loading={working} disabled={!tradeReady || working} onPress={() => void execute()} style={{ flex: 1.4 }} />
          </View>
        </VadCard>
      ) : null}

      {step === 'result' && orderStatus ? (
        <VadCard variant={orderStatus.status === 'FILLED' ? 'brand' : 'raised'} style={{ gap: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, gap: 3 }}>
              <VadText variant="caption" tone="brand">STEP 4 · ORDER STATUS</VadText>
              <VadText variant="title">{orderStatus.status === 'FILLED' ? 'Your order matched.' : orderStatus.status === 'PARTIALLY_FILLED' ? 'Your order partially matched.' : 'Your order is waiting for a match.'}</VadText>
              <VadText variant="caption" tone="secondary">Portfolio shows filled positions separately from still-open orders.</VadText>
            </View>
            <VadChip label={orderStatus.outcomeCode} tone={orderStatus.outcomeCode === 'YES' ? 'yes' : 'no'} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            <MiniMetric label="Status" value={friendlyStatus(orderStatus.status)} />
            <MiniMetric label="Filled" value={`${Number(orderStatus.filledQuantity).toLocaleString()} / ${Number(orderStatus.quantity).toLocaleString()}`} />
            <MiniMetric label="Position" value={Number(orderStatus.positionQuantity).toLocaleString()} />
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm, gap: 2 }}>
            <VadText variant="caption" tone="tertiary">ORDER REFERENCE</VadText>
            <VadText variant="bodyStrong" selectable>{orderStatus.orderId}</VadText>
          </View>
          <View style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
            <VadButton label="Open Portfolio" onPress={() => router.push('/portfolio')} style={{ flex: 1.4 }} />
            <VadButton label="Trade again" variant="secondary" onPress={() => { setStep('prediction'); resetDownstream(); }} style={{ flex: 1 }} />
          </View>
        </VadCard>
      ) : null}
    </View>
  );
}

function CapabilityNotice({ canTrade, capabilityLoading, tradeReason }: { canTrade: boolean; capabilityLoading: boolean; tradeReason?: string }) {
  if (capabilityLoading) return <InlineMessage tone="warning" title="Checking trading availability" body={runtimeCapabilityReason('CAPABILITIES_LOADING')} />;
  if (!canTrade) return <InlineMessage tone="warning" title="Trading unavailable" body={runtimeCapabilityReason(tradeReason, 'Trading is not available for your account right now.')} />;
  return null;
}

function TradeStepRail({ step, secondLabel }: { step: TradeStep; secondLabel: string }) {
  const theme = useVadTheme();
  const steps: { key: TradeStep; label: string }[] = [
    { key: 'prediction', label: 'Predict' },
    { key: 'order', label: secondLabel },
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
              <View style={{ width: active ? 24 : 18, height: active ? 24 : 18, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: complete ? theme.colors.yesSoft : active ? theme.colors.brandSoft : theme.colors.surface, borderWidth: 1, borderColor: complete ? theme.colors.yes : active ? theme.colors.brandPrimary : theme.colors.border }}>
                <VadText variant="caption" tone={complete ? 'yes' : active ? 'brand' : 'tertiary'}>{index + 1}</VadText>
              </View>
              {index < steps.length - 1 ? <View style={{ height: 1, flex: 1, backgroundColor: index < current ? theme.colors.yes : theme.colors.border, marginHorizontal: 5 }} /> : null}
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {steps.map((item, index) => <VadText key={item.key} variant="caption" tone={index === current ? 'brand' : index < current ? 'yes' : 'tertiary'} style={{ flex: 1 }}>{item.label}</VadText>)}
      </View>
    </VadCard>
  );
}

function OutcomeChoice({ active, label, title, value, tone, disabled = false, onPress }: { active: boolean; label: string; title: string; value: string; tone: 'yes' | 'no'; disabled?: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const color = tone === 'yes' ? theme.colors.yes : theme.colors.no;
  const background = tone === 'yes' ? theme.colors.yesSoft : theme.colors.noSoft;
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected: active, disabled }} accessibilityLabel={`${label}: ${title}, current share ${value}`} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ flex: 1, minHeight: density.compact ? 110 : 130, borderWidth: active ? 2 : 1, borderColor: active ? color : theme.colors.border, backgroundColor: active ? background : theme.colors.surface, borderRadius: theme.radius.lg, padding: density.compact ? 14 : 18, justifyContent: 'space-between', gap: 8, opacity: disabled ? 0.5 : pressed ? 0.74 : 1 })}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <VadChip label={label} tone={tone} />
        <VadText variant="heading" tone={tone}>{value}</VadText>
      </View>
      <VadText variant="bodyStrong">{title}</VadText>
      <VadText variant="caption" tone="secondary">Select {label}, then continue.</VadText>
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

function priceInput(value: number | string | null) {
  if (value == null || value === '') return '';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : '';
}

function friendlyStatus(status: string) {
  return status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
