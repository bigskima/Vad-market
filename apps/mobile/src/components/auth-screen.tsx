import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette } from '@/constants/palette';
import { useAuth } from '@/providers/auth-provider';

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
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
      const result =
        mode === 'signIn'
          ? await signIn(email, password)
          : await signUp({ displayName, email, password });
      setMessage(result.message ?? null);
    } finally {
      setIsSubmitting(false);
    }
  }

  function switchMode() {
    setMode((current) => (current === 'signIn' ? 'signUp' : 'signIn'));
    setMessage(null);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Text style={styles.brandLetter}>V</Text>
            </View>
            <Text style={styles.brand}>VAD</Text>
            <View style={styles.phasePill}>
              <Text style={styles.phaseText}>NIGERIA · PHASE 1</Text>
            </View>
          </View>

          <View style={styles.hero}>
            <Text style={styles.eyebrow}>VALUE ASSET DEPOT</Text>
            <Text style={styles.title}>Conviction becomes visible.</Text>
            <Text style={styles.subtitle}>
              Follow ideas, understand the event, and take a position only when
              the rules and source of truth are clear.
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.modeRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setMode('signUp')}
                style={[styles.modeButton, mode === 'signUp' && styles.modeActive]}>
                <Text style={[styles.modeLabel, mode === 'signUp' && styles.modeLabelActive]}>
                  Create account
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setMode('signIn')}
                style={[styles.modeButton, mode === 'signIn' && styles.modeActive]}>
                <Text style={[styles.modeLabel, mode === 'signIn' && styles.modeLabelActive]}>
                  Sign in
                </Text>
              </Pressable>
            </View>

            {mode === 'signUp' && (
              <View style={styles.field}>
                <Text style={styles.label}>Display name</Text>
                <TextInput
                  accessibilityLabel="Display name"
                  autoComplete="name"
                  onChangeText={setDisplayName}
                  placeholder="How people will know you"
                  placeholderTextColor={palette.textMuted}
                  style={styles.input}
                  value={displayName}
                />
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                accessibilityLabel="Email"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={palette.textMuted}
                style={styles.input}
                value={email}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                accessibilityLabel="Password"
                autoCapitalize="none"
                autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                placeholderTextColor={palette.textMuted}
                secureTextEntry
                style={styles.input}
                value={password}
              />
            </View>

            {message && <Text style={styles.message}>{message}</Text>}

            <Pressable
              accessibilityRole="button"
              disabled={!canSubmit}
              onPress={() => void submit()}
              style={({ pressed }) => [
                styles.primaryButton,
                !canSubmit && styles.primaryButtonDisabled,
                pressed && canSubmit && styles.primaryButtonPressed,
              ]}>
              {isSubmitting ? (
                <ActivityIndicator color={palette.ink} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {mode === 'signIn' ? 'Enter VAD' : 'Join VAD'}
                </Text>
              )}
            </Pressable>

            <Pressable accessibilityRole="button" onPress={switchMode}>
              <Text style={styles.switchText}>
                {mode === 'signIn'
                  ? 'New here? Create an account'
                  : 'Already have an account? Sign in'}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.trustLine}>
            OPEN CONVICTION · CONTROLLED TRUTH · AUDITABLE FINANCE
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: palette.ink, flex: 1 },
  flex: { flex: 1 },
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    maxWidth: 620,
    paddingHorizontal: 24,
    paddingVertical: 32,
    width: '100%',
  },
  brandRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 42 },
  brandMark: {
    alignItems: 'center',
    backgroundColor: palette.signal,
    borderRadius: 12,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  brandLetter: { color: palette.ink, fontSize: 20, fontWeight: '900' },
  brand: { color: palette.text, fontSize: 22, fontWeight: '900', marginLeft: 10 },
  phasePill: {
    borderColor: palette.line,
    borderRadius: 999,
    borderWidth: 1,
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  phaseText: { color: palette.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  hero: { marginBottom: 28 },
  eyebrow: { color: palette.signal, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  title: { color: palette.text, fontSize: 44, fontWeight: '900', letterSpacing: -1.6, lineHeight: 47, marginTop: 12 },
  subtitle: { color: palette.textMuted, fontSize: 16, lineHeight: 25, marginTop: 15, maxWidth: 520 },
  card: { backgroundColor: palette.inkRaised, borderColor: palette.line, borderRadius: 24, borderWidth: 1, padding: 20 },
  modeRow: { backgroundColor: palette.ink, borderRadius: 14, flexDirection: 'row', marginBottom: 20, padding: 4 },
  modeButton: { alignItems: 'center', borderRadius: 10, flex: 1, paddingVertical: 11 },
  modeActive: { backgroundColor: palette.panelSoft },
  modeLabel: { color: palette.textMuted, fontSize: 13, fontWeight: '700' },
  modeLabelActive: { color: palette.text },
  field: { gap: 8, marginBottom: 16 },
  label: { color: palette.text, fontSize: 13, fontWeight: '700' },
  input: { backgroundColor: palette.panel, borderColor: palette.line, borderRadius: 13, borderWidth: 1, color: palette.text, fontSize: 16, minHeight: 52, paddingHorizontal: 15 },
  message: { color: palette.warning, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  primaryButton: { alignItems: 'center', backgroundColor: palette.signal, borderRadius: 14, justifyContent: 'center', minHeight: 54, marginTop: 2 },
  primaryButtonDisabled: { opacity: 0.35 },
  primaryButtonPressed: { backgroundColor: palette.signalDark, transform: [{ scale: 0.99 }] },
  primaryButtonText: { color: palette.ink, fontSize: 15, fontWeight: '900' },
  switchText: { color: palette.textMuted, fontSize: 13, marginTop: 18, textAlign: 'center' },
  trustLine: { color: palette.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1.1, marginTop: 24, textAlign: 'center' },
});
