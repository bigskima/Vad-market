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

type Props = {
  initialMode: AuthMode;
  onBack(): void;
};

type MessageKind = 'info' | 'success' | 'error';

export function AuthFormScreen({ initialMode, onBack }: Props) {
  const { signIn, signUp } = useAuth();
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 720;
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<MessageKind>('info');
  const [signupComplete, setSignupComplete] = useState(false);

  const emailValid = email.trim().includes('@');
  const passwordValid = password.length >= 8;
  const nameValid = mode === 'signIn' || displayName.trim().length > 0;

  const canSubmit =
    emailValid &&
    passwordValid &&
    nameValid &&
    !isSubmitting;

  async function submit() {
    if (!canSubmit) return;

    setIsSubmitting(true);
    setMessage(null);
    setSignupComplete(false);

    try {
      const result =
        mode === 'signIn'
          ? await signIn(email.trim(), password)
          : await signUp({
              displayName: displayName.trim(),
              email: email.trim(),
              password,
            });

      if (!result.ok) {
        setMessage(
          result.message ??
            (mode === 'signIn'
              ? 'Unable to sign in. Check your details and try again.'
              : 'Unable to create your account. Review your details and try again.'),
        );
        setMessageKind('error');
        return;
      }

      if (mode === 'signUp' && result.message) {
        setMessage(result.message);
        setMessageKind('success');
        setSignupComplete(true);
        setPassword('');
        return;
      }

      if (result.message) {
        setMessage(result.message);
        setMessageKind('info');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setMessage(null);
    setSignupComplete(false);
    setPassword('');
    setShowPassword(false);
  }

  const messageBackground =
    messageKind === 'error'
      ? theme.colors.noSoft
      : messageKind === 'success'
        ? theme.colors.yesSoft
        : theme.colors.infoSoft;

  const messageTone =
    messageKind === 'error'
      ? 'danger'
      : messageKind === 'success'
        ? 'yes'
        : 'secondary';

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{
            flexGrow: 1,
            alignSelf: 'center',
            justifyContent: 'center',
            width: '100%',
            maxWidth: 620,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.xxl,
          }}
        >
          <View style={{ gap: theme.spacing.xl }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: theme.spacing.md,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to welcome"
                onPress={onBack}
                style={({ pressed }) => ({
                  minHeight: 42,
                  justifyContent: 'center',
                  paddingHorizontal: theme.spacing.sm,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.md,
                  opacity: pressed ? 0.65 : 1,
                })}
              >
                <VadText variant="label">← Back</VadText>
              </Pressable>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                }}
              >
                <VadLogo size={34} />
                <VadText variant="heading">VAD</VadText>
              </View>
            </View>

            <View style={{ gap: theme.spacing.xs }}>
              <VadText variant="label" tone="brand">
                {mode === 'signIn' ? 'SIGN IN' : 'CREATE ACCOUNT'}
              </VadText>
              <VadText variant="title">
                {mode === 'signIn'
                  ? 'Welcome back.'
                  : 'Create your VAD account.'}
              </VadText>
              <VadText tone="secondary">
                {mode === 'signIn'
                  ? 'Continue to your markets, wallet, positions and creator activity.'
                  : 'Start with your account. Verification and profile details remain separate steps.'}
              </VadText>
            </View>

            <View
              accessibilityRole="tablist"
              style={{
                flexDirection: 'row',
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
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
                    style={({ pressed }) => ({
                      flex: 1,
                      minHeight: 46,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderBottomWidth: 2,
                      borderBottomColor: selected
                        ? theme.colors.brandPrimary
                        : 'transparent',
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <VadText
                      variant="label"
                      tone={selected ? 'brand' : 'secondary'}
                    >
                      {item === 'signIn' ? 'Sign in' : 'Sign up'}
                    </VadText>
                  </Pressable>
                );
              })}
            </View>

            <View
              style={{
                gap: theme.spacing.lg,
                padding: wide ? theme.spacing.xl : 0,
                borderRadius: wide ? theme.radius.xl : 0,
                borderWidth: wide ? 1 : 0,
                borderColor: theme.colors.border,
                backgroundColor: wide
                  ? theme.colors.surface
                  : 'transparent',
              }}
            >
              {signupComplete ? (
                <View style={{ gap: theme.spacing.lg }}>
                  <View
                    style={{
                      borderLeftWidth: 3,
                      borderLeftColor: theme.colors.yes,
                      backgroundColor: theme.colors.yesSoft,
                      borderRadius: theme.radius.md,
                      padding: theme.spacing.md,
                      gap: theme.spacing.xs,
                    }}
                  >
                    <VadText variant="label" tone="yes">ACCOUNT CREATED</VadText>
                    <VadText variant="heading">Check your email.</VadText>
                    <VadText variant="caption" tone="secondary">
                      {message ??
                        'Confirm your email address before signing in to VAD.'}
                    </VadText>
                    <VadText variant="caption" tone="tertiary">
                      {email.trim()}
                    </VadText>
                  </View>

                  <VadButton
                    label="Continue to sign in"
                    onPress={() => switchMode('signIn')}
                  />
                </View>
              ) : (
                <>
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
                        error={
                          displayName.length > 0 && !displayName.trim()
                            ? 'Enter the name you want to use on VAD.'
                            : undefined
                        }
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
                      error={
                        email.length > 0 && !emailValid
                          ? 'Enter a valid email address.'
                          : undefined
                      }
                    />

                    <View style={{ gap: theme.spacing.xs }}>
                      <VadInput
                        label="Password"
                        value={password}
                        onChangeText={setPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete={
                          mode === 'signIn'
                            ? 'current-password'
                            : 'new-password'
                        }
                        textContentType={
                          mode === 'signIn'
                            ? 'password'
                            : 'newPassword'
                        }
                        secureTextEntry={!showPassword}
                        placeholder="At least 8 characters"
                        returnKeyType="done"
                        onSubmitEditing={() => void submit()}
                        error={
                          password.length > 0 && !passwordValid
                            ? 'Use at least 8 characters.'
                            : undefined
                        }
                      />

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={
                          showPassword ? 'Hide password' : 'Show password'
                        }
                        onPress={() => setShowPassword((value) => !value)}
                        hitSlop={8}
                        style={({ pressed }) => ({
                          alignSelf: 'flex-start',
                          minHeight: 30,
                          justifyContent: 'center',
                          opacity: pressed ? 0.6 : 1,
                        })}
                      >
                        <VadText variant="caption" tone="brand">
                          {showPassword ? 'Hide password' : 'Show password'}
                        </VadText>
                      </Pressable>
                    </View>
                  </View>

                  {message ? (
                    <View
                      accessibilityRole="alert"
                      style={{
                        borderLeftWidth: 3,
                        borderLeftColor:
                          messageKind === 'error'
                            ? theme.colors.danger
                            : messageKind === 'success'
                              ? theme.colors.yes
                              : theme.colors.info,
                        borderRadius: theme.radius.md,
                        backgroundColor: messageBackground,
                        padding: theme.spacing.sm,
                      }}
                    >
                      <VadText variant="caption" tone={messageTone}>
                        {message}
                      </VadText>
                    </View>
                  ) : null}

                  <VadButton
                    label={
                      mode === 'signIn'
                        ? 'Sign in'
                        : 'Create account'
                    }
                    loading={isSubmitting}
                    disabled={!canSubmit}
                    onPress={() => void submit()}
                  />
                </>
              )}
            </View>

            <VadText
              variant="caption"
              tone="tertiary"
              style={{ textAlign: 'center' }}
            >
              By continuing, you agree to VAD&apos;s applicable platform and
              market rules.
            </VadText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
