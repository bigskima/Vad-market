import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSegmentedControl } from '@/components/ui/vad-segmented-control';
import { VadText } from '@/components/ui/vad-text';
import { runtimeCapabilityReason } from '@/features/policy/runtime-capability-copy';
import { useProductDensity } from '@/hooks/use-product-density';
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

const PAYMENT_MODES = [
  { value: 'DEPOSIT', label: 'Deposit' },
  { value: 'WITHDRAWAL', label: 'Withdraw' },
] as const;

export function PaymentReadinessCard({
  initialMode = 'DEPOSIT',
  lockMode = false,
  canOperate = true,
  capabilityReason,
  capabilityLoading = false,
}: {
  initialMode?: Mode;
  lockMode?: boolean;
  canOperate?: boolean;
  capabilityReason?: string;
  capabilityLoading?: boolean;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const split = density.width >= 820;
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
          : 'We could not check payment availability right now. Please try again.',
      );
    }
  }, []);

  useEffect(() => {
    if (!canOperate || capabilityLoading) return;

    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [canOperate, capabilityLoading, load]);

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
    if (
      capabilityLoading ||
      !canOperate ||
      !Number.isFinite(value) ||
      value <= 0 ||
      working
    ) return;

    setWorking(true);
    setActionError(null);

    try {
      setQuote(await quotePayment(mode, value));
    } catch (error) {
      setQuote(null);
      setActionError(
        error instanceof Error
          ? error.message
          : 'We could not prepare this payment. Please try again.',
      );
    } finally {
      setWorking(false);
    }
  }

  async function create() {
    if (
      capabilityLoading ||
      !canOperate ||
      !quote?.enabled ||
      working
    ) return;

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
          : 'We could not start this payment. Please try again.',
      );
    } finally {
      setWorking(false);
    }
  }

  const paymentAvailable =
    mode === 'DEPOSIT'
      ? readiness?.depositConfigured
      : readiness?.withdrawalConfigured;

  const amountValue = Number(amount);
  const validAmount = Number.isFinite(amountValue) && amountValue > 0;
  const stage = createdIntentId ? 3 : quote ? 2 : amount ? 1 : 0;
  const actionLabel = mode === 'DEPOSIT' ? 'deposit' : 'withdrawal';
  const accountReady = canOperate && !capabilityLoading;

  if (createdIntentId) {
    return (
      <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
        <VadCard variant="raised" style={{ borderColor: theme.colors.yes, gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
          <VadChip label={mode === 'DEPOSIT' ? 'DEPOSIT STARTED' : 'WITHDRAWAL STARTED'} tone="yes" />
          <View style={{ gap: 2 }}>
            <VadText variant={density.compact ? 'heading' : 'title'}>
              {mode === 'DEPOSIT' ? 'Your deposit is in progress.' : 'Your withdrawal is in progress.'}
            </VadText>
            <VadText variant="caption" tone="secondary">
              We&apos;ll keep the status updated here and in your wallet activity.
            </VadText>
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm, gap: 1 }}>
            <VadText variant="caption" tone="tertiary">REFERENCE</VadText>
            <VadText variant="bodyStrong" selectable>{createdIntentId}</VadText>
          </View>
        </VadCard>

        <View style={{ flexDirection: split ? 'row' : density.narrow ? 'column' : 'row', gap: theme.spacing.sm }}>
          <VadButton
            label="Wallet activity"
            onPress={() => router.push('/wallet/activity')}
            style={{ flex: 1 }}
          />
          <VadButton
            label={`New ${actionLabel}`}
            variant="secondary"
            onPress={resetFlow}
            style={{ flex: 1 }}
          />
        </View>

        <VadText variant="caption" tone="tertiary">
          Your wallet balance updates after the payment is completed.
        </VadText>
      </View>
    );
  }

  return (
    <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
      {!lockMode ? (
        <VadSegmentedControl value={mode} options={PAYMENT_MODES} onChange={switchMode} />
      ) : null}

      <View style={{ gap: 2 }}>
        <VadText variant="caption" tone="brand">
          {mode === 'DEPOSIT' ? 'DEPOSIT NGN' : 'WITHDRAW NGN'}
        </VadText>
        <VadText variant={density.compact ? 'heading' : 'title'}>
          {mode === 'DEPOSIT' ? 'Add funds to your wallet.' : 'Move available funds out.'}
        </VadText>
        <VadText variant="caption" tone="secondary">
          We&apos;ll show any fees and requirements before you continue.
        </VadText>
      </View>

      <PaymentProgress stage={stage} />

      {capabilityLoading ? (
        <InlineStatus
          tone="warning"
          title="Checking availability"
          message={runtimeCapabilityReason('CAPABILITIES_LOADING')}
        />
      ) : !canOperate ? (
        <InlineStatus
          tone="warning"
          title={mode === 'DEPOSIT' ? 'Deposits are not available' : 'Withdrawals are not available'}
          message={runtimeCapabilityReason(capabilityReason)}
        />
      ) : null}

      {accountReady && readinessError ? (
        <VadErrorState
          title="Payment unavailable"
          message={readinessError}
          onRetry={() => void load()}
        />
      ) : null}

      <View
        style={{
          flexDirection: split && quote ? 'row' : 'column',
          alignItems: 'flex-start',
          gap: density.compact ? theme.spacing.md : theme.spacing.lg,
        }}
      >
        <VadCard variant="raised" style={{ width: '100%', flex: split && quote ? 1 : undefined, gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, gap: 1 }}>
              <VadText variant="caption" tone="secondary">Can you continue?</VadText>
              <VadText variant="bodyStrong" numberOfLines={1}>
                {capabilityLoading
                  ? 'Checking your account'
                  : !canOperate
                    ? 'Not available for your account'
                    : readiness == null
                      ? 'Checking availability'
                      : paymentAvailable
                        ? 'Yes, this is available'
                        : 'Temporarily unavailable'}
              </VadText>
            </View>
            <VadChip
              label={capabilityLoading || readiness == null ? 'CHECKING' : accountReady && paymentAvailable ? 'READY' : 'UNAVAILABLE'}
              tone={accountReady && paymentAvailable ? 'yes' : 'warning'}
            />
          </View>

          <VadInput
            label={mode === 'DEPOSIT' ? 'Deposit amount' : 'Withdrawal amount'}
            value={amount}
            onChangeText={(value) => {
              setAmount(value);
              clearReview();
            }}
            editable={accountReady}
            keyboardType="decimal-pad"
            placeholder="Amount in NGN"
            returnKeyType="done"
            onSubmitEditing={() => {
              if (accountReady && validAmount) void preview();
            }}
            hint={
              accountReady
                ? validAmount
                  ? '₦' + amountValue.toLocaleString()
                  : 'Enter an amount greater than zero.'
                : 'You can enter an amount when this action becomes available.'
            }
            error={
              accountReady && amount.length > 0 && !validAmount
                ? 'Enter a valid amount greater than zero.'
                : undefined
            }
          />

          {accountReady && readiness && !paymentAvailable ? (
            <InlineStatus
              tone="warning"
              title="Payment temporarily unavailable"
              message={`We cannot start this ${actionLabel} right now. Please try again later.`}
            />
          ) : null}

          {actionError ? (
            <InlineStatus
              tone="danger"
              title={quote ? 'Payment not started' : 'Could not review payment'}
              message={actionError}
            />
          ) : null}

          {!quote ? (
            <VadButton
              label={mode === 'DEPOSIT' ? 'Review deposit' : 'Review withdrawal'}
              loading={working || capabilityLoading}
              disabled={!accountReady || !validAmount || readinessError != null}
              onPress={() => void preview()}
            />
          ) : null}
        </VadCard>

        {quote ? (
          <VadCard
            variant={quote.enabled ? 'brand' : 'raised'}
            style={{
              width: '100%',
              flex: split ? 1 : undefined,
              borderColor: quote.enabled ? theme.colors.brandPrimary : theme.colors.warning,
              gap: density.compact ? theme.spacing.sm : theme.spacing.md,
            }}
          >
            <View style={{ gap: 2 }}>
              <VadText variant="caption" tone={quote.enabled ? 'brand' : 'warning'}>
                {quote.enabled ? 'PAYMENT REVIEW' : 'ACTION REQUIRED'}
              </VadText>
              <VadText variant="heading">
                {quote.enabled ? 'Check the amounts before you continue.' : 'This payment cannot continue yet.'}
              </VadText>
            </View>

            {quote.enabled ? (
              <>
                <MoneyRow label="Amount" value={'₦' + Number(quote.amount).toLocaleString()} />
                <MoneyRow label="Fee" value={'₦' + Number(quote.feeAmount ?? 0).toLocaleString()} />
                <MoneyRow label="You receive" value={'₦' + Number(quote.netAmount ?? quote.amount).toLocaleString()} emphasized />

                <VadButton
                  label={mode === 'DEPOSIT' ? 'Start deposit' : 'Confirm withdrawal'}
                  loading={working}
                  disabled={!accountReady}
                  onPress={() => void create()}
                />
              </>
            ) : (
              <VadText variant="caption" tone="secondary">{reasonText(quote)}</VadText>
            )}

            <VadButton
              label="Edit amount"
              variant="ghost"
              size="small"
              disabled={working}
              onPress={clearReview}
            />
          </VadCard>
        ) : null}
      </View>

      <VadText variant="caption" tone="tertiary">
        Your balance, verification, fees and limits are checked before a payment starts.
      </VadText>
    </View>
  );
}

