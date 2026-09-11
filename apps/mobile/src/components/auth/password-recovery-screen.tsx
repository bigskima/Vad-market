import { useMemo, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

export function PasswordRecoveryScreen() {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const { updatePassword, dismissPasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const rules = useMemo(() => [
    { label: '8+ characters', ok: password.length >= 8 },
    { label: 'Upper & lowercase', ok: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: 'Number', ok: /\d/.test(password) },
    { label: 'Symbol', ok: /[^A-Za-z0-9]/.test(password) },
  ], [password]);
  const score = rules.filter((rule) => rule.ok).length;
  const valid = score >= 3 && password.length >= 8 && password === confirm;

  async function submit() {
    if (!valid || working) return;
    setWorking(true);
    setError(null);
    setSuccess(null);
    const result = await updatePassword(password);
    setWorking(false);
    if (!result.ok) {
      setError(result.message ?? 'Your password could not be updated.');
      return;
    }
    setSuccess(result.message ?? 'Your password has been updated.');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: width < 380 ? theme.spacing.md : theme.spacing.xl,
          paddingVertical: theme.spacing.xl,
        }}
      >
        <View style={{ width: '100%', maxWidth: 520, gap: theme.spacing.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <VadLogo size={40} />
            <VadText variant="heading">VAD</VadText>
          </View>

          <VadCard variant="floating" style={{ gap: theme.spacing.lg }}>
            <View style={{ gap: theme.spacing.xs }}>
              <VadText variant="caption" tone="brand">SECURE RECOVERY</VadText>
              <VadText variant="title">Choose a new password</VadText>
              <VadText variant="caption" tone="secondary">
                Your reset link has been validated. Choose a strong password for this account.
              </VadText>
            </View>

            <VadInput
              label="New password"
              floatingLabel
              revealable
              secureTextEntry
              value={password}
              onChangeText={(value) => { setPassword(value); setError(null); setSuccess(null); }}
              autoComplete="new-password"
            />

            <View style={{ gap: theme.spacing.xs }}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.surfaceMuted, overflow: 'hidden' }}>
                <View
                  style={{
                    height: '100%',
                    width: `${score * 25}%`,
                    borderRadius: 3,
                    backgroundColor: score >= 4 ? theme.colors.yes : score >= 2 ? theme.colors.brandPrimary : theme.colors.warning,
                  }}
                />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                {rules.map((rule) => (
                  <View key={rule.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: rule.ok ? theme.colors.yes : theme.colors.borderStrong }} />
                    <VadText variant="caption" tone={rule.ok ? 'yes' : 'tertiary'}>{rule.label}</VadText>
                  </View>
                ))}
              </View>
            </View>

            <VadInput
              label="Confirm password"
              floatingLabel
              revealable
              secureTextEntry
              value={confirm}
              onChangeText={(value) => { setConfirm(value); setError(null); setSuccess(null); }}
              error={confirm && confirm !== password ? 'Passwords do not match.' : undefined}
              success={confirm && confirm === password && password.length >= 8 ? 'Passwords match.' : undefined}
              autoComplete="new-password"
              onSubmitEditing={() => void submit()}
            />

            {error ? (
              <View accessibilityRole="alert" style={{ padding: theme.spacing.sm, borderRadius: theme.radius.md, backgroundColor: theme.colors.noSoft }}>
                <VadText variant="caption" tone="danger">{error}</VadText>
              </View>
            ) : success ? (
              <View accessibilityRole="alert" style={{ padding: theme.spacing.sm, borderRadius: theme.radius.md, backgroundColor: theme.colors.yesSoft }}>
                <VadText variant="caption" tone="yes">{success}</VadText>
              </View>
            ) : null}

            <VadButton label="Update password" loading={working} disabled={!valid} onPress={() => void submit()} />
            <VadButton label="Cancel recovery" variant="ghost" disabled={working} onPress={dismissPasswordRecovery} />
          </VadCard>
        </View>
      </View>
    </SafeAreaView>
  );
}
