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
          : 'Payment readiness could not be loaded.',
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
          : 'The payment review could not be prepared.',
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
  const policyReady = canOperate && !capabilityLoading;

  if (createdIntentId) {
    return (
      <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
        <VadCard variant="raised" style={{ borderColor: theme.colors.yes, gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
          <VadChip label={mode === 'DEPOSIT' ? 'DEPOSIT CREATED' : 'WITHDRAWAL CREATED'} tone="yes" />
          <View style={{ gap: 2 }}>
            <VadText variant={density.compact ? 'heading' : 'title'}>Your payment request is live.</VadText>
            <VadText variant="caption" tone="secondary">
              Provider state may continue changing until this {actionLabel} settles or fails.
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
          Creating an intent is not settlement. Wallet and ledger balances remain authoritative.
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
          VAD checks account policy, provider routing, verification, limits and fees before continuing.
        </VadText>
      </View>

      <PaymentProgress stage={stage} />

      {capabilityLoading ? (
        <InlineStatus
          tone="warning"
          title="Checking account policy"
          message={runtimeCapabilityReason('CAPABILITIES_LOADING')}
        />
      ) : !canOperate ? (
        <InlineStatus
          tone="warning"
          title={mode === 'DEPOSIT' ? 'Deposits are not available' : 'Withdrawals are not available'}
          message={runtimeCapabilityReason(capabilityReason)}
        />
      ) : null}

      {policyReady && readinessError ? (
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
          gap: density.compact ? theme.spacing.md : theme.spacing.lg,
        }}
      >
        <VadCard variant="raised" style={{ width: '100%', flex: split && quote ? 1 : undefined, gap: density.compact ? theme.spacing.sm : theme.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, gap: 1 }}>
              <VadText variant="caption" tone="secondary">Payment route</VadText>
              <VadText variant="bodyStrong" numberOfLines={1}>
                {capabilityLoading
                  ? 'Checking policy'
                  : !canOperate
                    ? 'Blocked by policy'
                    : readiness == null
                      ? 'Checking provider'
                      : providerReady
                        ? 'Ready for live checks'
                        : 'Not configured'}
              </VadText>
            </View>
            <VadChip
              label={capabilityLoading || readiness == null ? 'CHECKING' : policyReady && providerReady ? 'READY' : 'ACTION NEEDED'}
              tone={policyReady && providerReady ? 'yes' : 'warning'}
            />
          </View>

          <VadInput
            label={mode === 'DEPOSIT' ? 'Deposit amount' : 'Withdrawal amount'}
            value={amount}
            onChangeText={(value) => {
              setAmount(value);
              clearReview();
            }}
            editable={policyReady}
            keyboardType="decimal-pad"
            placeholder="Amount in NGN"
            returnKeyType="done"
            onSubmitEditing={() => {
              if (policyReady && validAmount) void preview();
            }}
            hint={
              policyReady
                ? validAmount
                  ? '₦' + amountValue.toLocaleString()
                  : 'Enter an amount greater than zero.'
                : 'Amount entry unlocks when policy allows this action.'
            }
            error={
              policyReady && amount.length > 0 && !validAmount
                ? 'Enter a valid amount greater than zero.'
                : undefined
            }
          />

          {policyReady && readiness && !providerReady ? (
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
              label="Check fees & availability"
              loading={working || capabilityLoading}
              disabled={!policyReady || !validAmount || readinessError != null}
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
                {quote.enabled ? 'Review the final amounts.' : 'This payment cannot continue yet.'}
              </VadText>
            </View>

            {quote.enabled ? (
              <>
                <MoneyRow label="Amount" value={'₦' + Number(quote.amount).toLocaleString()} />
                <MoneyRow label="Fee" value={'₦' + Number(quote.feeAmount ?? 0).toLocaleString()} />
                <MoneyRow label="Net amount" value={'₦' + Number(quote.netAmount ?? quote.amount).toLocaleString()} emphasized />
                <MoneyRow label="Provider" value={String(quote.providerCode ?? 'Configured route')} />

                <VadButton
                  label={mode === 'DEPOSIT' ? 'Create deposit' : 'Create withdrawal'}
                  loading={working}
                  disabled={!policyReady}
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
        Payment creation never bypasses ledger balance, KYC, capability or provider checks.
      </VadText>
    </View>
  );
}

function PaymentProgress({ stage }: { stage: number }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const labels = ['Amount', 'Check', 'Confirm'];

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
    <View style={{ borderLeftWidth: 3, borderLeftColor: danger ? theme.colors.danger : theme.colors.warning, backgroundColor: danger ? theme.colors.noSoft : theme.colors.warningSoft, padding: density.compact ? 10 : theme.spacing.md, gap: 2, borderRadius: theme.radius.sm }}>
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
      return String(quote.requiredKycLevel ?? 'Required') + ' identity verification is needed before this action.';
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
