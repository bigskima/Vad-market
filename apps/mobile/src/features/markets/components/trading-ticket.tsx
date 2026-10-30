import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadInput } from '@/components/ui/vad-input';
import { VadProgressiveSection } from '@/components/ui/vad-progressive-section';
import { VadSegmentedControl } from '@/components/ui/vad-segmented-control';
import { VadText } from '@/components/ui/vad-text';
import { runtimeCapabilityReason } from '@/features/policy/runtime-capability-copy';
import { userFacingErrorMessage } from '@/lib/user-facing-error';
import { TourTarget } from '@/features/tour/tour-provider';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import {
  listOnchainMarketVenues,
  type OnchainMarketVenue,
} from '@/services/onchain-api';
import {
  cancelPreparedUsdcPrediction,
  prepareUsdcPrediction,
  submitPreparedUsdcPrediction,
  type PreparedUsdcPrediction,
  type SubmittedUsdcPrediction,
} from '@/services/onchain-prediction';
import {
  placeOrder,
  placePoolStake,
  quotePoolStake,
  quoteTrade,
  getMarketTradeRules,
  type MarketTradeRules,
  type MarketCatalogItem,
  type MarketOutcomeSummaryRow,
  type OrderStatus,
  type PoolQuote,
  type PoolStakeStatus,
  type TradeQuote,
} from '@/services/market-api';
import { assetMoney, probability } from '../format';
import { getTemporaryNgnTestCreditStatus, type TemporaryNgnTestCreditStatus } from '@/services/temporary-ngn-test-credit-api';
import { getTemporaryNgnMarketTestingStatus, type TemporaryNgnMarketTestingStatus } from '@/services/temporary-ngn-market-testing-api';

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
  initialOutcome?: string;
  outcomes?: MarketOutcomeSummaryRow[];
};

export function TradingTicket(props: TicketProps) {
  if (props.market.asset_code !== 'NGN' && props.market.asset_code !== 'USDC') {
    return <UnsupportedMarketCurrency />;
  }
  if (props.market.asset_code === 'USDC' && props.market.liquidity_mode !== 'POOL') {
    return <UnsupportedUsdcOrderBook />;
  }
  if (props.market.liquidity_mode === 'POOL') return <PoolTradingTicket {...props} />;
  return <OrderBookTradingTicket {...props} />;
}

function UnsupportedMarketCurrency() {
  const theme = useVadTheme();
  return (
    <VadCard variant="surface" style={{ gap: theme.spacing.sm, padding: theme.spacing.md }}>
      <VadText variant="bodyStrong">Market currency unavailable</VadText>
      <VadText variant="caption" tone="secondary">
        This market cannot accept trades in its current currency. Choose an open market using a currently supported currency.
      </VadText>
    </VadCard>
  );
}

