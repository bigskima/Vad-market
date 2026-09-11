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
import { VadCard } from '@/components/ui/vad-card';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';
import type { AuthMode } from './welcome-screen';

type Props = { initialMode: AuthMode; onBack(): void };
type MessageKind = 'info' | 'success' | 'error';
type AuthView = 'credentials' | 'forgot';

export function AuthFormScreen({ initialMode, onBack }: Props) {
  const { signIn, signUp, signInWithProvider, requestPasswordReset } = useAuth();
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const compact = width < 380;
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [view, setView] = useState<AuthView>('credentials');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [socialWorking, setSocialWorking] = useState<'google' | 'apple' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<MessageKind>('info');
  const [signupComplete, setSignupComplete] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());
  const passwordValid = mode === 'signIn' ? password.length > 0 : password.length >= 8;
  const nameValid = mode === 'signIn' || displayName.trim().length >= 2;
  const canSubmit = emailValid && passwordValid && nameValid && !isSubmitting;

  function resetMessages() {
    setMessage(null);
    setSignupComplete(false);
    setResetSent(false);
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setView('credentials');
    resetMessages();
    setPassword('');
  }

  async function submit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    resetMessages();

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

  async function startSocial(provider: 'google' | 'apple') {
    if (socialWorking) return;
    setSocialWorking(provider);
    setMessage(null);
    const result = await signInWithProvider(provider);
    if (!result.ok) {
      setMessage(result.message ?? `${provider} sign in could not start.`);
      setMessageKind('error');
    }
    setSocialWorking(null);
  }

  async function sendReset() {
    if (!emailValid || isSubmitting) return;
    setIsSubmitting(true);
    setMessage(null);
    setResetSent(false);
    const result = await requestPasswordReset(email);
    setIsSubmitting(false);
    if (!result.ok) {
      setMessage(result.message ?? 'Password reset could not be requested.');
      setMessageKind('error');
      return;
    }
    setMessage(result.message ?? 'Password reset instructions sent.');
    setMessageKind('success');
    setResetSent(true);
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
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: compact ? theme.spacing.md : theme.spacing.lg }}
        >
          <View style={{ width: '100%', maxWidth: 1120, alignSelf: 'center', gap: theme.spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={view === 'forgot' ? 'Back to sign in' : 'Back to welcome'}
                onPress={() => {
                  if (view === 'forgot') {
                    setView('credentials');
                    resetMessages();
                  } else {
                    onBack();
                  }
                }}
                style={({ pressed }) => ({
                  minHeight: 44,
                  justifyContent: 'center',
                  paddingHorizontal: theme.spacing.md,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.surface,
                  opacity: pressed ? 0.65 : 1,
                })}
              >
                <VadText variant="label">← Back</VadText>
              </Pressable>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                <VadLogo size={36} />
                <VadText variant="heading">VAD</VadText>
              </View>
            </View>

            <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? theme.spacing.huge : theme.spacing.xl, alignItems: 'stretch' }}>
              <View style={{ flex: 1.05, justifyContent: 'center', gap: theme.spacing.lg, paddingVertical: wide ? theme.spacing.xxl : theme.spacing.sm }}>
                <View style={{ gap: theme.spacing.sm }}>
                  <VadText variant="label" tone="brand">VAD MARKET</VadText>
                  <VadText variant="display">
                    {view === 'forgot'
                      ? 'Get back to your conviction.'
                      : mode === 'signIn'
                        ? 'Welcome back.'
                        : 'Back outcomes you understand.'}
                  </VadText>
                  <VadText tone="secondary" style={{ maxWidth: 520 }}>
                    {view === 'forgot'
                      ? 'Reset access securely without touching your markets, wallet, positions or public track record.'
                      : mode === 'signIn'
                        ? 'Return to live markets, positions, wallet activity and the VAD community from one account.'
                        : 'Create one account for markets, trading, wallet activity and your public conviction history.'}
                  </VadText>
                </View>

                {wide ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
                    {['Live probability', 'Unified wallet', 'Public track record'].map((item) => (
                      <View key={item} style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border }}>
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.brandPrimary }} />
                        <VadText variant="caption" tone="secondary">{item}</VadText>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>

              <VadCard variant="floating" style={{ flex: 0.95, maxWidth: wide ? 500 : undefined, width: '100%', gap: theme.spacing.lg, padding: wide ? theme.spacing.xl : theme.spacing.lg }}>
                {view === 'forgot' ? (
                  <>
                    <View style={{ gap: theme.spacing.xs }}>
                      <VadText variant="caption" tone="brand">PASSWORD RECOVERY</VadText>
                      <VadText variant="title">Reset your password</VadText>
                      <VadText variant="caption" tone="secondary">
                        Enter the email linked to your VAD account. We will send a secure recovery link.
                      </VadText>
                    </View>

                    <VadInput
                      label="Email"
                      floatingLabel
                      value={email}
                      onChangeText={(value) => { setEmail(value); setMessage(null); setResetSent(false); }}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      textContentType="emailAddress"
                      keyboardType="email-address"
                      error={email.length > 0 && !emailValid ? 'Enter a valid email address.' : undefined}
                      success={resetSent ? 'Recovery email sent.' : undefined}
                      onSubmitEditing={() => void sendReset()}
                    />

                    {message ? (
                      <MessageBanner background={messageBackground} tone={messageTone} message={message} />
                    ) : null}

                    <VadButton label={resetSent ? 'Send another link' : 'Send recovery link'} loading={isSubmitting} disabled={!emailValid} onPress={() => void sendReset()} />
                    <VadButton label="Return to sign in" variant="ghost" onPress={() => { setView('credentials'); resetMessages(); }} />
                  </>
                ) : signupComplete ? (
                  <View style={{ gap: theme.spacing.lg }}>
                    <View style={{ backgroundColor: theme.colors.yesSoft, borderRadius: theme.radius.xl, padding: theme.spacing.lg, gap: theme.spacing.xs }}>
                      <VadText variant="label" tone="yes">ACCOUNT CREATED</VadText>
                      <VadText variant="heading">Check your email</VadText>
                      <VadText variant="caption" tone="secondary">{message}</VadText>
                      <VadText variant="caption" tone="tertiary">{email.trim().toLowerCase()}</VadText>
                    </View>
                    <VadButton label="Continue to sign in" onPress={() => switchMode('signIn')} />
                  </View>
                ) : (
                  <>
                    <View
                      accessibilityRole="tablist"
                      style={{ flexDirection: 'row', backgroundColor: theme.colors.background, borderRadius: theme.radius.pill, padding: 4, borderWidth: 1, borderColor: theme.colors.border }}
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
                              borderRadius: theme.radius.pill,
                              backgroundColor: selected ? theme.colors.surface : 'transparent',
                              borderWidth: selected ? 1 : 0,
                              borderColor: selected ? theme.colors.brandPrimary : 'transparent',
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

                    <View style={{ gap: theme.spacing.xs }}>
                      <VadText variant="heading">{mode === 'signIn' ? 'Sign in to VAD' : 'Create your VAD account'}</VadText>
                      <VadText variant="caption" tone="secondary">
                        {mode === 'signIn' ? 'Use your account details or a connected provider.' : 'Start with your identity details. Phone verification follows as a separate security step.'}
                      </VadText>
                    </View>

                    <View style={{ flexDirection: width < 480 ? 'column' : 'row', gap: theme.spacing.sm }}>
                      <View style={{ flex: 1 }}>
                        <VadButton label="Continue with Google" variant="secondary" loading={socialWorking === 'google'} disabled={Boolean(socialWorking)} onPress={() => void startSocial('google')} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <VadButton label="Continue with Apple" variant="secondary" loading={socialWorking === 'apple'} disabled={Boolean(socialWorking)} onPress={() => void startSocial('apple')} />
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                      <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
                      <VadText variant="caption" tone="tertiary">or use email</VadText>
                      <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }} />
                    </View>

                    <View style={{ gap: theme.spacing.md }}>
                      {mode === 'signUp' ? (
                        <VadInput
                          label="Name"
                          floatingLabel
                          value={displayName}
                          onChangeText={(value) => { setDisplayName(value); setMessage(null); }}
                          autoComplete="name"
                          textContentType="name"
                          returnKeyType="next"
                          error={displayName.length > 0 && !nameValid ? 'Enter at least 2 characters.' : undefined}
                          success={nameValid && displayName.length > 0 ? 'Looks good.' : undefined}
                        />
                      ) : null}

                      <VadInput
                        label="Email"
                        floatingLabel
                        value={email}
                        onChangeText={(value) => { setEmail(value); setMessage(null); }}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="email"
                        textContentType="emailAddress"
                        keyboardType="email-address"
                        returnKeyType="next"
                        error={email.length > 0 && !emailValid ? 'Enter a valid email address.' : undefined}
                        success={emailValid ? 'Email format is valid.' : undefined}
                      />

                      <VadInput
                        label="Password"
                        floatingLabel
                        revealable
                        value={password}
                        onChangeText={(value) => { setPassword(value); setMessage(null); }}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                        textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
                        secureTextEntry
                        hint={mode === 'signUp' ? 'Use at least 8 characters.' : undefined}
                        returnKeyType="done"
                        onSubmitEditing={() => void submit()}
                        error={mode === 'signUp' && password.length > 0 && !passwordValid ? 'Use at least 8 characters.' : undefined}
                      />
                    </View>

                    {mode === 'signIn' ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => { setView('forgot'); resetMessages(); }}
                        hitSlop={8}
                        style={({ pressed }) => ({ alignSelf: 'flex-end', minHeight: 32, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
                      >
                        <VadText variant="caption" tone="brand">Forgot password?</VadText>
                      </Pressable>
                    ) : null}

                    {message ? (
                      <MessageBanner background={messageBackground} tone={messageTone} message={message} />
                    ) : null}

                    <VadButton
                      label={mode === 'signIn' ? 'Sign in' : 'Create account'}
                      loading={isSubmitting}
                      disabled={!canSubmit || Boolean(socialWorking)}
                      onPress={() => void submit()}
                    />
                  </>
                )}

                <VadText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
                  By continuing, you agree to VAD&apos;s applicable platform and market rules.
                </VadText>
              </VadCard>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBanner({ background, tone, message }: { background: string; tone: 'danger' | 'yes' | 'secondary'; message: string }) {
  const theme = useVadTheme();
  return (
    <View accessibilityRole="alert" style={{ borderRadius: theme.radius.md, backgroundColor: background, padding: theme.spacing.md }}>
      <VadText variant="caption" tone={tone}>{message}</VadText>
    </View>
  );
}
