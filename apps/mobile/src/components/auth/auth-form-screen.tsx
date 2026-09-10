import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadButton } from '@/components/ui/vad-button';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';
import type { AuthMode } from './welcome-screen';

type Props = { initialMode: AuthMode; onBack(): void };
type MessageKind = 'info' | 'success' | 'error';

export function AuthFormScreen({ initialMode, onBack }: Props) {
  const { signIn, signUp } = useAuth();
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<MessageKind>('info');
  const [signupComplete, setSignupComplete] = useState(false);

  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());
  const passwordValid = mode === 'signIn' ? password.length > 0 : password.length >= 8;
  const nameValid = mode === 'signIn' || displayName.trim().length >= 2;
  const canSubmit = emailValid && passwordValid && nameValid && !isSubmitting;

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setMessage(null);
    setSignupComplete(false);
    setPassword('');
    setShowPassword(false);
  }

  async function submit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setMessage(null);
    setSignupComplete(false);

    try {
      const result = mode === 'signIn'
        ? await signIn(email, password)
        : await signUp({ displayName, email, password });

      if (!result.ok) {
        setMessage(result.message ?? 'Something went wrong. Please try again.');
        setMessageKind('error');
        return;
      }

      if (mode === 'signUp' && result.message) {
        setMessage(result.message);
        setMessageKind('success');
        setSignupComplete(true);
        setPassword('');
      }
    } catch {
      setMessage('VAD could not complete this request. Check your connection and try again.');
      setMessageKind('error');
    } finally {
      setIsSubmitting(false);
    }
  }

  const messageBackground = messageKind === 'error'
    ? theme.colors.noSoft
    : messageKind === 'success'
      ? theme.colors.yesSoft
      : theme.colors.infoSoft;
  const messageTone = messageKind === 'error' ? 'danger' : messageKind === 'success' ? 'yes' : 'secondary';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: theme.spacing.lg }}
        >
          <View style={{ width: '100%', maxWidth: 1040, alignSelf: 'center', gap: theme.spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to welcome"
                onPress={onBack}
                style={({ pressed }) => ({
                  minHeight: 42,
                  justifyContent: 'center',
                  paddingHorizontal: theme.spacing.md,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.lg,
                  opacity: pressed ? 0.65 : 1,
                })}
              >
                <VadText variant="label">← Back</VadText>
              </Pressable>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                <VadLogo size={34} />
                <VadText variant="heading">VAD</VadText>
              </View>
            </View>

            <View style={{ flexDirection: wide ? 'row' : 'column', gap: theme.spacing.xl, alignItems: 'stretch' }}>
              <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.md, paddingVertical: wide ? theme.spacing.xxl : theme.spacing.sm }}>
                <VadText variant="label" tone="brand">VAD MARKET</VadText>
                <VadText variant="title">
                  {mode === 'signIn' ? 'Welcome back.' : 'Create your account.'}
                </VadText>
                <VadText tone="secondary">
                  {mode === 'signIn'
                    ? 'Your markets, positions, wallet and convictions are waiting.'
                    : 'One account for markets, trading, wallet activity and the VAD community.'}
                </VadText>
                {wide ? (
                  <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
                    {['Trade conviction markets', 'Manage funds in one wallet', 'Build a public track record'].map((item) => (
                      <View key={item} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                        <VadText tone="brand">●</VadText>
                        <VadText variant="caption" tone="secondary">{item}</VadText>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>

              <View
                style={{
                  flex: 1,
                  maxWidth: wide ? 480 : undefined,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                  borderRadius: theme.radius.xl,
                  padding: wide ? theme.spacing.xl : theme.spacing.lg,
                  gap: theme.spacing.lg,
                }}
              >
                <View
                  accessibilityRole="tablist"
                  style={{ flexDirection: 'row', backgroundColor: theme.colors.background, borderRadius: theme.radius.lg, padding: 4 }}
                >
                  {(['signIn', 'signUp'] as const).map((item) => {
                    const selected = item === mode;
                    return (
                      <Pressable
                        key={item}
                        accessibilityRole="tab"
                        accessibilityState={{ selected }}
                        onPress={() => switchMode(item)}
                        style={({ pressed }) => ({
                          flex: 1,
                          minHeight: 44,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: theme.radius.md,
                          backgroundColor: selected ? theme.colors.surface : 'transparent',
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <VadText variant="label" tone={selected ? 'brand' : 'secondary'}>
                          {item === 'signIn' ? 'Sign in' : 'Sign up'}
                        </VadText>
                      </Pressable>
                    );
                  })}
                </View>

                {signupComplete ? (
                  <View style={{ gap: theme.spacing.lg }}>
                    <View style={{ backgroundColor: theme.colors.yesSoft, borderRadius: theme.radius.lg, padding: theme.spacing.lg, gap: theme.spacing.xs }}>
                      <VadText variant="label" tone="yes">ACCOUNT CREATED</VadText>
                      <VadText variant="heading">Check your email</VadText>
                      <VadText variant="caption" tone="secondary">{message}</VadText>
                      <VadText variant="caption" tone="tertiary">{email.trim().toLowerCase()}</VadText>
                    </View>
                    <VadButton label="Continue to sign in" onPress={() => switchMode('signIn')} />
                  </View>
                ) : (
                  <>
                    <View style={{ gap: theme.spacing.sm }}>
                      <VadText variant="heading">{mode === 'signIn' ? 'Sign in to VAD' : 'Join VAD'}</VadText>
                      <VadText variant="caption" tone="secondary">
                        {mode === 'signIn' ? 'Enter the details linked to your account.' : 'You can complete verification after creating your account.'}
                      </VadText>
                    </View>

                    <View style={{ gap: theme.spacing.md }}>
                      {mode === 'signUp' ? (
                        <VadInput
                          label="Name"
                          value={displayName}
                          onChangeText={setDisplayName}
                          autoComplete="name"
                          textContentType="name"
                          placeholder="Your name"
                          returnKeyType="next"
                          error={displayName.length > 0 && !nameValid ? 'Enter at least 2 characters.' : undefined}
                        />
                      ) : null}

                      <VadInput
                        label="Email"
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="email"
                        textContentType="emailAddress"
                        keyboardType="email-address"
                        placeholder="you@example.com"
                        returnKeyType="next"
                        error={email.length > 0 && !emailValid ? 'Enter a valid email address.' : undefined}
                      />

                      <View style={{ gap: theme.spacing.xs }}>
                        <VadInput
                          label="Password"
                          value={password}
                          onChangeText={setPassword}
                          autoCapitalize="none"
                          autoCorrect={false}
                          autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                          textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
                          secureTextEntry={!showPassword}
                          placeholder={mode === 'signIn' ? 'Your password' : 'At least 8 characters'}
                          returnKeyType="done"
                          onSubmitEditing={() => void submit()}
                          error={mode === 'signUp' && password.length > 0 && !passwordValid ? 'Use at least 8 characters.' : undefined}
                        />
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setShowPassword((value) => !value)}
                          hitSlop={8}
                          style={({ pressed }) => ({ alignSelf: 'flex-end', minHeight: 30, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
                        >
                          <VadText variant="caption" tone="brand">{showPassword ? 'Hide password' : 'Show password'}</VadText>
                        </Pressable>
                      </View>
                    </View>

                    {message ? (
                      <View accessibilityRole="alert" style={{ borderRadius: theme.radius.md, backgroundColor: messageBackground, padding: theme.spacing.md }}>
                        <VadText variant="caption" tone={messageTone}>{message}</VadText>
                      </View>
                    ) : null}

                    <VadButton
                      label={mode === 'signIn' ? 'Sign in' : 'Create account'}
                      loading={isSubmitting}
                      disabled={!canSubmit}
                      onPress={() => void submit()}
                    />
                  </>
                )}

                <VadText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
                  By continuing, you agree to VAD&apos;s applicable platform and market rules.
                </VadText>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
