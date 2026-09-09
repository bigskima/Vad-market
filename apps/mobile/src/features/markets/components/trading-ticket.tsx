import { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { placeOrder, quoteTrade, type MarketCatalogItem, type TradeQuote } from '@/services/market-api';
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
  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [price, setPrice] = useState(String(Number(market.yes_price ?? 0.5)));
  const [quantity, setQuantity] = useState('100');
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [working, setWorking] = useState(false);

  function chooseOutcome(next: 'YES' | 'NO') {
    setOutcome(next);
    setPrice(String(Number(next === 'YES' ? market.yes_price ?? 0.5 : market.no_price ?? 0.5)));
    setQuote(null);
  }

  function chooseQuantity(next: string) {
    setQuantity(next);
    setQuote(null);
  }

  async function preview() {
    setWorking(true);
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
      Alert.alert(
        'Could not quote trade',
        error instanceof Error ? error.message : 'Check the order details.',
      );
    } finally {
      setWorking(false);
    }
  }

  async function execute() {
    if (!quote) return;
    setWorking(true);
    try {
      await placeOrder(quote);
      Alert.alert('Order placed', 'Your order is live and may fill when compatible liquidity exists.');
      setQuote(null);
      await onPlaced();
    } catch (error) {
      Alert.alert('Order not placed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorking(false);
    }
  }

  const currentProbability = outcome === 'YES' ? market.yes_price : market.no_price;
  const priceValue = Number(price);
  const quantityValue = Number(quantity);
  const inputValid =
    Number.isFinite(priceValue) &&
    priceValue > 0 &&
    priceValue <= 1 &&
    Number.isFinite(quantityValue) &&
    quantityValue > 0;

  const estimatedNotional = useMemo(
    () => money((Number.isFinite(priceValue) ? priceValue : 0) * (Number.isFinite(quantityValue) ? quantityValue : 0)),
    [priceValue, quantityValue],
  );

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View
        style={{
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.xl,
          backgroundColor: theme.colors.surface,
          padding: theme.spacing.lg,
          gap: theme.spacing.lg,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md, alignItems: 'flex-end' }}>
          <View style={{ gap: 2 }}>
            <VadText variant="caption" tone="secondary">Trade</VadText>
            <VadText variant="heading">{side === 'BUY' ? 'Build a position' : 'Reduce a position'}</VadText>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <VadText variant="caption" tone="secondary">{outcome} probability</VadText>
            <VadText variant="heading" tone={outcome === 'YES' ? 'yes' : 'no'}>{pct(currentProbability)}</VadText>
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
          style={{
            flexDirection: 'row',
            padding: theme.spacing.xxs,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.surfaceRaised,
          }}
        >
          {(['BUY', 'SELL'] as const).map((option) => {
            const selected = side === option;
            return (
              <Pressable
                key={option}
                onPress={() => {
                  setSide(option);
                  setQuote(null);
                }}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: theme.spacing.sm,
                  borderRadius: theme.radius.md,
                  backgroundColor: selected ? theme.colors.surface : 'transparent',
                }}
              >
                <VadText variant="label" tone={selected ? 'primary' : 'secondary'}>
                  {option === 'BUY' ? 'Buy' : 'Sell'}
                </VadText>
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <VadInput
              label="Limit price"
              value={price}
              onChangeText={(value) => {
                setPrice(value);
                setQuote(null);
              }}
              keyboardType="decimal-pad"
              placeholder="0.64"
            />
          </View>
          <View style={{ flex: 1 }}>
            <VadInput
              label="Shares"
              value={quantity}
              onChangeText={(value) => {
                setQuantity(value);
                setQuote(null);
              }}
              keyboardType="decimal-pad"
              placeholder="100"
            />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
          {SHARE_PRESETS.map((preset) => {
            const selected = quantity === preset;
            return (
              <Pressable
                key={preset}
                onPress={() => chooseQuantity(preset)}
                style={{
                  minWidth: 62,
                  alignItems: 'center',
                  borderRadius: theme.radius.pill,
                  borderWidth: 1,
                  borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
                  backgroundColor: selected ? theme.colors.brandSoft : 'transparent',
                  paddingHorizontal: theme.spacing.sm,
                  paddingVertical: theme.spacing.xs,
                }}
              >
                <VadText variant="caption" tone={selected ? 'brand' : 'secondary'}>{preset}</VadText>
              </Pressable>
            );
          })}
        </View>

        <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.md, gap: theme.spacing.xs }}>
          <QuoteLine label="Estimated notional" value={estimatedNotional} />
          <QuoteLine label="Order type" value="Limit" />
        </View>

        {!canTrade ? (
          <View
            style={{
              borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.warningSoft,
              padding: theme.spacing.md,
            }}
          >
            <VadText variant="caption" tone="warning">
              Trading is not available for this account under the current platform policy.
            </VadText>
          </View>
        ) : null}

        <VadButton
          label="Review trade"
          loading={working}
          disabled={!canTrade || working || !inputValid}
          onPress={() => void preview()}
        />
      </View>

      {quote ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: theme.colors.brandPrimary,
            borderRadius: theme.radius.xl,
            backgroundColor: theme.colors.surface,
            padding: theme.spacing.lg,
            gap: theme.spacing.md,
          }}
        >
          <View style={{ gap: 2 }}>
            <VadText variant="label" tone="brand">ORDER REVIEW</VadText>
            <VadText variant="heading">Check before you place it.</VadText>
          </View>

          <QuoteLine label="Notional" value={money(quote.notional)} />
          <QuoteLine label="Maker fee" value={money(quote.makerFee)} />
          <QuoteLine label="Taker fee" value={money(quote.takerFee)} />
          {quote.side === 'BUY' ? (
            <QuoteLine label="Maximum cash reserved" value={money(quote.maximumCashReservation)} />
          ) : (
            <QuoteLine label="Shares available" value={String(quote.availableSharesToSell)} />
          )}
          <QuoteLine label="Gross settlement if correct" value={money(quote.potentialGrossSettlement)} />

          <VadButton label="Place order" loading={working} onPress={() => void execute()} />
          <VadButton label="Edit order" variant="ghost" disabled={working} onPress={() => setQuote(null)} />
        </View>
      ) : null}
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
  const background = tone === 'yes' ? theme.colors.yesSoft : theme.colors.noSoft;

  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        borderWidth: 1.5,
        borderColor: active ? color : theme.colors.border,
        backgroundColor: active ? background : theme.colors.surfaceRaised,
        borderRadius: theme.radius.lg,
        padding: theme.spacing.md,
        gap: 2,
      }}
    >
      <VadText variant="caption" style={{ color }}>{label}</VadText>
      <VadText variant="heading" style={{ color }}>{value}</VadText>
    </Pressable>
  );
}

function QuoteLine({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm }}>
      <VadText tone="secondary" style={{ flex: 1 }}>{label}</VadText>
      <VadText variant="bodyStrong">{value}</VadText>
    </View>
  );
}
