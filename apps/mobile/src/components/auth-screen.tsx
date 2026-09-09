import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signUp');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canSubmit =
    email.includes('@') &&
    password.length >= 8 &&
    (mode === 'signIn' || displayName.trim().length > 0) &&
    !isSubmitting;

  async function submit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      const result = mode === 'signIn'
        ? await signIn(email.trim(), password)
        : await signUp({ displayName: displayName.trim(), email: email.trim(), password });
      setMessage(result.message ?? null);
    } finally {
      setIsSubmitting(false);
    }
  }

  function selectMode(next: 'signIn' | 'signUp') {
    setMode(next);
    setMessage(null);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            alignSelf: 'center',
            flexGrow: 1,
            justifyContent: 'center',
            maxWidth: 1180,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.xxl,
            width: '100%',
          }}
        >
          <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'stretch', gap: theme.spacing.xl }}>
            <View style={{ flex: 1.1, justifyContent: 'center', gap: theme.spacing.xl, paddingVertical: wide ? theme.spacing.xl : 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <VadLogo size={44} />
                <View style={{ flex: 1 }}>
                  <VadText variant="heading">VAD</VadText>
                  <VadText variant="caption" tone="secondary">Value Asset Depot</VadText>
                </View>
                <View style={{ borderRadius: theme.radius.pill, backgroundColor: theme.colors.brandSoft, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs }}>
                  <VadText variant="caption" tone="brand">NGN · Nigeria</VadText>
                </View>
              </View>

              <View style={{ gap: theme.spacing.sm }}>
                <VadText variant="label" tone="brand">CONVICTION MARKET</VadText>
                <VadText variant="display">See the belief. Inspect the rules. Take your position.</VadText>
                <VadText tone="secondary">
                  VAD combines market probabilities, public reasoning and governed resolution without turning price into truth.
                </VadText>
              </View>

              <VadCard
                style={{
                  backgroundColor: theme.colors.brandPrimary,
                  borderColor: theme.colors.brandPrimary,
                  borderRadius: theme.radius.xl,
                  gap: theme.spacing.lg,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <VadText variant="caption" tone="inverse">Example market signal</VadText>
                    <VadText variant="heading" tone="inverse">Will the event resolve YES?</VadText>
                  </View>
                  <VadText variant="title" tone="inverse">64%</VadText>
                </View>
                <View style={{ height: 8, borderRadius: theme.radius.pill, overflow: 'hidden', backgroundColor: theme.colors.brandStrong }}>
                  <View style={{ width: '64%', height: '100%', backgroundColor: theme.colors.onBrand }} />
                </View>
                <View style={{ flexDirection: 'row', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
                  <TrustPill label="Fully collateralized" />
                  <TrustPill label="Oracle governed" />
                  <TrustPill label="Auditable ledger" />
                </View>
              </VadCard>
            </View>

            <VadCard
              variant="raised"
              style={{
                flex: 0.9,
                alignSelf: wide ? 'center' : 'stretch',
                width: wide ? 440 : undefined,
                gap: theme.spacing.lg,
                borderRadius: theme.radius.xl,
                padding: theme.spacing.xl,
              }}
            >
              <View style={{ gap: theme.spacing.xs }}>
                <VadText variant="title">{mode === 'signIn' ? 'Welcome back' : 'Create your VAD account'}</VadText>
                <VadText tone="secondary">
                  {mode === 'signIn'
                    ? 'Sign in to return to your markets, portfolio and conviction feed.'
                    : 'Your public identity can be refined later from Account.'}
                </VadText>
              </View>

              <View style={{ flexDirection: 'row', backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: theme.spacing.xxs, gap: theme.spacing.xxs }}>
                {(['signUp', 'signIn'] as const).map((item) => (
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: mode === item }}
                    key={item}
                    onPress={() => selectMode(item)}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      borderRadius: theme.radius.md,
                      paddingVertical: theme.spacing.sm,
                      backgroundColor: mode === item ? theme.colors.brandSoft : 'transparent',
                    }}
                  >
                    <VadText variant="label" tone={mode === item ? 'brand' : 'secondary'}>
                      {item === 'signUp' ? 'Create account' : 'Sign in'}
                    </VadText>
                  </Pressable>
                ))}
              </View>

              <View style={{ gap: theme.spacing.md }}>
                {mode === 'signUp' ? (
                  <VadInput label="Display name" value={displayName} onChangeText={setDisplayName} autoComplete="name" placeholder="How people will know you" />
                ) : null}
                <VadInput label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com" />
                <VadInput label="Password" value={password} onChangeText={setPassword} autoCapitalize="none" autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} secureTextEntry placeholder="At least 8 characters" />
              </View>

              {message ? (
                <VadCard variant="muted" style={{ padding: theme.spacing.sm }}>
                  <VadText variant="caption" tone="warning">{message}</VadText>
                </VadCard>
              ) : null}

              <VadButton label={mode === 'signIn' ? 'Enter VAD' : 'Create account'} loading={isSubmitting} disabled={!canSubmit} onPress={() => void submit()} />

              <VadText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
                Market access, trading and money movement remain subject to live jurisdiction, KYC and runtime policy.
              </VadText>
            </VadCard>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function TrustPill({ label }: { label: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ borderRadius: theme.radius.pill, backgroundColor: theme.colors.brandStrong, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs }}>
      <VadText variant="caption" tone="inverse">{label}</VadText>
    </View>
  );
}
