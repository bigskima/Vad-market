import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

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
  const load = useCallback(async () => { try { setReadiness(await getProviderReadiness()); } catch { setReadiness({}); } }, []);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);

  async function preview() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    setWorking(true);
    try { setQuote(await quotePayment(mode, value)); }
    catch (error) { Alert.alert('Could not prepare payment', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setWorking(false); }
  }

  async function create() {
    if (!quote?.enabled) return;
    setWorking(true);
    try { const publicId = await createPaymentIntent(mode, Number(amount)); Alert.alert('Payment intent created', `Reference ${publicId}. External processing starts only through a configured provider.`); setQuote(null); setAmount(''); }
    catch (error) { Alert.alert('Payment unavailable', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setWorking(false); }
  }

  const providerReady = mode === 'DEPOSIT' ? readiness.depositConfigured : readiness.withdrawalConfigured;
  return <VadCard style={{ gap: theme.spacing.sm }}>
    <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' }}><View style={{ flex: 1, gap: theme.spacing.xxs }}><VadText variant="label" tone="brand">MONEY MOVEMENT</VadText><VadText variant="heading">NGN funding & withdrawals</VadText><VadText variant="caption" tone="secondary">Provider-neutral until a payment company is selected.</VadText></View><VadCard variant="outlined" style={{ padding: theme.spacing.xs, borderRadius: theme.radius.pill }}><VadText variant="caption" tone={providerReady ? 'yes' : 'secondary'}>{providerReady ? 'READY' : 'NO PROVIDER'}</VadText></VadCard></View>
    <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}><VadButton fullWidth={false} label="Deposit" variant={mode === 'DEPOSIT' ? 'primary' : 'secondary'} onPress={() => { setMode('DEPOSIT'); setQuote(null); }} /><VadButton fullWidth={false} label="Withdraw" variant={mode === 'WITHDRAWAL' ? 'primary' : 'secondary'} onPress={() => { setMode('WITHDRAWAL'); setQuote(null); }} /></View>
    <VadInput value={amount} onChangeText={(value) => { setAmount(value); setQuote(null); }} keyboardType="decimal-pad" placeholder="Amount in NGN" />
    <VadButton label="Check availability & fees" loading={working} disabled={!amount} onPress={() => void preview()} />
    {quote ? <VadCard variant="raised" style={{ gap: theme.spacing.xs }}><VadText variant="bodyStrong" tone={quote.enabled ? 'yes' : 'warning'}>{quote.enabled ? 'Available' : 'Not available yet'}</VadText><VadText tone="secondary">{quote.enabled ? `${quote.providerCode} · fee ₦${Number(quote.feeAmount ?? 0).toLocaleString()} · net ₦${Number(quote.netAmount ?? quote.amount).toLocaleString()}` : reasonText(quote)}</VadText>{quote.enabled ? <VadButton label="Create payment intent" loading={working} onPress={() => void create()} /> : null}</VadCard> : null}
  </VadCard>;
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
