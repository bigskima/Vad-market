import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import {
  createPaymentIntent,
  getProviderReadiness,
  quotePayment,
  type PaymentQuote,
} from '@/services/payment-api';

type Mode = 'DEPOSIT' | 'WITHDRAWAL';

export function PaymentReadinessCard({
  initialMode = 'DEPOSIT',
  lockMode = false,
}: {
  initialMode?: Mode;
  lockMode?: boolean;
}) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const split = width >= 820;
  const [readiness, setReadiness] = useState<{
    depositConfigured?: boolean;
    withdrawalConfigured?: boolean;
  }>({});
  const [mode, setMode] = useState<Mode>(initialMode);
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<PaymentQuote | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      setReadiness(await getProviderReadiness());
    } catch {
      setReadiness({});
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function preview() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;

    setWorking(true);
    try {
      setQuote(await quotePayment(mode, value));
    } catch (error) {
      Alert.alert(
        'Could not prepare payment',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setWorking(false);
    }
  }

  async function create() {
    if (!quote?.enabled) return;

    setWorking(true);
    try {
      const publicId = await createPaymentIntent(mode, Number(amount));
      Alert.alert(
        'Payment intent created',
        'Reference ' +
          publicId +
          '. Its status will appear in Wallet activity.',
      );
      setQuote(null);
      setAmount('');
    } catch (error) {
      Alert.alert(
        'Payment unavailable',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setWorking(false);
    }
  }

  const providerReady =
    mode === 'DEPOSIT'
      ? readiness.depositConfigured
      : readiness.withdrawalConfigured;

  const amountValue = Number(amount);
  const validAmount = Number.isFinite(amountValue) && amountValue > 0;
  const stage = quote ? 2 : amount ? 1 : 0;

  return (
    <View style={{ gap: theme.spacing.xl }}>
      {!lockMode ? (
        <View
          style={{
            flexDirection: 'row',
            padding: theme.spacing.xxs,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.surfaceRaised,
          }}
        >
          {(['DEPOSIT', 'WITHDRAWAL'] as const).map((item) => {
            const selected = mode === item;

            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                key={item}
                onPress={() => {
                  setMode(item);
                  setQuote(null);
                  setAmount('');
                }}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: theme.radius.md,
                  backgroundColor: selected
                    ? theme.colors.surface
                    : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <VadText
                  variant="label"
                  tone={selected ? 'brand' : 'secondary'}
                >
                  {item === 'DEPOSIT' ? 'Deposit' : 'Withdraw'}
                </VadText>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="label" tone="brand">
          {mode === 'DEPOSIT' ? 'DEPOSIT NGN' : 'WITHDRAW NGN'}
        </VadText>
        <VadText variant="title">
          {mode === 'DEPOSIT'
            ? 'Add funds to your wallet.'
            : 'Move available funds out.'}
        </VadText>
        <VadText tone="secondary">
          Enter an amount first. VAD then checks the live payment route,
          identity policy, limits and fees before you can continue.
        </VadText>
      </View>

      <PaymentProgress stage={stage} />

      <View
        style={{
          flexDirection: split && quote ? 'row' : 'column',
          alignItems: 'flex-start',
          gap: theme.spacing.lg,
        }}
      >
        <View
          style={{
            width: '100%',
            flex: split && quote ? 1 : undefined,
            gap: theme.spacing.lg,
          }}
        >
          <View
            style={{
              minHeight: 68,
              borderRadius: theme.radius.lg,
              backgroundColor: providerReady
                ? theme.colors.yesSoft
                : theme.colors.surfaceRaised,
              padding: theme.spacing.md,
              flexDirection: 'row',
              justifyContent: 'space-between',
              gap: theme.spacing.md,
              alignItems: 'center',
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <VadText variant="caption" tone="secondary">
                Payment route
              </VadText>
              <VadText variant="bodyStrong">
                {providerReady ? 'Ready for review' : 'Not ready'}
              </VadText>
            </View>

            <VadText
              variant="caption"
              tone={providerReady ? 'yes' : 'warning'}
            >
              {providerReady ? 'READY' : 'CHECK REQUIRED'}
            </VadText>
          </View>

          <VadInput
            label={
              mode === 'DEPOSIT'
                ? 'Deposit amount'
                : 'Withdrawal amount'
            }
            value={amount}
            onChangeText={(value) => {
              setAmount(value);
              setQuote(null);
            }}
            keyboardType="decimal-pad"
            placeholder="Amount in NGN"
            hint={
              validAmount
                ? 'Amount entered: ₦' + amountValue.toLocaleString()
                : 'Enter an amount greater than zero.'
            }
            error={
              amount.length > 0 && !validAmount
                ? 'Enter a valid amount greater than zero.'
                : undefined
            }
          />

          {!quote ? (
            <VadButton
              label="Check availability & fees"
              loading={working}
              disabled={!validAmount}
              onPress={() => void preview()}
            />
          ) : null}
        </View>

        {quote ? (
          <View
            style={{
              width: '100%',
              flex: split ? 1 : undefined,
              borderWidth: 1,
              borderColor: quote.enabled
                ? theme.colors.brandPrimary
                : theme.colors.warning,
              borderRadius: theme.radius.xl,
              backgroundColor: theme.colors.surface,
              padding: theme.spacing.lg,
              gap: theme.spacing.md,
            }}
          >
            <View style={{ gap: 2 }}>
              <VadText
                variant="label"
                tone={quote.enabled ? 'brand' : 'warning'}
              >
                {quote.enabled ? 'PAYMENT REVIEW' : 'ACTION REQUIRED'}
              </VadText>
              <VadText variant="heading">
                {quote.enabled
                  ? 'Review the final amounts.'
                  : 'This payment cannot continue yet.'}
              </VadText>
            </View>

            {quote.enabled ? (
              <>
                <MoneyRow
                  label="Amount"
                  value={'₦' + Number(quote.amount).toLocaleString()}
                />
                <MoneyRow
                  label="Fee"
                  value={
                    '₦' +
                    Number(quote.feeAmount ?? 0).toLocaleString()
                  }
                />
                <MoneyRow
                  label="Net amount"
                  value={
                    '₦' +
                    Number(
                      quote.netAmount ?? quote.amount,
                    ).toLocaleString()
                  }
                />
                <MoneyRow
                  label="Provider"
                  value={String(
                    quote.providerCode ?? 'Configured route',
                  )}
                />

                <VadButton
                  label={
                    mode === 'DEPOSIT'
                      ? 'Create deposit intent'
                      : 'Create withdrawal intent'
                  }
                  loading={working}
                  onPress={() => void create()}
                />
              </>
            ) : (
              <VadText tone="secondary">{reasonText(quote)}</VadText>
            )}

            <VadButton
              label="Edit amount"
              variant="ghost"
              disabled={working}
              onPress={() => setQuote(null)}
            />
          </View>
        ) : null}
      </View>

      <VadText variant="caption" tone="tertiary">
        Creating an intent does not bypass ledger balance, KYC, capability or
        provider checks. Those remain backend-authoritative.
      </VadText>
    </View>
  );
}

function PaymentProgress({ stage }: { stage: number }) {
  const theme = useVadTheme();
  const labels = ['Amount', 'Check', 'Confirm'];

  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
      {labels.map((label, index) => {
        const active = index <= stage;

        return (
          <View key={label} style={{ flex: 1, gap: theme.spacing.xxs }}>
            <View
              style={{
                height: 4,
                borderRadius: theme.radius.pill,
                backgroundColor: active
                  ? theme.colors.brandPrimary
                  : theme.colors.surfaceMuted,
              }}
            />
            <VadText
              variant="caption"
              tone={
                index === stage
                  ? 'brand'
                  : active
                    ? 'primary'
                    : 'tertiary'
              }
            >
              {label}
            </VadText>
          </View>
        );
      })}
    </View>
  );
}

function MoneyRow({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();

  return (
    <View
      style={{
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
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

function reasonText(quote: PaymentQuote) {
  switch (quote.reason) {
    case 'NO_PAYMENT_PROVIDER':
      return 'No NGN payment provider has been configured yet.';
    case 'KYC_REQUIRED':
      return (
        String(quote.requiredKycLevel ?? 'Required') +
        ' identity verification is needed before this action.'
      );
    case 'CAPABILITY_DISABLED':
      return 'This money-movement capability is currently disabled by VAD policy.';
    case 'BELOW_MINIMUM':
      return (
        'Minimum amount is ₦' +
        Number(quote.minimum ?? 0).toLocaleString() +
        '.'
      );
    case 'ABOVE_MAXIMUM':
      return (
        'Maximum amount is ₦' +
        Number(quote.maximum ?? 0).toLocaleString() +
        '.'
      );
    default:
      return quote.reason ?? 'This action is not available yet.';
  }
}
