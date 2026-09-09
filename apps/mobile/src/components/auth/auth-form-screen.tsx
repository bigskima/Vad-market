import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';
import type { AuthMode } from './welcome-screen';

type Props = {
  initialMode: AuthMode;
  onBack(): void;
};

export function AuthFormScreen({ initialMode, onBack }: Props) {
  const { signIn, signUp } = useAuth();
  const theme = useVadTheme();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canSubmit =
    email.trim().includes('@') &&
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

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setMessage(null);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            flexGrow: 1,
            alignSelf: 'center',
            justifyContent: 'center',
            width: '100%',
            maxWidth: 520,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.xxl,
          }}
        >
          <View style={{ gap: theme.spacing.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md }}>
              <Pressable
                accessibilityRole="button"
                onPress={onBack}
                style={{
                  minHeight: 44,
                  justifyContent: 'center',
                  paddingHorizontal: theme.spacing.sm,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                }}
              >
                <VadText variant="label">← Back</VadText>
              </Pressable>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                <VadLogo size={36} />
                <VadText variant="heading">VAD</VadText>
              </View>
            </View>

            <View style={{ gap: theme.spacing.xs }}>
              <VadText variant="title">{mode === 'signIn' ? 'Welcome back' : 'Create your account'}</VadText>
              <VadText tone="secondary">
                {mode === 'signIn'
                  ? 'Sign in to continue to your markets, positions and activity.'
                  : 'Create your VAD identity. You can complete your profile later.'}
              </VadText>
            </View>

            <View
              style={{
                flexDirection: 'row',
                borderRadius: theme.radius.lg,
                padding: theme.spacing.xxs,
                gap: theme.spacing.xxs,
                backgroundColor: theme.colors.surfaceRaised,
              }}
            >
              {(['signIn', 'signUp'] as const).map((item) => {
                const selected = item === mode;
                return (
                  <Pressable
                    key={item}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    onPress={() => switchMode(item)}
                    style={{
                      flex: 1,
                      minHeight: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: theme.radius.md,
                      backgroundColor: selected ? theme.colors.surface : 'transparent',
                      borderWidth: selected ? 1 : 0,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <VadText variant="label" tone={selected ? 'brand' : 'secondary'}>
                      {item === 'signIn' ? 'Sign in' : 'Sign up'}
                    </VadText>
                  </Pressable>
                );
              })}
            </View>

            <VadCard variant="raised" style={{ gap: theme.spacing.lg, padding: theme.spacing.xl, borderRadius: theme.radius.xl }}>
              <View style={{ gap: theme.spacing.md }}>
                {mode === 'signUp' ? (
                  <VadInput
                    label="Name"
                    value={displayName}
                    onChangeText={setDisplayName}
                    autoComplete="name"
                    placeholder="Your name"
                    returnKeyType="next"
                  />
                ) : null}
                <VadInput
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  keyboardType="email-address"
                  placeholder="you@example.com"
                  returnKeyType="next"
                />
                <VadInput
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                  secureTextEntry
                  placeholder="At least 8 characters"
                  returnKeyType="done"
                  onSubmitEditing={() => void submit()}
                />
              </View>

              {message ? (
                <View style={{ borderRadius: theme.radius.md, backgroundColor: theme.colors.warningSoft, padding: theme.spacing.sm }}>
                  <VadText variant="caption" tone="warning">{message}</VadText>
                </View>
              ) : null}

              <VadButton
                label={mode === 'signIn' ? 'Sign in' : 'Create account'}
                loading={isSubmitting}
                disabled={!canSubmit}
                onPress={() => void submit()}
              />
            </VadCard>

            <VadText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
              By continuing, you agree to VAD's applicable platform and market rules.
            </VadText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