function PaymentProgress({ stage }: { stage: number }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const labels = ['Amount', 'Review', 'Confirm'];

  return (
    <View style={{ flexDirection: 'row', gap: density.compact ? 6 : theme.spacing.xs }}>
      {labels.map((label, index) => {
        const active = index <= Math.min(stage, 2);

        return (
          <View key={label} style={{ flex: 1, gap: 3 }}>
            <View
              style={{
                height: density.compact ? 3 : 4,
                borderRadius: theme.radius.pill,
                backgroundColor: active ? theme.colors.brandPrimary : theme.colors.surfaceMuted,
              }}
            />
            <VadText
              variant="caption"
              tone={index === Math.min(stage, 2) ? 'brand' : active ? 'primary' : 'tertiary'}
              numberOfLines={1}
            >
              {label}
            </VadText>
          </View>
        );
      })}
    </View>
  );
}

function MoneyRow({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  const theme = useVadTheme();
  const density = useProductDensity();

  return (
    <View style={{ minHeight: density.compact ? 36 : 40, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
      <VadText variant="caption" tone="secondary" style={{ flex: 1 }}>{label}</VadText>
      <VadText variant={emphasized ? 'heading' : 'bodyStrong'} tone={emphasized ? 'brand' : 'primary'} numberOfLines={1}>{value}</VadText>
    </View>
  );
}

function InlineStatus({ tone, title, message }: { tone: 'warning' | 'danger'; title: string; message: string }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const danger = tone === 'danger';

  return (
    <View accessibilityRole="alert" style={{ borderLeftWidth: 3, borderLeftColor: danger ? theme.colors.danger : theme.colors.warning, backgroundColor: danger ? theme.colors.noSoft : theme.colors.warningSoft, padding: density.compact ? 10 : theme.spacing.md, gap: 2, borderRadius: theme.radius.sm }}>
      <VadText variant="caption" tone={tone}>{title.toUpperCase()}</VadText>
      <VadText variant="caption" tone="secondary">{message}</VadText>
    </View>
  );
}

function reasonText(quote: PaymentQuote) {
  switch (quote.reason) {
    case 'NO_PAYMENT_PROVIDER':
      return 'This payment service is temporarily unavailable. Please try again later.';
    case 'KYC_REQUIRED':
      return 'Complete the required identity verification before you can continue.';
    case 'CAPABILITY_DISABLED':
      return 'This payment action is not available for your account right now.';
    case 'BELOW_MINIMUM':
      return 'Minimum amount is ₦' + Number(quote.minimum ?? 0).toLocaleString() + '.';
    case 'ABOVE_MAXIMUM':
      return 'Maximum amount is ₦' + Number(quote.maximum ?? 0).toLocaleString() + '.';
    default:
      return 'This payment cannot continue right now. Check your account or try again later.';
  }
}
