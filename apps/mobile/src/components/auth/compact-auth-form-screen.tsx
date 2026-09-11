import { useMemo, useState } from 'react';
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
import { VadCard } from '@/components/ui/vad-card';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useAuthMethods } from '@/hooks/use-auth-methods';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';
import type { AuthMode } from './welcome-screen';

type Props = { initialMode: AuthMode; onBack(): void };
type ViewMode = 'credentials' | 'forgot';
type MessageKind = 'info' | 'success' | 'error';

export function CompactAuthFormScreen({ initialMode, onBack }: Props) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const desktop = width >= 860;
  const { methods } = useAuthMethods();
  const { signIn, signUp, signInWithProvider, requestPasswordReset } = useAuth();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [view, setView] = useState<ViewMode>('credentials');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [working, setWorking] = useState(false);
  const [socialWorking, setSocialWorking] = useState<'google' | 'apple' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<MessageKind>('info');
  const [signupComplete, setSignupComplete] = useState(false);

  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());
  const passwordValid = mode === 'signIn' ? password.length > 0 : password.length >= 8;
  const nameValid = mode === 'signIn' || displayName.trim().length >= 2;
  const canSubmit = emailValid && passwordValid && nameValid && !working;
  const socialProviders = useMemo(
    () => [
      methods.google ? ('google' as const) : null,
      methods.apple ? ('apple' as const) : null,
    ].filter((provider): provider is 'google' | 'apple' => Boolean(provider)),
    [methods.apple, methods.google],
  );

  function clearMessage() {
    setMessage(null);
    setSignupComplete(false);
  }

  function switchMode(next: AuthMode) {
    setMode(next);
    setView('credentials');
    setPassword('');
    clearMessage();
  }

  async function submit() {
    if (!canSubmit) return;
    setWorking(true);
    clearMessage();
    try {
      const result = mode === 'signIn'
        ? await signIn(email, password)
        : await signUp({ displayName, email, password });

      if (!result.ok) {
        setMessage(result.message ?? 'We could not complete that request. Please try again.');
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
      setMessage('We could not complete that request. Check your connection and try again.');
      setMessageKind('error');
    } finally {
      setWorking(false);
    }
  }

  async function startSocial(provider: 'google' | 'apple') {
    if (socialWorking) return;
    if ((provider === 'google' && !methods.google) || (provider === 'apple' && !methods.apple)) return;
    setSocialWorking(provider);
    setMessage(null);
    const result = await signInWithProvider(provider);
    if (!result.ok) {
      setMessage(result.message ?? 'This sign-in option is unavailable right now.');
      setMessageKind('error');
    }
    setSocialWorking(null);
  }

  async function sendReset() {
    if (!emailValid || working) return;
    setWorking(true);
    setMessage(null);
    const result = await requestPasswordReset(email);
    setWorking(false);
    setMessage(result.message ?? (result.ok ? 'Check your email for the recovery link.' : 'We could not send a recovery email right now.'));
    setMessageKind(result.ok ? 'success' : 'error');
  }

  const title = view === 'forgot'
    ? 'Reset your password'
    : mode === 'signIn'
      ? 'Welcome back'
      : 'Create your account';
  const subtitle = view === 'forgot'
    ? 'Enter your email and we’ll send you a secure recovery link.'
    : mode === 'signIn'
      ? 'Sign in to continue to VAD.'
      : methods.phoneVerification
        ? 'Start with email and password. You can add phone verification after sign-in.'
        : 'Create your VAD account with email and password.';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: desktop ? 'center' : 'flex-start',
            paddingHorizontal: desktop ? theme.spacing.xl : theme.spacing.md,
            paddingTop: desktop ? theme.spacing.xl : theme.spacing.sm,
            paddingBottom: theme.spacing.xl,
          }}
        >
          <View style={{ width: '100%', maxWidth: desktop ? 1040 : 520, alignSelf: 'center', gap: desktop ? theme.spacing.xl : theme.spacing.md }}>
            <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={view === 'forgot' ? 'Back to sign in' : 'Back'}
                onPress={() => {
                  if (view === 'forgot') {
                    setView('credentials');
                    setMessage(null);
                  } else {
                    onBack();
                  }
                }}
                style={({ pressed }) => ({
                  minWidth: 44,
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: theme.radius.pill,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.65 : 1,
                })}
              >
                <VadText variant="bodyStrong">←</VadText>
              </Pressable>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                <VadLogo size={34} />
                <VadText variant="bodyStrong">VAD</VadText>
              </View>
            </View>

            <View style={{ flexDirection: desktop ? 'row' : 'column', gap: desktop ? theme.spacing.xxl : 0, alignItems: 'stretch' }}>
              {desktop ? (
                <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.md, paddingHorizontal: theme.spacing.md }}>
                  <VadText variant="label" tone="brand">VAD MARKET</VadText>
                  <VadText variant="display">Trade what you believe.</VadText>
                  <VadText tone="secondary" style={{ maxWidth: 460 }}>
                    One account for markets, your positions, wallet and community.
                  </VadText>
                </View>
              ) : null}

              <VadCard
                variant={desktop ? 'floating' : 'raised'}
                style={{
                  width: '100%',
                  maxWidth: desktop ? 480 : undefined,
                  flex: desktop ? 0.92 : undefined,
                  padding: desktop ? theme.spacing.xl : theme.spacing.md,
                  gap: theme.spacing.md,
                }}
              >
                <View style={{ gap: 4 }}>
                  <VadText variant="title">{title}</VadText>
                  <VadText variant="caption" tone="secondary">{subtitle}</VadText>
                </View>

                {view === 'forgot' ? (
                  <>
                    <VadInput
                      label="Email"
                      value={email}
                      onChangeText={(value) => { setEmail(value); setMessage(null); }}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      textContentType="emailAddress"
                      keyboardType="email-address"
                      error={email.length > 0 && !emailValid ? 'Enter a valid email address.' : undefined}
                      onSubmitEditing={() => void sendReset()}
                    />
                    {message ? <AuthMessage kind={messageKind} message={message} /> : null}
                    <VadButton label="Send recovery link" loading={working} disabled={!emailValid} onPress={() => void sendReset()} />
                    <VadButton label="Back to sign in" variant="ghost" onPress={() => { setView('credentials'); setMessage(null); }} />
                  </>
                ) : signupComplete ? (
                  <>
                    <AuthMessage kind="success" message={message ?? 'Account created. Check your email to continue.'} />
                    <VadButton label="Continue to sign in" onPress={() => switchMode('signIn')} />
                  </>
                ) : (
                  <>
                    <View
                      accessibilityRole="tablist"
                      style={{ flexDirection: 'row', padding: 4, borderRadius: theme.radius.pill, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border }}
                    >
                      {(['signIn', 'signUp'] as const).map((item) => {
                        const selected = mode === item;
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
                              borderRadius: theme.radius.pill,
                              backgroundColor: selected ? theme.colors.surface : 'transparent',
                              borderWidth: selected ? 1 : 0,
                              borderColor: selected ? theme.colors.brandPrimary : 'transparent',
                              opacity: pressed ? 0.7 : 1,
                            })}
                          >
                            <VadText variant="label" tone={selected ? 'brand' : 'secondary'}>{item === 'signIn' ? 'Sign in' : 'Sign up'}</VadText>
                          </Pressable>
                        );
                      })}
                    </View>

                    {socialProviders.length ? (
                      <>
                        <View style={{ flexDirection: socialProviders.length > 1 && width >= 440 ? 'row' : 'column', gap: theme.spacing.sm }}>
                          {socialProviders.map((provider) => (
                            <View key={provider} style={{ flex: 1 }}>
                              <VadButton
                                label={`Continue with ${provider === 'google' ? 'Google' : 'Apple'}`}
                                variant="secondary"
                                loading={socialWorking === provider}
                                disabled={Boolean(socialWorking)}
                                onPress={() => void startSocial(provider)}
                              />
                            </View>
                          ))}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                          <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
                          <VadText variant="caption" tone="tertiary">or use email</VadText>
                          <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
                        </View>
                      </>
                    ) : null}

                    <View style={{ gap: theme.spacing.sm }}>
                      {mode === 'signUp' ? (
                        <VadInput
                          label="Name"
                          value={displayName}
                          onChangeText={(value) => { setDisplayName(value); setMessage(null); }}
                          autoComplete="name"
                          textContentType="name"
                          returnKeyType="next"
                          error={displayName.length > 0 && !nameValid ? 'Enter at least 2 characters.' : undefined}
                        />
                      ) : null}

                      <VadInput
                        label="Email"
                        value={email}
                        onChangeText={(value) => { setEmail(value); setMessage(null); }}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="email"
                        textContentType="emailAddress"
                        keyboardType="email-address"
                        returnKeyType="next"
                        error={email.length > 0 && !emailValid ? 'Enter a valid email address.' : undefined}
                      />

                      <VadInput
                        label="Password"
                        revealable
                        value={password}
                        onChangeText={(value) => { setPassword(value); setMessage(null); }}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                        textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
                        secureTextEntry
                        hint={mode === 'signUp' ? 'At least 8 characters.' : undefined}
                        returnKeyType="done"
                        onSubmitEditing={() => void submit()}
                        error={mode === 'signUp' && password.length > 0 && !passwordValid ? 'Use at least 8 characters.' : undefined}
                      />
                    </View>

                    {mode === 'signIn' ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => { setView('forgot'); setMessage(null); }}
                        style={({ pressed }) => ({ alignSelf: 'flex-end', minHeight: 40, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
                      >
                        <VadText variant="caption" tone="brand">Forgot password?</VadText>
                      </Pressable>
                    ) : null}

                    {message ? <AuthMessage kind={messageKind} message={message} /> : null}

                    <VadButton
                      label={mode === 'signIn' ? 'Sign in' : 'Create account'}
                      loading={working}
                      disabled={!canSubmit || Boolean(socialWorking)}
                      onPress={() => void submit()}
                    />

                    <VadText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
                      {mode === 'signIn' ? 'New to VAD? ' : 'Already have an account? '}
                      <VadText
                        variant="caption"
                        tone="brand"
                        onPress={() => switchMode(mode === 'signIn' ? 'signUp' : 'signIn')}
                      >
                        {mode === 'signIn' ? 'Create account' : 'Sign in'}
                      </VadText>
                    </VadText>
                  </>
                )}
              </VadCard>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function AuthMessage({ kind, message }: { kind: MessageKind; message: string }) {
  const theme = useVadTheme();
  const backgroundColor = kind === 'error'
    ? theme.colors.noSoft
    : kind === 'success'
      ? theme.colors.yesSoft
      : theme.colors.infoSoft;
  const tone = kind === 'error' ? 'danger' : kind === 'success' ? 'yes' : 'secondary';

  return (
    <View accessibilityRole="alert" style={{ padding: theme.spacing.sm, borderRadius: theme.radius.md, backgroundColor }}>
      <VadText variant="caption" tone={tone}>{message}</VadText>
    </View>
  );
}
