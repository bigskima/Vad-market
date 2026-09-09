import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { palette } from '@/constants/palette';
import { createPaymentIntent, getProviderReadiness, quotePayment, type PaymentQuote } from '@/services/payment-api';

type Mode = 'DEPOSIT' | 'WITHDRAWAL';

export function PaymentReadinessCard() {
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
    try { setQuote(await quotePayment(mode, value)); }
    catch (error) { Alert.alert('Could not prepare payment', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setWorking(false); }
  }

  async function create() {
    if (!quote?.enabled) return;
    setWorking(true);
    try {
      const publicId = await createPaymentIntent(mode, Number(amount));
      Alert.alert('Payment intent created', `Reference ${publicId}. The external provider step will begin only after a payment provider is configured.`);
      setQuote(null); setAmount('');
    } catch (error) { Alert.alert('Payment unavailable', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setWorking(false); }
  }

  const providerReady = mode === 'DEPOSIT' ? readiness.depositConfigured : readiness.withdrawalConfigured;

  return <View style={s.card}>
    <View style={s.row}><View style={s.copy}><Text style={s.eyebrow}>MONEY MOVEMENT</Text><Text style={s.title}>NGN funding & withdrawals</Text><Text style={s.muted}>Provider-neutral until a payment company is selected.</Text></View><View style={s.badge}><Text style={s.badgeText}>{providerReady ? 'READY' : 'NO PROVIDER'}</Text></View></View>
    <View style={s.modeRow}><Pressable style={[s.mode,mode==='DEPOSIT'&&s.modeActive]} onPress={() => { setMode('DEPOSIT'); setQuote(null); }}><Text style={s.modeText}>Deposit</Text></Pressable><Pressable style={[s.mode,mode==='WITHDRAWAL'&&s.modeActive]} onPress={() => { setMode('WITHDRAWAL'); setQuote(null); }}><Text style={s.modeText}>Withdraw</Text></Pressable></View>
    <TextInput value={amount} onChangeText={(value) => { setAmount(value); setQuote(null); }} keyboardType="decimal-pad" placeholder="Amount in NGN" placeholderTextColor={palette.textMuted} style={s.input} />
    <Pressable disabled={working || !amount} style={[s.button,(working||!amount)&&s.disabled]} onPress={() => void preview()}><Text style={s.buttonText}>{working ? 'Checking…' : 'Check availability & fees'}</Text></Pressable>
    {quote && <View style={s.quote}><Text style={s.quoteTitle}>{quote.enabled ? 'Available' : 'Not available yet'}</Text><Text style={s.muted}>{quote.enabled ? `${quote.providerCode} · fee ₦${Number(quote.feeAmount ?? 0).toLocaleString()} · net ₦${Number(quote.netAmount ?? quote.amount).toLocaleString()}` : reasonText(quote)}</Text>{quote.enabled && <Pressable style={s.button} disabled={working} onPress={() => void create()}><Text style={s.buttonText}>Create payment intent</Text></Pressable>}</View>}
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

const s = StyleSheet.create({card:{backgroundColor:palette.panel,borderColor:palette.line,borderWidth:1,borderRadius:20,padding:15,gap:12},row:{flexDirection:'row',gap:10,alignItems:'flex-start'},copy:{flex:1,gap:3},eyebrow:{color:palette.signal,fontWeight:'900',fontSize:11,letterSpacing:1.1},title:{color:palette.text,fontWeight:'900',fontSize:18},muted:{color:palette.textMuted,fontSize:12,lineHeight:18},badge:{borderWidth:1,borderColor:palette.line,borderRadius:999,paddingHorizontal:8,paddingVertical:6},badgeText:{color:palette.text,fontWeight:'900',fontSize:9},modeRow:{flexDirection:'row',gap:8},mode:{flex:1,borderWidth:1,borderColor:palette.line,borderRadius:12,padding:10,alignItems:'center'},modeActive:{borderColor:palette.signal,backgroundColor:palette.inkRaised},modeText:{color:palette.text,fontWeight:'800'},input:{borderWidth:1,borderColor:palette.line,borderRadius:12,padding:12,color:palette.text},button:{backgroundColor:palette.signal,borderRadius:13,padding:12,alignItems:'center'},buttonText:{color:palette.ink,fontWeight:'900'},disabled:{opacity:.45},quote:{backgroundColor:palette.inkRaised,borderRadius:13,padding:12,gap:8},quoteTitle:{color:palette.text,fontWeight:'900'}});