function PoolTradingTicket({ market, canTrade, tradeReason, capabilityLoading = false, onPlaced, initialOutcome, outcomes = [] }: TicketProps) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const isUsdc = market.asset_code === 'USDC';
  const isMultiOutcome = market.market_type === 'MULTI_OUTCOME';
  const [step, setStep] = useState<TradeStep>('prediction');
  const [outcome, setOutcome] = useState<string>(initialOutcome ?? (isMultiOutcome ? outcomes[0]?.outcome_code ?? '' : 'YES'));
  const effectiveOutcome = isMultiOutcome
    ? (outcomes.some((item) => item.outcome_code === outcome) ? outcome : outcomes[0]?.outcome_code ?? '')
    : outcome;
  const selectedOutcome = outcomes.find((item) => item.outcome_code === effectiveOutcome);
  const outcomeLabel = isMultiOutcome ? (selectedOutcome?.outcome_label ?? displayOutcomeCode(effectiveOutcome)) : effectiveOutcome;
  const outcomeTone = effectiveOutcome === 'YES' ? 'yes' : effectiveOutcome === 'NO' ? 'no' : 'neutral';
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<PoolQuote | null>(null);
  const [stakeStatus, setStakeStatus] = useState<PoolStakeStatus | null>(null);
  const [working, setWorking] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [onchainVenues, setOnchainVenues] = useState<OnchainMarketVenue[]>([]);
  const [venuesLoading, setVenuesLoading] = useState(isUsdc);
  const [venueError, setVenueError] = useState<string | null>(null);
  const [selectedChainCode, setSelectedChainCode] = useState('');
  const [preparedUsdc, setPreparedUsdc] = useState<PreparedUsdcPrediction | null>(null);
  const [onchainResult, setOnchainResult] = useState<SubmittedUsdcPrediction | null>(null);
  const [temporaryNgnCredit, setTemporaryNgnCredit] = useState<TemporaryNgnTestCreditStatus | null>(null);

  useEffect(() => {
    let active = true;
    if (market.asset_code !== 'NGN') {
      // Rendering is gated by the current asset, so no synchronous reset is needed.
      return () => { active = false; };
    }
    void getTemporaryNgnTestCreditStatus()
      .then((status) => { if (active) setTemporaryNgnCredit(status?.active ? status : null); })
      .catch(() => { if (active) setTemporaryNgnCredit(null); });
    return () => { active = false; };
  }, [market.asset_code]);

  const hasTemporaryNgnTestCredit = market.asset_code === 'NGN' && temporaryNgnCredit?.active === true;
  // The test credit grants this account a narrow trade-capability exception.
  // Current Nigerian location verification and server market-scope checks still
  // run before quoting/committing; this does not enable NGN trading globally.
  const tradeReady = (canTrade || hasTemporaryNgnTestCredit) && !capabilityLoading;
  const amountValue = Number(amount);
  const inputValid = amount.trim().length > 0 && Number.isFinite(amountValue) && amountValue > 0;
  const selectedVenue = useMemo(
    () => onchainVenues.find((venue) => venue.chain_code === selectedChainCode) ?? onchainVenues[0] ?? null,
    [onchainVenues, selectedChainCode],
  );

  useEffect(() => {
    if (!isUsdc) return;

    let active = true;

    void (async () => {
      await Promise.resolve();
      if (!active) return;

      setVenuesLoading(true);
      setVenueError(null);

      try {
        const rows = await listOnchainMarketVenues(market.instrument_public_id);
        if (!active) return;

        const supported = rows.filter(
          (row) =>
            row.chain_family === 'EVM' &&
            row.evm_chain_id != null &&
            row.token_standard === 'ERC20' &&
            row.protocol_key === 'VAD_SETTLEMENT_V1' &&
            Number(row.protocol_version) === 1,
        );
        setOnchainVenues(supported);
        setSelectedChainCode((current) =>
          supported.some((row) => row.chain_code === current)
            ? current
            : supported[0]?.chain_code ?? '',
        );
      } catch (reason) {
        if (!active) return;
        setOnchainVenues([]);
        setSelectedChainCode('');
        setVenueError(
          userFacingErrorMessage(reason, 'trading', 'Could not load USDC networks. Try again.'),
        );
      } finally {
        if (active) setVenuesLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [isUsdc, market.instrument_public_id]);

  const resetDownstream = useCallback(() => {
    setQuote(null);
    setStakeStatus(null);
    setOnchainResult(null);
    setQuoteError(null);
    setPlaceError(null);
  }, []);

  function chooseOutcome(next: string) {
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
      if (isUsdc) {
        if (!selectedVenue) {
          throw new Error(
            'No VAD USDC settlement network is active for this market and your location yet.',
          );
        }

        const prepared = await prepareUsdcPrediction({
          marketId: market.instrument_public_id,
          outcomeCode: effectiveOutcome,
          amount: amountValue,
          venue: selectedVenue,
        });
        setPreparedUsdc(prepared);
        setQuote(null);
      } else {
        const next = await quotePoolStake({
          instrumentPublicId: market.instrument_public_id,
          outcomeCode: effectiveOutcome,
          amount: amountValue,
        });
        setQuote(next);
        setPreparedUsdc(null);
      }

      setStep('review');
    } catch (error) {
      setQuote(null);
      setPreparedUsdc(null);
      setQuoteError(
        userFacingErrorMessage(error, 'trading', 'Could not review this trade. Try again.'),
      );
    } finally {
      setWorking(false);
    }
  }

  async function execute() {
    if (!tradeReady || working) return;

    if (isUsdc) {
      if (!preparedUsdc) return;

      if (Math.floor(Date.now() / 1000) >= preparedUsdc.expiresAtUnix) {
        const expired = preparedUsdc;
        setPreparedUsdc(null);
        setStep('order');
        setPlaceError(null);
        setQuoteError('This USDC authorization expired. Review the stake again to get a fresh fee authorization.');
        void cancelPreparedUsdcPrediction(expired, 'AUTHORIZATION_EXPIRED_CLIENT').catch(() => undefined);
        return;
      }

      setWorking(true);
      setPlaceError(null);
      try {
        const result = await submitPreparedUsdcPrediction(preparedUsdc);
        setOnchainResult(result);
        setStep('result');
        await onPlaced();
      } catch (error) {
        setPlaceError(
          userFacingErrorMessage(error, 'trading', 'USDC trade not submitted. Check your wallet and try again.'),
        );
      } finally {
        setWorking(false);
      }
      return;
    }

    if (!quote) return;
    setWorking(true);
    setPlaceError(null);
    try {
      const status = await placePoolStake(quote);
      setStakeStatus(status);
      setStep('result');
      await onPlaced();
    } catch (error) {
      setPlaceError(
        userFacingErrorMessage(error, 'trading', 'Could not place your prediction. Try again.'),
      );
    } finally {
      setWorking(false);
    }
  }

  function editStake() {
    const unused = preparedUsdc;
    setPreparedUsdc(null);
    setPlaceError(null);
    setStep('order');

    if (unused) {
      void cancelPreparedUsdcPrediction(unused).catch(() => undefined);
    }
  }

  function startAgain() {
    setStep('prediction');
    setAmount('');
    setPreparedUsdc(null);
    setOnchainResult(null);
    resetDownstream();
  }

  return (
    <View style={{ gap: density.compact ? 10 : 12 }}>
      <TourTarget id="market-trading-ticket"><TradeStepRail step={step} secondLabel="Stake" /></TourTarget>
      <CapabilityNotice canTrade={canTrade || hasTemporaryNgnTestCredit} capabilityLoading={capabilityLoading} tradeReason={tradeReason} />
      {hasTemporaryNgnTestCredit ? (
        <InlineMessage
          tone="warning"
          title="NGN test funds active"
          body="These are test funds, not cash. Verify your Nigeria location to use them. Deposits and withdrawals are disabled. Transfers are limited to eligible test accounts and stay separate from cash NGN."
        />
      ) : null}

      {step === 'prediction' ? (
        <VadCard variant="raised" style={{ gap: 9, padding: 12 }}>
          <View style={{ gap: 3 }}>
            <VadText variant="caption" tone="brand">STEP 1 · YOUR VIEW</VadText>
            <VadText variant="heading">Choose an outcome</VadText>
            <VadText variant="caption" tone="secondary">
              {isMultiOutcome
                ? 'Choose the one named option you expect to win. The result is checked against the published rules.'
                : isUsdc
                  ? 'Select YES or NO. Funds stay self-custodied until you approve.'
                  : 'Select YES or NO. The participant pool funds both sides; VAD does not.'}
            </VadText>
          </View>

          {isMultiOutcome ? (
            outcomes.length ? (
              <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                {outcomes.map((option) => (
                  <View key={option.outcome_code} style={{ width: density.narrow ? '100%' : '48%', minWidth: 0 }}>
                    <OutcomeChoice
                      active={effectiveOutcome === option.outcome_code}
                      label={option.outcome_label}
                      title="Share of the pool"
                      value={option.pool_share == null ? '—' : probability(option.pool_share)}
                      tone="neutral"
                      disabled={!tradeReady || working}
                      onPress={() => chooseOutcome(option.outcome_code)}
                    />
                  </View>
                ))}
              </View>
            ) : (
              <InlineMessage tone="warning" title="Outcomes unavailable" body="Couldn’t load outcomes. Try again." />
            )
          ) : (
            <View accessibilityRole="radiogroup" style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
              <OutcomeChoice active={outcome === 'YES'} label="YES" title="I think it will happen" value={probability(market.yes_price)} tone="yes" disabled={!tradeReady || working} onPress={() => chooseOutcome('YES')} />
              <OutcomeChoice active={outcome === 'NO'} label="NO" title="I think it will not happen" value={probability(market.no_price)} tone="no" disabled={!tradeReady || working} onPress={() => chooseOutcome('NO')} />
            </View>
          )}

          {isUsdc ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
              <MiniMetric label="Settlement" value="On-chain" />
              <MiniMetric label="Asset" value="USDC" />
              <MiniMetric label="Pool data" value="After confirmations" />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
              <MiniMetric label="Current pool" value={assetMoney(market.total_volume ?? 0, market.asset_code)} />
              <MiniMetric label="Participants" value={String(Number(market.participant_count ?? 0))} />
              <MiniMetric label="Funding" value="Peer funded" />
            </View>
          )}

          <VadButton label={`Continue with ${outcomeLabel || "outcome"}`} disabled={!tradeReady || working || !effectiveOutcome} onPress={() => setStep('order')} />
        </VadCard>
      ) : null}

      {step === 'order' ? (
        <VadCard variant="raised" style={{ gap: 9, padding: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, gap: 3 }}>
              <VadText variant="caption" tone="brand">STEP 2 · STAKE</VadText>
              <VadText variant="heading">Stake amount</VadText>
              <VadText variant="caption" tone="secondary">
                {isUsdc
                  ? 'Nothing moves yet. Review the network, fee and authorization before signing.'
                  : 'Nothing is committed yet. Review the stake, fee, debit and estimated payout.'}
              </VadText>
            </View>
            <VadChip label={outcomeLabel} tone={outcomeTone} />
          </View>

          <VadInput
            label={`Stake amount · ${market.asset_code}`}
            hint="Market minimum applies."
            value={amount}
            editable={tradeReady && !working}
            onChangeText={(value) => { setAmount(value); resetDownstream(); }}
            keyboardType="decimal-pad"
            placeholder="0"
            error={amount.length > 0 && !inputValid ? 'Enter an amount greater than 0.' : undefined}
          />

          {isUsdc ? (
            <View style={{ gap: theme.spacing.sm }}>
              <View style={{ gap: 2 }}>
                <VadText variant="caption" tone="tertiary">PAYOUT NETWORK</VadText>
                <VadText variant="caption" tone="secondary">
                  Only eligible networks are shown.
                </VadText>
              </View>

              {venuesLoading ? (
                <InlineMessage tone="warning" title="Checking networks" body="Checking available networks." />
              ) : venueError ? (
                <InlineMessage tone="danger" title="Networks unavailable" body="Could not load USDC networks. Try again." />
              ) : onchainVenues.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {onchainVenues.map((venue) => (
                    <VadChip
                      key={venue.venue_id}
                      label={venue.chain_name}
                      selected={selectedVenue?.venue_id === venue.venue_id}
                      tone={selectedVenue?.venue_id === venue.venue_id ? 'brand' : 'neutral'}
                      onPress={() => {
                        if (working) return;
                        setSelectedChainCode(venue.chain_code);
                        setQuoteError(null);
                        setPlaceError(null);
                      }}
                      disabled={working}
                    />
                  ))}
                </View>
              ) : (
                <InlineMessage
                  tone="warning"
                  title="USDC trading isn’t available yet"
                  body="No supported network is available for your location. You can’t place a trade until one is enabled."
                />
              )}
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <MiniMetric label="Outcome" value={outcomeLabel} />
            <MiniMetric label="Stake" value={inputValid ? assetMoney(amountValue, market.asset_code) : '—'} />
            <MiniMetric label={isUsdc ? 'Network' : 'Currency'} value={isUsdc ? selectedVenue?.chain_name ?? '—' : market.asset_code} />
          </View>

          {quoteError ? (
            <View style={{ gap: theme.spacing.xs }}>
              <InlineMessage
                tone="danger"
                title={quoteError.startsWith('Turn on NGN test trading in Account') ? 'NGN test trading is off' : 'Trade review unavailable'}
                body={quoteError}
              />
              {quoteError.startsWith('Turn on NGN test trading in Account') ? (
                <VadButton label="Open Account" variant="secondary" onPress={() => router.push('/account')} />
              ) : null}
            </View>
          ) : null}

          <View style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
            <VadButton label="Back" variant="secondary" onPress={() => setStep('prediction')} style={{ flex: 1 }} />
            <VadButton
              label="Review trade & fees"
              loading={working}
              disabled={!tradeReady || working || !inputValid || (isUsdc && (!selectedVenue || venuesLoading))}
              onPress={() => void prepareReview()}
              style={{ flex: 1.4 }}
            />
          </View>
        </VadCard>
      ) : null}

      {step === 'review' && isUsdc && preparedUsdc ? (
        <VadCard variant="brand" style={{ gap: 10, padding: 12 }}>
          <View style={{ gap: 3 }}>
            <VadText variant="caption" tone="brand">STEP 3 · REVIEW</VadText>
            <VadText variant="heading">Confirm your prediction.</VadText>
            <VadText variant="caption" tone="secondary">Nothing is committed until you confirm in your wallet.</VadText>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <VadChip label={outcomeLabel} tone={outcomeTone} />
            <VadChip label="PEER POOL" tone="brand" />
            <VadChip label="USDC" />
            <VadChip label={preparedUsdc.chainCode} />
          </View>

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <MiniMetric label="Your stake" value={assetMoney(preparedUsdc.collateralAmount, 'USDC')} />
            <MiniMetric label="VAD fee" value={assetMoney(preparedUsdc.tradingFee, 'USDC')} />
          </View>
          <View style={{ borderRadius: theme.radius.md, padding: theme.spacing.sm, gap: 5, backgroundColor: theme.colors.surface }}>
            <VadText variant="caption" tone="tertiary">MAXIMUM WALLET DEBIT</VadText>
            <VadText variant={density.phone ? 'title' : 'display'} numberOfLines={1} adjustsFontSizeToFit>{assetMoney(preparedUsdc.maximumWalletDebit, 'USDC')}</VadText>
            <VadText variant="caption" tone="secondary">Network: {selectedVenue?.chain_name ?? preparedUsdc.chainCode}</VadText>
          </View>

          <InlineMessage
            tone="warning"
            title="USDC trade limits"
            body="Pool estimates aren't ready; payout caps are off. Network fees are separate, and stake and exposure limits still apply."
          />

          <VadProgressiveSection
            title="Full cost breakdown"
            eyebrow="ADVANCED DETAILS"
            description="Market limits, total stake, wallet confirmation and payout estimates."
            icon="activity"
            summary={<VadText variant="caption" tone="tertiary">View all quote details</VadText>}
          >
            {preparedUsdc.authorization.maxEntryStake != null ? <QuoteLine label="Maximum single stake" value={assetMoney(preparedUsdc.authorization.maxEntryStake, 'USDC')} /> : null}
            {preparedUsdc.authorization.existingUserExposure != null ? <QuoteLine label="Existing stake across this market" value={assetMoney(preparedUsdc.authorization.existingUserExposure, 'USDC')} /> : null}
            {preparedUsdc.authorization.projectedUserExposure != null ? <QuoteLine label="Combined user stake after this entry" value={assetMoney(preparedUsdc.authorization.projectedUserExposure, 'USDC')} /> : null}
            {preparedUsdc.authorization.maxUserMarketStake != null ? <QuoteLine label="Maximum combined user stake" value={assetMoney(preparedUsdc.authorization.maxUserMarketStake, 'USDC')} /> : null}
            {preparedUsdc.authorization.projectedMarketPool != null ? <QuoteLine label="Projected market pool across venues" value={assetMoney(preparedUsdc.authorization.projectedMarketPool, 'USDC')} /> : null}
            {preparedUsdc.authorization.maxMarketPool != null ? <QuoteLine label="Maximum market pool" value={assetMoney(preparedUsdc.authorization.maxMarketPool, 'USDC')} /> : null}
            <QuoteLine label="Wallet" value={shortReference(preparedUsdc.walletAddress)} />
            <QuoteLine label="Authorization expires" value={formatAuthorizationExpiry(preparedUsdc.expiresAtUnix)} />
            <InlineMessage
              tone="brand"
              title="Fee policy"
              body="Fees follow VAD's published fee policy."
            />
            <InlineMessage
              tone="warning"
              title="Pool estimates"
              body="Pool size and payout estimates aren't available yet."
            />
            <InlineMessage
              tone="warning"
              title="Payout rules"
              body="Partial refunds on losing positions aren't supported. This market has no payout cap."
            />
            <InlineMessage
              tone="brand"
              title="Network fee"
              body="Network fees are paid separately. They are not VAD fees and are not included in the amount above."
            />
          </VadProgressiveSection>

          {placeError ? <InlineMessage tone="danger" title="USDC transaction not submitted" body={placeError} /> : null}

          <View style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
            <VadButton label="Edit stake" variant="secondary" disabled={working} onPress={editStake} style={{ flex: 1 }} />
            <VadButton label="Confirm in wallet" loading={working} disabled={!tradeReady || working} onPress={() => void execute()} style={{ flex: 1.4 }} />
          </View>
        </VadCard>
      ) : null}

      {step === 'review' && !isUsdc && quote ? (
        <VadCard variant="brand" style={{ gap: 10, padding: 12 }}>
          <View style={{ gap: 3 }}>
            <VadText variant="caption" tone="brand">STEP 3 · REVIEW</VadText>
            <VadText variant="heading">Confirm your prediction.</VadText>
            <VadText variant="caption" tone="secondary">Check what leaves your wallet and the estimated settlement if the outcome wins.</VadText>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <VadChip label={outcomeLabel} tone={outcomeTone} />
            <VadChip label="PEER POOL" tone="brand" />
            <VadChip label={market.asset_code} />
          </View>

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <MiniMetric label="Your stake" value={assetMoney(quote.amount, market.asset_code)} />
            <MiniMetric label="VAD fee" value={assetMoney(quote.tradingFee, market.asset_code)} />
          </View>

          <View style={{ borderRadius: theme.radius.md, padding: theme.spacing.sm, gap: 5, backgroundColor: theme.colors.surface }}>
            <VadText variant="caption" tone="tertiary">TOTAL DEBIT NOW</VadText>
            <VadText variant={density.phone ? 'title' : 'display'} numberOfLines={1} adjustsFontSizeToFit>{assetMoney(quote.maximumCashDebit, market.asset_code)}</VadText>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <VadText variant="caption" tone="tertiary">Est. net payout</VadText>
                <VadText variant="bodyStrong">{assetMoney(quote.estimatedTotalNetSettlementPayout ?? quote.estimatedNetPayout, market.asset_code)}</VadText>
              </View>
              <View style={{ flex: 1 }}>
                <VadText variant="caption" tone="tertiary">Est. profit / loss</VadText>
                <VadText variant="bodyStrong" tone={Number(quote.estimatedNetProfitLossIfCorrect ?? 0) >= 0 ? 'yes' : 'no'}>
                  {assetMoney(quote.estimatedNetProfitLossIfCorrect ?? 0, market.asset_code)}
                </VadText>
              </View>
            </View>
          </View>

          <VadText variant="caption" tone="secondary">
            Estimates can change as others stake. The entry fee is charged now; any settlement fee applies only if you win.
          </VadText>

          <VadProgressiveSection
            title="Full cost breakdown"
            eyebrow="ADVANCED DETAILS"
            description="Your existing stakes, market limits, pool estimates and settlement calculation."
            icon="activity"
            summary={<VadText variant="caption" tone="tertiary">View all quote details</VadText>}
          >
            <QuoteLine label="Your new stake" value={assetMoney(quote.amount, market.asset_code)} />
            <QuoteLine label={`Existing stake on ${outcomeLabel}`} value={assetMoney(quote.existingUserOutcomeStake ?? 0, market.asset_code)} />
            <QuoteLine label={`Combined ${outcomeLabel} stake if committed`} value={assetMoney(quote.combinedUserOutcomeStake ?? quote.amount, market.asset_code)} />
            <QuoteLine label="Existing stakes across all outcomes" value={assetMoney(quote.existingUserTotalStake ?? 0, market.asset_code)} />
            <QuoteLine label="Total stakes across outcomes if committed" value={assetMoney(quote.combinedUserTotalStake ?? quote.amount, market.asset_code)} />
            {quote.maxUserMarketStake != null ? <QuoteLine label="Maximum combined stake per user" value={assetMoney(quote.maxUserMarketStake, market.asset_code)} /> : null}
            {quote.maxMarketPool != null ? <QuoteLine label="Maximum market pool" value={assetMoney(quote.maxMarketPool, market.asset_code)} /> : null}
            <QuoteLine label="VAD trading fee on this entry" value={assetMoney(quote.tradingFee, market.asset_code)} />
            <QuoteLine label="Total wallet debit now" value={assetMoney(quote.maximumCashDebit, market.asset_code)} />
            <QuoteLine label="Pool after your stake" value={assetMoney(quote.poolTotalAfter, market.asset_code)} />
            <QuoteLine label={`${outcomeLabel} pool after`} value={assetMoney(quote.outcomePoolAfter, market.asset_code)} />
            <QuoteLine label="Current implied share" value={probability(quote.impliedProbability)} />
            {quote.estimatedEntryGrossPayout != null ? <QuoteLine label="Estimated gross payout from this entry" value={assetMoney(quote.estimatedEntryGrossPayout, market.asset_code)} /> : null}
            <QuoteLine label="Estimated gross payout for your full winning position" value={assetMoney(quote.estimatedGrossPayout, market.asset_code)} />
            {quote.appliedPayoutMultiple != null ? <QuoteLine label="Estimated payout multiple" value={`${Number(quote.appliedPayoutMultiple).toFixed(2)}×${quote.payoutCapApplies ? ' (capped)' : ''}`} /> : null}
            {quote.maximumGrossPayoutMultiple != null ? <QuoteLine label="Market maximum payout multiple" value={`${Number(quote.maximumGrossPayoutMultiple).toFixed(2)}×`} /> : null}
            {quote.maxEntryStake != null ? <QuoteLine label="Maximum single stake" value={assetMoney(quote.maxEntryStake, market.asset_code)} /> : null}
            {quote.existingUserTradingFees != null ? <QuoteLine label="Trading fees already paid on existing entries" value={assetMoney(quote.existingUserTradingFees, market.asset_code)} /> : null}
            <QuoteLine label="Estimated settlement fee on full winning position" value={assetMoney(quote.estimatedSettlementFee, market.asset_code)} />
            <QuoteLine label="Estimated net payout from the winning side" value={assetMoney(quote.estimatedNetPayout, market.asset_code)} />
            <QuoteLine label="Estimated refund from your losing-side stakes if capped" value={assetMoney(quote.estimatedLosingSideRefund ?? 0, market.asset_code)} />
            <QuoteLine label="Estimated total settlement proceeds if correct" value={assetMoney(quote.estimatedTotalNetSettlementPayout ?? quote.estimatedNetPayout, market.asset_code)} />
            <QuoteLine label="Total cost across your position if committed" value={assetMoney(quote.estimatedTotalCostAfterCommit ?? quote.maximumCashDebit, market.asset_code)} />
            <QuoteLine label="Projected profit / loss if this outcome wins" value={assetMoney(quote.estimatedNetProfitLossIfCorrect ?? 0, market.asset_code)} />
            <InlineMessage
              tone="brand"
              title="Profit estimate"
              body="Projected profit or loss includes your existing stakes on both outcomes and their recorded trading fees. It assumes your selected outcome wins, uses the current pool and applicable policy, and can change before market close."
            />
            <InlineMessage
              tone="brand"
              title="Fee transparency"
              body="The entry trading fee is charged now. The settlement fee is estimated on your combined winning-side position and deducted at settlement. Quotes are estimates and can change as other participants stake."
            />
            <InlineMessage
              tone="brand"
              title="Peer Pool settlement"
              body="Payouts are stake-weighted. Any surplus above a published payout cap is shared with eligible losing-side participants under the market rules."
            />
          </VadProgressiveSection>

          {placeError ? <InlineMessage tone="danger" title="Trade not submitted" body={placeError} /> : null}

          <View style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
            <VadButton label="Edit stake" variant="secondary" disabled={working} onPress={() => { setStep('order'); setPlaceError(null); }} style={{ flex: 1 }} />
            <VadButton label="Confirm & commit prediction" loading={working} disabled={!tradeReady || working} onPress={() => void execute()} style={{ flex: 1.4 }} />
          </View>
        </VadCard>
      ) : null}

      {step === 'result' && isUsdc && onchainResult ? (
        <VadCard variant="brand" style={{ gap: 9, padding: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, gap: 3 }}>
              <VadText variant="caption" tone="brand">STEP 4 · TRANSACTION SUBMITTED</VadText>
              <VadText variant="heading">Waiting for chain confirmation.</VadText>
              <VadText variant="caption" tone="secondary">
                Your wallet submitted the VAD Settlement V1 position-lock transaction. VAD will treat the prediction as committed only after the blockchain confirms it and the indexer verifies the event.
              </VadText>
            </View>
            <VadChip label={outcomeLabel} tone={outcomeTone} />
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            <MiniMetric label="Stake" value={assetMoney(preparedUsdc?.collateralAmount ?? amountValue, 'USDC')} />
            <MiniMetric label="VAD trading fee" value={assetMoney(preparedUsdc?.tradingFee ?? 0, 'USDC')} />
            <MiniMetric label="Status" value="Submitted" />
          </View>

          <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm, gap: 4 }}>
            <VadText variant="caption" tone="tertiary">LOCK TRANSACTION</VadText>
            <VadText variant="caption" selectable>{onchainResult.transactionHash}</VadText>
            {onchainResult.approvalTransactionHash ? (
              <>
                <VadText variant="caption" tone="tertiary">USDC APPROVAL TRANSACTION</VadText>
                <VadText variant="caption" selectable>{onchainResult.approvalTransactionHash}</VadText>
              </>
            ) : null}
          </View>

          <InlineMessage
            tone="warning"
            title="Do not submit the same prediction again while this transaction is pending"
            body="Wait for chain confirmation and indexing. Do not resubmit."
          />

          <View style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
            <VadButton label="Open Portfolio" onPress={() => router.push('/portfolio')} style={{ flex: 1.4 }} />
            <VadButton label="New prediction" variant="secondary" onPress={startAgain} style={{ flex: 1 }} />
          </View>
        </VadCard>
      ) : null}

      {step === 'result' && !isUsdc && stakeStatus ? (
        <VadCard variant="brand" style={{ gap: 9, padding: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, gap: 3 }}>
              <VadText variant="caption" tone="yes">STEP 4 · STAKE COMMITTED</VadText>
              <VadText variant="heading">Your prediction is live.</VadText>
              <VadText variant="caption" tone="secondary">
                Your funds moved from your available wallet balance into this market’s protected peer pool. Result and settlement will update automatically.
              </VadText>
            </View>
            <VadChip label={outcomeLabel} tone={outcomeTone} />
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

function UnsupportedUsdcOrderBook() {
  const theme = useVadTheme();

  return (
    <VadCard variant="raised" style={{ gap: 9, padding: 12 }}>
      <VadText variant="caption" tone="brand">USDC · BLOCKCHAIN TRADING</VadText>
      <VadText variant="heading">USDC order-book trading isn’t available yet.</VadText>
      <VadText variant="caption" tone="secondary">
        USDC uses a separate wallet flow. Peer Pool is the only supported way to trade USDC right now.
      </VadText>
    </VadCard>
  );
}

function OrderBookTradingTicket({ market, canTrade, tradeReason, capabilityLoading = false, onPlaced, initialOutcome }: TicketProps) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [step, setStep] = useState<TradeStep>('prediction');
  const [outcome, setOutcome] = useState<'YES' | 'NO'>(initialOutcome === 'NO' ? 'NO' : 'YES');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [price, setPrice] = useState(() => priceInput(market.yes_price));
  const [quantity, setQuantity] = useState('100');
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const [working, setWorking] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [tradeRules, setTradeRules] = useState<MarketTradeRules | null>(null);
  const [tradeRulesLoading, setTradeRulesLoading] = useState(true);
  const [tradeRulesError, setTradeRulesError] = useState<string | null>(null);
  const [temporaryNgnCredit, setTemporaryNgnCredit] = useState<TemporaryNgnTestCreditStatus | null>(null);
  const [temporaryNgnTestingStatus, setTemporaryNgnTestingStatus] = useState<TemporaryNgnMarketTestingStatus | null>(null);
  const [temporaryNgnTestingLoading, setTemporaryNgnTestingLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (market.asset_code !== 'NGN') {
      return () => { active = false; };
    }
    void getTemporaryNgnTestCreditStatus()
      .then((status) => { if (active) setTemporaryNgnCredit(status?.active ? status : null); })
      .catch(() => { if (active) setTemporaryNgnCredit(null); });
    return () => { active = false; };
  }, [market.asset_code]);

  useEffect(() => {
    let active = true;
    if (market.asset_code !== 'NGN') {
      return () => { active = false; };
    }
    setTemporaryNgnTestingLoading(true);
    void getTemporaryNgnMarketTestingStatus()
      .then((status) => { if (active) setTemporaryNgnTestingStatus(status); })
      .catch(() => { if (active) setTemporaryNgnTestingStatus(null); })
      .finally(() => { if (active) setTemporaryNgnTestingLoading(false); });
    return () => { active = false; };
  }, [market.asset_code]);

  useEffect(() => {
    let active = true;
    void getMarketTradeRules(market.instrument_public_id)
      .then((value) => { if (active) setTradeRules(value); })
      .catch((value: unknown) => {
        if (active) setTradeRulesError(userFacingErrorMessage(value, 'trading', 'Market limits are unavailable. Try again.'));
      })
      .finally(() => { if (active) setTradeRulesLoading(false); });
    return () => { active = false; };
  }, [market.instrument_public_id]);

  const hasTemporaryNgnTestCredit = market.asset_code === 'NGN' && temporaryNgnCredit?.active === true;
  const temporaryNgnModeOff = hasTemporaryNgnTestCredit
    && temporaryNgnTestingStatus?.active === true
    && temporaryNgnTestingStatus.testModeEnabled === false;
  const temporaryNgnIneligible = hasTemporaryNgnTestCredit
    && temporaryNgnTestingStatus?.active === true
    && temporaryNgnTestingStatus.eligible === false;
  const temporaryNgnAccessLoading = hasTemporaryNgnTestCredit && temporaryNgnTestingLoading;
  // Check the user's NGN test-mode preference before enabling quote review; the database still enforces it at quote and placement.
  const tradeReady = (canTrade || hasTemporaryNgnTestCredit)
    && !capabilityLoading
    && !temporaryNgnAccessLoading
    && !temporaryNgnModeOff
    && !temporaryNgnIneligible;
  const priceValue = Number(price);
  const quantityValue = Number(quantity);
  const estimatedNotionalValue = (Number.isFinite(priceValue) ? priceValue : 0) * (Number.isFinite(quantityValue) ? quantityValue : 0);
  const minimumOrderValue = Number(tradeRules?.minTradeAmount);
  const maximumOrderValue = Number(tradeRules?.maxTradeAmount);
  const validPriceAndQuantity = price.trim().length > 0 && Number.isFinite(priceValue) && priceValue > 0 && priceValue < 1 && Number.isFinite(quantityValue) && quantityValue > 0;
  const belowMarketMinimum = Boolean(tradeRules && validPriceAndQuantity && estimatedNotionalValue < minimumOrderValue);
  const aboveMarketMaximum = Boolean(tradeRules && validPriceAndQuantity && estimatedNotionalValue > maximumOrderValue);
  const inputValid = Boolean(tradeRules) && validPriceAndQuantity && !belowMarketMinimum && !aboveMarketMaximum;
  const estimatedNotional = useMemo(() => assetMoney(estimatedNotionalValue, market.asset_code), [market.asset_code, estimatedNotionalValue]);

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
      setQuoteError(userFacingErrorMessage(error, 'trading', 'Could not review this order. Try again.'));
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
      setPlaceError(userFacingErrorMessage(error, 'trading', 'Could not place your order. Try again.'));
    } finally {
      setWorking(false);
    }
  }

  const completeQuote = quote as CompleteTradeQuote | null;

  return (
    <View style={{ gap: density.compact ? 10 : 12 }}>
      <TourTarget id="market-trading-ticket"><TradeStepRail step={step} secondLabel="Order" /></TourTarget>
      <CapabilityNotice canTrade={canTrade || hasTemporaryNgnTestCredit} capabilityLoading={capabilityLoading} tradeReason={tradeReason} />
      {temporaryNgnAccessLoading ? (
        <InlineMessage tone="warning" title="Checking NGN test access" body="Checking your NGN test-funds settings." />
      ) : null}
      {temporaryNgnModeOff ? (
        <View style={{ gap: theme.spacing.xs }}>
          <InlineMessage tone="warning" title="NGN test trading is off" body="Turn on NGN test trading in Account to use your test funds." />
          <VadButton label="Open Account" variant="secondary" onPress={() => router.push('/account')} />
        </View>
      ) : null}
      {temporaryNgnIneligible ? (
        <View style={{ gap: theme.spacing.xs }}>
          <InlineMessage tone="warning" title="NGN test trading unavailable" body="Your test funds are assigned, but account eligibility and Nigeria location checks must be complete before trading." />
          <VadButton label="Open Account" variant="secondary" onPress={() => router.push('/account')} />
        </View>
      ) : null}

      {step === 'prediction' ? (
        <VadCard variant="raised" style={{ gap: 9, padding: 12 }}>
          <View style={{ gap: 3 }}>
            <VadText variant="caption" tone="brand">STEP 1 · YOUR VIEW</VadText>
            <VadText variant="heading">Choose an outcome.</VadText>
            <VadText variant="caption" tone="secondary">Your position starts when your order matches another trader.</VadText>
          </View>
          <View accessibilityRole="radiogroup" style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
            <OutcomeChoice active={outcome === 'YES'} label="YES" title="I think it will happen" value={probability(market.yes_price)} tone="yes" disabled={!tradeReady || working} onPress={() => chooseOutcome('YES')} />
            <OutcomeChoice active={outcome === 'NO'} label="NO" title="I think it will not happen" value={probability(market.no_price)} tone="no" disabled={!tradeReady || working} onPress={() => chooseOutcome('NO')} />
          </View>
          <VadButton label={`Continue with ${outcome}`} disabled={!tradeReady || working} onPress={() => setStep('order')} />
        </VadCard>
      ) : null}

      {step === 'order' ? (
        <VadCard variant="raised" style={{ gap: 9, padding: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, gap: 3 }}>
              <VadText variant="caption" tone="brand">STEP 2 · ORDER</VadText>
              <VadText variant="heading">Set your limit order.</VadText>
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
            <MiniMetric label="Order value" value={validPriceAndQuantity ? estimatedNotional : '—'} />
            <MiniMetric label="Currency" value={market.asset_code} />
          </View>
          {tradeRules ? (
            <VadText variant="caption" tone="secondary">
              Per-order notional: minimum {assetMoney(tradeRules.minTradeAmount, market.asset_code)} · maximum {assetMoney(tradeRules.maxTradeAmount, market.asset_code)}. Order value is limit price × shares.
            </VadText>
          ) : tradeRulesLoading ? (
            <VadText variant="caption" tone="secondary">Loading trade limits…</VadText>
          ) : tradeRulesError ? (
            <VadText variant="caption" tone="warning">{tradeRulesError} Limits are checked before submission.</VadText>
          ) : null}
          {belowMarketMinimum ? <InlineMessage tone="warning" title="Order is below the market minimum" body={`This order is ${estimatedNotional}. Increase the limit price or shares so its value is at least ${assetMoney(tradeRules?.minTradeAmount ?? 0, market.asset_code)}.`} /> : null}
          {aboveMarketMaximum ? <InlineMessage tone="warning" title="Order exceeds this market’s limit" body={`This order is ${estimatedNotional}. Reduce the limit price or shares to stay at or below ${assetMoney(tradeRules?.maxTradeAmount ?? 0, market.asset_code)}.`} /> : null}
          {quoteError ? (
            <View style={{ gap: theme.spacing.xs }}>
              <InlineMessage
                tone="danger"
                title={quoteError.startsWith('Turn on NGN test trading in Account') ? 'NGN test trading is off' : 'Order review unavailable'}
                body={quoteError}
              />
              {quoteError.startsWith('Turn on NGN test trading in Account') ? (
                <VadButton label="Open Account" variant="secondary" onPress={() => router.push('/account')} />
              ) : null}
            </View>
          ) : null}
          <View style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
            <VadButton label="Back" variant="secondary" onPress={() => setStep('prediction')} style={{ flex: 1 }} />
            <VadButton label="Review order & fees" loading={working} disabled={!tradeReady || working || tradeRulesLoading || !inputValid} onPress={() => void prepareReview()} style={{ flex: 1.4 }} />
          </View>
        </VadCard>
      ) : null}

      {step === 'review' && quote ? (
        <VadCard variant="brand" style={{ gap: 10, padding: 12 }}>
          <View style={{ gap: 3 }}>
            <VadText variant="caption" tone="brand">STEP 3 · REVIEW</VadText>
            <VadText variant="heading">Review your order.</VadText>
            <VadText variant="caption" tone="secondary">Your order can remain open until another trader matches it. Nothing is placed until you confirm.</VadText>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <VadChip label={quote.outcomeCode} tone={quote.outcomeCode === 'YES' ? 'yes' : 'no'} />
            <VadChip label={quote.side} tone="brand" />
            <VadChip label="ORDER BOOK" />
          </View>

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <MiniMetric label="Order value" value={assetMoney(quote.notional, market.asset_code)} />
            <MiniMetric label="Limit price" value={assetMoney(quote.price, market.asset_code)} />
            <MiniMetric label="Shares" value={Number(quote.quantity).toLocaleString()} />
          </View>

          {quote.side === 'BUY' ? (
            <View style={{ borderRadius: theme.radius.md, padding: theme.spacing.sm, gap: 5, backgroundColor: theme.colors.surface }}>
              <VadText variant="caption" tone="tertiary">MAXIMUM WALLET DEBIT</VadText>
              <VadText variant={density.phone ? 'title' : 'display'} numberOfLines={1} adjustsFontSizeToFit>{assetMoney(quote.maximumCashReservation, market.asset_code)}</VadText>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
                <VadText variant="caption" tone="secondary">Order value</VadText>
                <VadText variant="caption" tone="secondary">{assetMoney(quote.notional, market.asset_code)}</VadText>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
                <VadText variant="caption" tone="secondary">Maximum fee reserve</VadText>
                <VadText variant="caption" tone="secondary">{assetMoney(quote.maximumFeeReserve, market.asset_code)}</VadText>
              </View>
            </View>
          ) : (
            <View style={{ borderRadius: theme.radius.md, padding: theme.spacing.sm, gap: 5, backgroundColor: theme.colors.surface }}>
              <VadText variant="caption" tone="tertiary">SELL ORDER</VadText>
              <VadText variant="bodyStrong">{Number(quote.availableSharesToSell).toLocaleString()} shares available to sell</VadText>
              <VadText variant="caption" tone="secondary">The order can only fill up to your available position.</VadText>
            </View>
          )}

          {quote.side === 'BUY' ? (
            <QuoteLine label="Estimated net payout if fully filled and you win" value={assetMoney(completeQuote?.estimatedNetSettlement ?? quote.potentialGrossSettlement, market.asset_code)} />
          ) : null}

          <VadText variant="caption" tone="secondary">
            Trading fees depend on how your order matches. A payout fee is charged only if you win; the amount is an estimate until the market closes.
          </VadText>

          <VadProgressiveSection
            title="Full cost breakdown"
            eyebrow="ADVANCED DETAILS"
            description="Market exposure, fee scenarios and settlement estimates."
            icon="activity"
            summary={<VadText variant="caption" tone="tertiary">View all quote details</VadText>}
          >
            <QuoteLine label="Order value" value={assetMoney(quote.notional, market.asset_code)} />
            {quote.maxOrderNotional != null ? <QuoteLine label="Maximum order value" value={assetMoney(quote.maxOrderNotional, market.asset_code)} /> : null}
            {quote.currentUserMarketExposure != null ? <QuoteLine label="Current market exposure" value={assetMoney(quote.currentUserMarketExposure, market.asset_code)} /> : null}
            {quote.projectedUserMarketExposure != null ? <QuoteLine label="Projected exposure after this order" value={assetMoney(quote.projectedUserMarketExposure, market.asset_code)} /> : null}
            {quote.maxUserMarketExposure != null ? <QuoteLine label="Maximum user market exposure" value={assetMoney(quote.maxUserMarketExposure, market.asset_code)} /> : null}
            <QuoteLine label="Price per share" value={assetMoney(quote.price, market.asset_code)} />
            <QuoteLine label="Shares" value={Number(quote.quantity).toLocaleString()} />
            <QuoteLine label="VAD fee if your order adds liquidity" value={assetMoney(quote.makerFee, market.asset_code)} />
            <QuoteLine label="VAD fee if your order matches an existing order" value={assetMoney(quote.takerFee, market.asset_code)} />
            {quote.side === 'BUY' ? <QuoteLine label="Maximum trading fee reserved" value={assetMoney(quote.maximumFeeReserve, market.asset_code)} /> : null}
            {quote.side === 'BUY' ? <QuoteLine label="Maximum wallet amount held" value={assetMoney(quote.maximumCashReservation, market.asset_code)} /> : <QuoteLine label="Shares available to sell" value={String(quote.availableSharesToSell)} />}
            <QuoteLine label="Gross payout if fully filled and you win" value={assetMoney(quote.potentialGrossSettlement, market.asset_code)} />
            <QuoteLine label="Estimated VAD payout fee if you win" value={assetMoney(completeQuote?.estimatedSettlementFee ?? 0, market.asset_code)} />
            <QuoteLine label="Estimated net payout if you win" value={assetMoney(completeQuote?.estimatedNetSettlement ?? quote.potentialGrossSettlement, market.asset_code)} />
            <InlineMessage
              tone="brand"
              title="Fee transparency"
              body="For BUY orders, VAD may reserve up to the displayed trading fee. Your final fee depends on how the order matches. The payout fee is charged only if you win; the amount shown is an estimate."
            />
          </VadProgressiveSection>

          {placeError ? <InlineMessage tone="danger" title="Order not placed" body={placeError} /> : null}
          <View style={{ flexDirection: density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
            <VadButton label="Edit order" variant="secondary" disabled={working} onPress={() => setStep('order')} style={{ flex: 1 }} />
            <VadButton label="Confirm & place order" loading={working} disabled={!tradeReady || working} onPress={() => void execute()} style={{ flex: 1.4 }} />
          </View>
        </VadCard>
      ) : null}

      {step === 'result' && orderStatus ? (
        <VadCard variant={orderStatus.status === 'FILLED' ? 'brand' : 'raised'} style={{ gap: 9, padding: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, gap: 3 }}>
              <VadText variant="caption" tone="brand">STEP 4 · ORDER STATUS</VadText>
              <VadText variant="heading">{orderStatus.status === 'FILLED' ? 'Your order matched.' : orderStatus.status === 'PARTIALLY_FILLED' ? 'Your order partially matched.' : 'Your order is waiting for a match.'}</VadText>
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
    <VadCard variant="muted" style={{ paddingVertical: 8, gap: 5 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {steps.map((item, index) => {
          const complete = index < current;
          const active = index === current;
          return (
            <View key={item.key} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: active ? 21 : 16, height: active ? 21 : 16, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: complete ? theme.colors.yesSoft : active ? theme.colors.brandSoft : theme.colors.surface, borderWidth: 1, borderColor: complete ? theme.colors.yes : active ? theme.colors.brandPrimary : theme.colors.border }}>
                <VadText variant="caption" tone={complete ? 'yes' : active ? 'brand' : 'tertiary'}>{index + 1}</VadText>
              </View>
              {index < steps.length - 1 ? <View style={{ height: 1, flex: 1, backgroundColor: index < current ? theme.colors.yes : theme.colors.border, marginHorizontal: 4 }} /> : null}
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

function OutcomeChoice({ active, label, title, value, tone, disabled = false, onPress }: { active: boolean; label: string; title: string; value: string; tone: 'yes' | 'no' | 'neutral'; disabled?: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const color = tone === 'yes' ? theme.colors.yes : tone === 'no' ? theme.colors.no : theme.colors.brandPrimary;
  const background = tone === 'yes' ? theme.colors.yesSoft : tone === 'no' ? theme.colors.noSoft : theme.colors.brandSoft;
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected: active, disabled }} accessibilityLabel={`${label}: ${title}, current share ${value}`} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ flex: 1, minHeight: density.compact ? 66 : 76, borderWidth: active ? 1.5 : 1, borderColor: active ? color : theme.colors.border, backgroundColor: active ? background : theme.colors.surface, borderRadius: theme.radius.md, padding: density.compact ? 8 : 9, justifyContent: 'center', gap: 4, opacity: disabled ? 0.5 : pressed ? 0.74 : 1 })}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <VadChip label={label} tone={tone} />
        <VadText variant="bodyStrong" tone={tone === 'neutral' ? 'brand' : tone} style={{ fontSize: 14, lineHeight: 17 }}>{value}</VadText>
      </View>
      <VadText variant="bodyStrong" numberOfLines={1} style={{ fontSize: 12, lineHeight: 15 }}>{title}</VadText>
    </Pressable>
  );
}

function displayOutcomeCode(code: string) {
  if (code === 'YES' || code === 'NO') return code;
  return code.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: 105, minWidth: 0, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, padding: 6, gap: 1 }}>
      <VadText variant="caption" tone="tertiary" numberOfLines={1}>{label}</VadText>
      <VadText variant="bodyStrong" numberOfLines={1} adjustsFontSizeToFit>{value}</VadText>
    </View>
  );
}

function QuoteLine({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ minHeight: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
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
    <View style={{ width: '100%', borderWidth: 1, borderColor, backgroundColor, borderRadius: theme.radius.md, padding: 8, gap: 2 }}>
      <VadText variant="bodyStrong">{title}</VadText>
      <VadText variant="caption" tone="secondary">{body}</VadText>
    </View>
  );
}

function shortReference(value: string) {
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function formatAuthorizationExpiry(unixSeconds: number) {
  const date = new Date(unixSeconds * 1000);
  return Number.isNaN(date.getTime()) ? 'Short-lived' : date.toLocaleTimeString();
}

function priceInput(value: number | string | null) {
  if (value == null || value === '') return '';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : '';
}

function friendlyStatus(status: string) {
  return status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
