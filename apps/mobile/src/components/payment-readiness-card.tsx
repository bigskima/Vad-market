import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadErrorState } from '@/components/ui/vad-error-state';
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

type Readiness = {
  depositConfigured?: boolean;
  withdrawalConfigured?: boolean;
};

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
  const compact = width < 380;
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<PaymentQuote | null>(null);
  const [createdIntentId, setCreatedIntentId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setReadinessError(null);

    try {
      setReadiness(await getProviderReadiness());
    } catch (error) {
      setReadinessError(
        error instanceof Error
          ? error.message
          : 'Payment readiness could not be loaded.',
      );
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  function clearReview() {
    setQuote(null);
    setActionError(null);
  }

  function resetFlow() {
    setCreatedIntentId(null);
    setQuote(null);
    setAmount('');
    setActionError(null);
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    resetFlow();
  }

  async function preview() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;

    setWorking(true);
    setActionError(null);

    try {
      setQuote(await quotePayment(mode, value));
    } catch (error) {
      setQuote(null);
      setActionError(
        error instanceof Error
          ? error.message
          : 'The payment review could not be prepared.',
      );
    } finally {
      setWorking(false);
    }
  }

  async function create() {
    if (!quote?.enabled) return;

    setWorking(true);
    setActionError(null);

    try {
      const publicId = await createPaymentIntent(mode, Number(amount));
      setCreatedIntentId(publicId);
      setQuote(null);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'The payment intent could not be created.',
      );
    } finally {
      setWorking(false);
    }
  }

  const providerReady =
    mode === 'DEPOSIT'
      ? readiness?.depositConfigured
      : readiness?.withdrawalConfigured;

  const amountValue = Number(amount);
  const validAmount = Number.isFinite(amountValue) && amountValue > 0;
  const stage = createdIntentId ? 3 : quote ? 2 : amount ? 1 : 0;
  const actionLabel = mode === 'DEPOSIT' ? 'deposit' : 'withdrawal';

  if (createdIntentId) {
    return (
      <View style={{ gap: theme.spacing.xl }}>
        <View
          style={{
            borderLeftWidth: 3,
            borderLeftColor: theme.colors.yes,
            backgroundColor: theme.colors.yesSoft,
            padding: compact ? theme.spacing.lg : theme.spacing.xl,
            gap: theme.spacing.md,
          }}
        >
          <VadText variant="label" tone="yes">
            {mode === 'DEPOSIT' ? 'DEPOSIT CREATED' : 'WITHDRAWAL CREATED'}
          </VadText>
          <VadText variant="title">Your payment intent is live.</VadText>
          <VadText tone="secondary">
            VAD created the {actionLabel} request. Provider and ledger state can
            continue changing until the intent settles or fails.
          </VadText>

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              paddingTop: theme.spacing.md,
              gap: 2,
            }}
          >
            <VadText variant="caption" tone="tertiary">REFERENCE</VadText>
            <VadText variant="bodyStrong" selectable>
              {createdIntentId}
            </VadText>
          </View>
        </View>

        <View
          style={{
            flexDirection: split ? 'row' : 'column',
            gap: theme.spacing.sm,
          }}
        >
          <VadButton
            label="Open Wallet activity"
            onPress={() => router.push('/wallet/activity')}
            style={{ flex: 1 }}
          />
          <VadButton
            label={'Create another ' + actionLabel}
            variant="secondary"
            onPress={resetFlow}
            style={{ flex: 1 }}
          />
        </View>

        <VadText variant="caption" tone="tertiary">
          Creating an intent is not settlement. Wallet and ledger balances stay
          authoritative.
        </VadText>
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.xl }}>
      {!lockMode ? (
        <View
          accessibilityRole="tablist"
          style={{
            flexDirection: 'row',
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          {(['DEPOSIT', 'WITHDRAWAL'] as const).map((item) => {
            const selected = mode === item;

            return (
              <Pressable
                key={item}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => switchMode(item)}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 46,
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
          VAD checks the live route, identity policy, limits and fees before the
          request can continue.
        </VadText>
      </View>

      <PaymentProgress stage={stage} />

      {readinessError ? (
        <VadErrorState
          title="Payment readiness unavailable"
          message={readinessError}
          onRetry={() => void load()}
        />
      ) : null}

      <View
        style={{
          flexDirection: split && quote ? 'row' : 'column',
          alignItems: 'flex-start',
          gap: theme.spacing.xl,
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
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: theme.colors.border,
              paddingVertical: theme.spacing.md,
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
                {readiness == null
                  ? 'Checking readiness'
                  : providerReady
                    ? 'Ready for live checks'
                    : 'Not configured'}
              </VadText>
            </View>

            <VadText
              variant="caption"
              tone={providerReady ? 'yes' : 'warning'}
            >
              {readiness == null
                ? 'CHECKING'
                : providerReady
                  ? 'READY'
                  : 'ACTION REQUIRED'}
            </VadText>
          </View>

          <VadInput
            label={mode === 'DEPOSIT' ? 'Deposit amount' : 'Withdrawal amount'}
            value={amount}
            onChangeText={(value) => {
              setAmount(value);
              clearReview();
            }}
            keyboardType="decimal-pad"
            placeholder="Amount in NGN"
            returnKeyType="done"
            onSubmitEditing={() => {
              if (validAmount) void preview();
            }}
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

          {readiness && !providerReady ? (
            <InlineStatus
              tone="warning"
              title="Payment route not ready"
              message="The backend will not allow this action until an active provider route is available."
            />
          ) : null}

          {actionError ? (
            <InlineStatus
              tone="danger"
              title={quote ? 'Payment not created' : 'Payment review unavailable'}
              message={actionError}
            />
          ) : null}

          {!quote ? (
            <VadButton
              label="Check availability & fees"
              loading={working}
              disabled={!validAmount || readinessError != null}
              onPress={() => void preview()}
            />
          ) : null}
        </View>

        {quote ? (
          <View
            style={{
              width: '100%',
              flex: split ? 1 : undefined,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: quote.enabled
                ? theme.colors.brandPrimary
                : theme.colors.warning,
              paddingVertical: theme.spacing.lg,
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
                <MoneyRow label="Amount" value={'₦' + Number(quote.amount).toLocaleString()} />
                <MoneyRow label="Fee" value={'₦' + Number(quote.feeAmount ?? 0).toLocaleString()} />
                <MoneyRow
                  label="Net amount"
                  value={'₦' + Number(quote.netAmount ?? quote.amount).toLocaleString()}
                  emphasized
                />
                <MoneyRow
                  label="Provider"
                  value={String(quote.providerCode ?? 'Configured route')}
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
              onPress={clearReview}
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
        const active = index <= Math.min(stage, 2);

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
                index === Math.min(stage, 2)
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

function MoneyRow({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
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
      <VadText
        variant={emphasized ? 'heading' : 'bodyStrong'}
        tone={emphasized ? 'brand' : 'primary'}
      >
        {value}
      </VadText>
    </View>
  );
}

function InlineStatus({
  tone,
  title,
  message,
}: {
  tone: 'warning' | 'danger';
  title: string;
  message: string;
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
      <VadText variant="caption" tone="secondary">{message}</VadText>
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
      return 'Minimum amount is ₦' + Number(quote.minimum ?? 0).toLocaleString() + '.';
    case 'ABOVE_MAXIMUM':
      return 'Maximum amount is ₦' + Number(quote.maximum ?? 0).toLocaleString() + '.';
    default:
      return quote.reason ?? 'This action is not available yet.';
  }
}
