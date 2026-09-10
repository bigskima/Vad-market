import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import {
  placeOrder,
  quoteTrade,
  type MarketCatalogItem,
  type TradeQuote,
} from '@/services/market-api';
import { money, pct } from '../format';

const SHARE_PRESETS = ['25', '50', '100', '250'] as const;

export function TradingTicket({
  market,
  canTrade,
  onPlaced,
}: {
  market: MarketCatalogItem;
  canTrade: boolean;
  onPlaced: () => Promise<void>;
}) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const splitReview = width >= 860;
  const compact = width < 380;
  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [price, setPrice] = useState(
    String(Number(market.yes_price ?? 0.5)),
  );
  const [quantity, setQuantity] = useState('100');
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [working, setWorking] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);

  function clearReviewState() {
    setQuote(null);
    setQuoteError(null);
    setPlaceError(null);
    setPlacedOrderId(null);
  }

  function chooseOutcome(next: 'YES' | 'NO') {
    setOutcome(next);
    setPrice(
      String(
        Number(
          next === 'YES'
            ? market.yes_price ?? 0.5
            : market.no_price ?? 0.5,
        ),
      ),
    );
    clearReviewState();
  }

  function chooseQuantity(next: string) {
    setQuantity(next);
    clearReviewState();
  }

  async function preview() {
    setWorking(true);
    setQuoteError(null);
    setPlaceError(null);
    setPlacedOrderId(null);

    try {
      setQuote(
        await quoteTrade({
          instrumentPublicId: market.instrument_public_id,
          outcomeCode: outcome,
          side,
          price: Number(price),
          quantity: Number(quantity),
        }),
      );
    } catch (error) {
      setQuote(null);
      setQuoteError(
        error instanceof Error
          ? error.message
          : 'The trade could not be quoted. Check the order details and try again.',
      );
    } finally {
      setWorking(false);
    }
  }

  async function execute() {
    if (!quote) return;

    setWorking(true);
    setPlaceError(null);

    try {
      const orderId = await placeOrder(quote);
      setPlacedOrderId(orderId);
      setQuote(null);
      await onPlaced();
    } catch (error) {
      setPlaceError(
        error instanceof Error
          ? error.message
          : 'The order could not be placed. Please try again.',
      );
    } finally {
      setWorking(false);
    }
  }

  const currentProbability =
    outcome === 'YES' ? market.yes_price : market.no_price;
  const priceValue = Number(price);
  const quantityValue = Number(quantity);
  const inputValid =
    Number.isFinite(priceValue) &&
    priceValue > 0 &&
    priceValue <= 1 &&
    Number.isFinite(quantityValue) &&
    quantityValue > 0;

  const estimatedNotional = useMemo(
    () =>
      money(
        (Number.isFinite(priceValue) ? priceValue : 0) *
          (Number.isFinite(quantityValue) ? quantityValue : 0),
      ),
    [priceValue, quantityValue],
  );

  return (
    <View style={{ gap: theme.spacing.lg }}>
      {placedOrderId ? (
        <View
          style={{
            borderLeftWidth: 3,
            borderLeftColor: theme.colors.yes,
            backgroundColor: theme.colors.yesSoft,
            padding: theme.spacing.lg,
            gap: theme.spacing.md,
          }}
        >
          <View style={{ gap: 2 }}>
            <VadText variant="label" tone="yes">ORDER PLACED</VadText>
            <VadText variant="heading">Your order is now live.</VadText>
            <VadText variant="caption" tone="secondary">
              It may fill when compatible liquidity is available. Portfolio and
              the ledger remain authoritative for fill state and exposure.
            </VadText>
          </View>

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              paddingTop: theme.spacing.sm,
              gap: 2,
            }}
          >
            <VadText variant="caption" tone="tertiary">ORDER REFERENCE</VadText>
            <VadText variant="bodyStrong" selectable>
              {placedOrderId}
            </VadText>
          </View>

          <View
            style={{
              flexDirection: compact ? 'column' : 'row',
              gap: theme.spacing.sm,
            }}
          >
            <VadButton
              label="Open Portfolio"
              onPress={() => router.push('/portfolio')}
              style={{ flex: 1 }}
            />
            <VadButton
              label="Place another order"
              variant="secondary"
              onPress={() => setPlacedOrderId(null)}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : null}

      <View
        style={{
          flexDirection: splitReview && quote ? 'row' : 'column',
          alignItems: 'flex-start',
          gap: theme.spacing.xl,
        }}
      >
        <View
          style={{
            width: '100%',
            flex: splitReview && quote ? 1.15 : undefined,
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: theme.colors.border,
            paddingVertical: theme.spacing.lg,
            gap: theme.spacing.lg,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              gap: theme.spacing.md,
              alignItems: 'flex-end',
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <VadText variant="label" tone="brand">TRADE</VadText>
              <VadText variant="heading">
                {side === 'BUY' ? 'Build a position' : 'Reduce a position'}
              </VadText>
            </View>

            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <VadText variant="caption" tone="secondary">
                {outcome} signal
              </VadText>
              <VadText
                variant="heading"
                tone={outcome === 'YES' ? 'yes' : 'no'}
              >
                {pct(currentProbability)}
              </VadText>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
            <OutcomeChoice
              active={outcome === 'YES'}
              label="YES"
              value={pct(market.yes_price)}
              tone="yes"
              onPress={() => chooseOutcome('YES')}
            />
            <OutcomeChoice
              active={outcome === 'NO'}
              label="NO"
              value={pct(market.no_price)}
              tone="no"
              onPress={() => chooseOutcome('NO')}
            />
          </View>

          <View
            accessibilityRole="tablist"
            style={{
              flexDirection: 'row',
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
            }}
          >
            {(['BUY', 'SELL'] as const).map((option) => {
              const selected = side === option;

              return (
                <Pressable
                  key={option}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setSide(option);
                    clearReviewState();
                  }}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderBottomWidth: 2,
                    borderBottomColor: selected
                      ? theme.colors.brandPrimary
                      : 'transparent',
                    opacity: pressed ? 0.65 : 1,
                  })}
                >
                  <VadText
                    variant="label"
                    tone={selected ? 'brand' : 'secondary'}
                  >
                    {option === 'BUY' ? 'Buy' : 'Sell'}
                  </VadText>
                </Pressable>
              );
            })}
          </View>

          <View
            style={{
              flexDirection: width >= 620 ? 'row' : 'column',
              gap: theme.spacing.sm,
            }}
          >
            <View style={{ flex: 1 }}>
              <VadInput
                label="Limit price"
                hint="Probability price above 0 and up to 1."
                value={price}
                onChangeText={(value) => {
                  setPrice(value);
                  clearReviewState();
                }}
                keyboardType="decimal-pad"
                placeholder="0.64"
                error={
                  price.length > 0 &&
                  (!Number.isFinite(priceValue) ||
                    priceValue <= 0 ||
                    priceValue > 1)
                    ? 'Limit price must be greater than 0 and no more than 1.'
                    : undefined
                }
              />
            </View>

            <View style={{ flex: 1 }}>
              <VadInput
                label="Shares"
                hint="Choose a preset or enter your own quantity."
                value={quantity}
                onChangeText={(value) => {
                  setQuantity(value);
                  clearReviewState();
                }}
                keyboardType="decimal-pad"
                placeholder="100"
                error={
                  quantity.length > 0 &&
                  (!Number.isFinite(quantityValue) || quantityValue <= 0)
                    ? 'Shares must be greater than 0.'
                    : undefined
                }
              />
            </View>
          </View>

          <View
            style={{
              flexDirection: 'row',
              gap: theme.spacing.md,
              flexWrap: 'wrap',
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
            }}
          >
            {SHARE_PRESETS.map((preset) => {
              const selected = quantity === preset;

              return (
                <Pressable
                  key={preset}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => chooseQuantity(preset)}
                  style={({ pressed }) => ({
                    minWidth: 48,
                    minHeight: 34,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderBottomWidth: 2,
                    borderBottomColor: selected
                      ? theme.colors.brandPrimary
                      : 'transparent',
                    opacity: pressed ? 0.65 : 1,
                  })}
                >
                  <VadText
                    variant="caption"
                    tone={selected ? 'brand' : 'secondary'}
                  >
                    {preset}
                  </VadText>
                </Pressable>
              );
            })}
          </View>

          <View style={{ gap: theme.spacing.xs }}>
            <QuoteLine
              label="Estimated notional"
              value={estimatedNotional}
            />
            <QuoteLine label="Order type" value="Limit" />
          </View>

          {!canTrade ? (
            <InlineMessage
              tone="warning"
              title="Trading unavailable"
              body="Trading is not available for this account under the current platform policy."
            />
          ) : null}

          {quoteError ? (
            <InlineMessage
              tone="danger"
              title="Trade review unavailable"
              body={quoteError}
            />
          ) : null}

          <VadButton
            label={quote ? 'Refresh trade review' : 'Review trade'}
            loading={working}
            disabled={!canTrade || working || !inputValid}
            onPress={() => void preview()}
          />
        </View>

        {quote ? (
          <View
            style={{
              width: '100%',
              flex: splitReview ? 0.85 : undefined,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: theme.colors.brandPrimary,
              paddingVertical: theme.spacing.lg,
              gap: theme.spacing.md,
            }}
          >
            <View style={{ gap: 2 }}>
              <VadText variant="label" tone="brand">ORDER REVIEW</VadText>
              <VadText variant="heading">Check before you place it.</VadText>
              <VadText variant="caption" tone="secondary">
                The backend quote below is authoritative for this order attempt.
              </VadText>
            </View>

            <QuoteLine label="Notional" value={money(quote.notional)} />
            <QuoteLine label="Maker fee" value={money(quote.makerFee)} />
            <QuoteLine label="Taker fee" value={money(quote.takerFee)} />

            {quote.side === 'BUY' ? (
              <QuoteLine
                label="Maximum cash reserved"
                value={money(quote.maximumCashReservation)}
              />
            ) : (
              <QuoteLine
                label="Shares available"
                value={String(quote.availableSharesToSell)}
              />
            )}

            <QuoteLine
              label="Gross settlement if correct"
              value={money(quote.potentialGrossSettlement)}
            />

            {placeError ? (
              <InlineMessage
                tone="danger"
                title="Order not placed"
                body={placeError}
              />
            ) : null}

            <VadButton
              label="Place order"
              loading={working}
              onPress={() => void execute()}
            />
            <VadButton
              label="Edit order"
              variant="ghost"
              disabled={working}
              onPress={() => {
                setQuote(null);
                setPlaceError(null);
              }}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function OutcomeChoice({
  active,
  label,
  value,
  tone,
  onPress,
}: {
  active: boolean;
  label: string;
  value: string;
  tone: 'yes' | 'no';
  onPress: () => void;
}) {
  const theme = useVadTheme();
  const color = tone === 'yes' ? theme.colors.yes : theme.colors.no;
  const background =
    tone === 'yes' ? theme.colors.yesSoft : theme.colors.noSoft;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        borderWidth: 1,
        borderColor: active ? color : theme.colors.border,
        backgroundColor: active ? background : 'transparent',
        borderRadius: theme.radius.md,
        padding: theme.spacing.md,
        gap: 2,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <VadText variant="caption" style={{ color }}>{label}</VadText>
      <VadText variant="heading" style={{ color }}>{value}</VadText>
    </Pressable>
  );
}

function QuoteLine({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();

  return (
    <View
      style={{
        minHeight: 42,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: theme.spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <VadText variant="caption" tone="secondary" style={{ flex: 1 }}>
        {label}
      </VadText>
      <VadText variant="bodyStrong">{value}</VadText>
    </View>
  );
}

function InlineMessage({
  tone,
  title,
  body,
}: {
  tone: 'warning' | 'danger';
  title: string;
  body: string;
}) {
  const theme = useVadTheme();
  const danger = tone === 'danger';

  return (
    <View
      style={{
        borderLeftWidth: 3,
        borderLeftColor: danger
          ? theme.colors.danger
          : theme.colors.warning,
        backgroundColor: danger
          ? theme.colors.noSoft
          : theme.colors.warningSoft,
        padding: theme.spacing.md,
        gap: 2,
      }}
    >
      <VadText variant="caption" tone={tone}>{title.toUpperCase()}</VadText>
      <VadText variant="caption" tone="secondary">{body}</VadText>
    </View>
  );
}
