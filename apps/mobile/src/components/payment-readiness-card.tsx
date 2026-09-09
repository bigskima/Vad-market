import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { createPaymentIntent, getProviderReadiness, quotePayment, type PaymentQuote } from '@/services/payment-api';

type Mode = 'DEPOSIT' | 'WITHDRAWAL';

export function PaymentReadinessCard() {
  const theme = useVadTheme();
  const [readiness, setReadiness] = useState<{ depositConfigured?: boolean; withdrawalConfigured?: boolean }>({});
  const [mode, setMode] = useState<Mode>('DEPOSIT');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<PaymentQuote | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try { setReadiness(await getProviderReadiness()); } catch { setReadiness({}); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function preview() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    setWorking(true);
    try {
      setQuote(await quotePayment(mode, value));
    } catch (error) {
      Alert.alert('Could not prepare payment', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorking(false);
    }
  }

  async function create() {
    if (!quote?.enabled) return;
    setWorking(true);
    try {
      const publicId = await createPaymentIntent(mode, Number(amount));
      Alert.alert('Payment intent created', `Reference ${publicId}. External processing starts only through a configured provider.`);
      setQuote(null);
      setAmount('');
    } catch (error) {
      Alert.alert('Payment unavailable', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorking(false);
    }
  }

  const providerReady = mode === 'DEPOSIT' ? readiness.depositConfigured : readiness.withdrawalConfigured;
  const amountValue = Number(amount);
  const validAmount = Number.isFinite(amountValue) && amountValue > 0;

  return <VadCard variant="raised" style={{ gap: theme.spacing.md, borderRadius: theme.radius.xl }}>
    <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        <VadText variant="label" tone="brand">MONEY MOVEMENT</VadText>
        <VadText variant="heading">NGN funding & withdrawals</VadText>
        <VadText variant="caption" tone="secondary">Quotes are evaluated against live KYC, limits, fees and provider readiness.</VadText>
      </View>

      <View
        style={{
          borderRadius: theme.radius.pill,
          backgroundColor: providerReady ? theme.colors.yesSoft : theme.colors.surfaceMuted,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: theme.spacing.xs,
        }}
      >
        <VadText variant="caption" tone={providerReady ? 'yes' : 'secondary'}>
          {providerReady ? 'ROUTE READY' : 'NO ROUTE'}
        </VadText>
      </View>
    </View>

    <View style={{ flexDirection: 'row', backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: theme.spacing.xxs, gap: theme.spacing.xxs }}>
      {(['DEPOSIT', 'WITHDRAWAL'] as const).map((item) => {
        const selected = mode === item;
        return <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected }}
          key={item}
          onPress={() => { setMode(item); setQuote(null); }}
          style={{
            flex: 1,
            alignItems: 'center',
            paddingVertical: theme.spacing.sm,
            borderRadius: theme.radius.md,
            backgroundColor: selected ? theme.colors.brandSoft : 'transparent',
          }}
        >
          <VadText variant="label" tone={selected ? 'brand' : 'secondary'}>
            {item === 'DEPOSIT' ? 'Deposit' : 'Withdraw'}
          </VadText>
        </Pressable>;
      })}
    </View>

    <VadInput
      label={mode === 'DEPOSIT' ? 'Deposit amount' : 'Withdrawal amount'}
      value={amount}
      onChangeText={(value) => { setAmount(value); setQuote(null); }}
      keyboardType="decimal-pad"
      placeholder="Amount in NGN"
    />

    <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
      <MoneyFact label="Currency" value="NGN" />
      <MoneyFact label="Provider" value={providerReady ? 'Configured' : 'Pending'} />
    </View>

    <VadButton
      label="Check availability & fees"
      loading={working}
      disabled={!validAmount}
      onPress={() => void preview()}
    />

    {quote ? <VadCard variant={quote.enabled ? 'muted' : 'outlined'} style={{ gap: theme.spacing.sm, borderRadius: theme.radius.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'center' }}>
        <VadText variant="bodyStrong" tone={quote.enabled ? 'yes' : 'warning'}>
          {quote.enabled ? 'Ready to continue' : 'Not available yet'}
        </VadText>
        <VadText variant="caption" tone="secondary">{mode === 'DEPOSIT' ? 'Deposit quote' : 'Withdrawal quote'}</VadText>
      </View>

      <VadText tone="secondary">
        {quote.enabled
          ? `${quote.providerCode} · fee ₦${Number(quote.feeAmount ?? 0).toLocaleString()} · net ₦${Number(quote.netAmount ?? quote.amount).toLocaleString()}`
          : reasonText(quote)}
      </VadText>

      {quote.enabled ? <VadButton label="Create payment intent" loading={working} onPress={() => void create()} /> : null}
    </VadCard> : null}

    {!providerReady && !quote ? (
      <VadText variant="caption" tone="secondary">
        You can still request a quote. The backend will return the exact reason if the selected operation cannot proceed.
      </VadText>
    ) : null}
  </VadCard>;
}

function MoneyFact({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return <View style={{ flex: 1, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.xs, gap: theme.spacing.xxs }}>
    <VadText variant="caption" tone="secondary">{label}</VadText>
    <VadText variant="bodyStrong">{value}</VadText>
  </View>;
}

function reasonText(quote: PaymentQuote) {
  switch (quote.reason) {
    case 'NO_PAYMENT_PROVIDER': return 'No NGN payment provider has been configured yet.';
    case 'KYC_REQUIRED': return `${quote.requiredKycLevel ?? 'Required'} identity verification is needed before this action.`;
    case 'CAPABILITY_DISABLED': return 'This money-movement capability is currently disabled by VAD policy.';
    case 'BELOW_MINIMUM': return `Minimum amount is ₦${Number(quote.minimum ?? 0).toLocaleString()}.`;
    case 'ABOVE_MAXIMUM': return `Maximum amount is ₦${Number(quote.maximum ?? 0).toLocaleString()}.`;
    default: return quote.reason ?? 'This action is not available yet.';
  }
}
