import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const theme = useVadTheme();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signUp');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canSubmit = email.includes('@') && password.length >= 8 && (mode === 'signIn' || displayName.trim().length > 0) && !isSubmitting;

  async function submit() {
    if (!canSubmit) return;
    setIsSubmitting(true); setMessage(null);
    try { const result = mode === 'signIn' ? await signIn(email, password) : await signUp({ displayName, email, password }); setMessage(result.message ?? null); }
    finally { setIsSubmitting(false); }
  }

  function selectMode(next: 'signIn' | 'signUp') { setMode(next); setMessage(null); }

  return <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ alignSelf: 'center', flexGrow: 1, justifyContent: 'center', maxWidth: 620, paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.xxl, width: '100%', gap: theme.spacing.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <View style={{ width: 40, height: 40, borderRadius: theme.radius.md, backgroundColor: theme.colors.brandPrimary, alignItems: 'center', justifyContent: 'center' }}><VadText variant="heading" tone="inverse">V</VadText></View>
          <VadText variant="heading">VAD</VadText>
          <VadCard variant="outlined" style={{ marginLeft: 'auto', borderRadius: theme.radius.pill, paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.sm }}><VadText variant="caption" tone="secondary">NIGERIA · PHASE 1</VadText></VadCard>
        </View>

        <View style={{ gap: theme.spacing.sm }}><VadText variant="label" tone="brand">VALUE ASSET DEPOT</VadText><VadText variant="display">Conviction becomes visible.</VadText><VadText tone="secondary">Follow ideas, understand the event, and take a position only when the rules and source of truth are clear.</VadText></View>

        <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.xxs, gap: theme.spacing.xxs }}>
            {(['signUp', 'signIn'] as const).map((item) => <Pressable key={item} onPress={() => selectMode(item)} style={{ flex: 1, alignItems: 'center', borderRadius: theme.radius.sm, paddingVertical: theme.spacing.sm, backgroundColor: mode === item ? theme.colors.brandSoft : 'transparent' }}><VadText variant="label" tone={mode === item ? 'brand' : 'secondary'}>{item === 'signUp' ? 'Create account' : 'Sign in'}</VadText></Pressable>)}
          </View>
          {mode === 'signUp' ? <VadInput label="Display name" value={displayName} onChangeText={setDisplayName} autoComplete="name" placeholder="How people will know you" /> : null}
          <VadInput label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com" />
          <VadInput label="Password" value={password} onChangeText={setPassword} autoCapitalize="none" autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} secureTextEntry placeholder="At least 8 characters" />
          {message ? <VadText variant="caption" tone="warning">{message}</VadText> : null}
          <VadButton label={mode === 'signIn' ? 'Enter VAD' : 'Join VAD'} loading={isSubmitting} disabled={!canSubmit} onPress={() => void submit()} />
          <Pressable onPress={() => selectMode(mode === 'signIn' ? 'signUp' : 'signIn')}><VadText variant="caption" tone="secondary" style={{ textAlign: 'center' }}>{mode === 'signIn' ? 'New here? Create an account' : 'Already have an account? Sign in'}</VadText></Pressable>
        </VadCard>

        <VadText variant="caption" tone="tertiary" style={{ textAlign: 'center', letterSpacing: 1 }}>OPEN CONVICTION · CONTROLLED TRUTH · AUDITABLE FINANCE</VadText>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
