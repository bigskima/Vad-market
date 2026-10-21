import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { supabase } from '@/lib/supabase';

type TotpEnrollment = { id: string; secret: string; uri: string };

export default function AccountSecurityScreen() {
  const theme = useVadTheme();
  const { session, requestPasswordReset } = useAuth();
  const email = session?.user.email ?? '';
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [factors, setFactors] = useState<{ id: string; factor_type: string; status: string }[]>([]);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadFactors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: factorError } = await supabase.auth.mfa.listFactors();
      if (factorError) throw factorError;
      setFactors((data?.all ?? [])
        .filter((factor) => factor.status === 'verified')
        .map((factor) => ({ id: factor.id, factor_type: factor.factorType, status: factor.status })));
    } catch {
      setError('VAD could not load multi-factor status from the sign-in provider. Try again later.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void loadFactors(), 0);
    return () => clearTimeout(timer);
  }, [loadFactors]);

  async function sendPasswordReset() {
    if (!email) {
      setError('This account has no email address available for password recovery.');
      return;
    }
    setWorking(true);
    setError(null);
    setMessage(null);
    const result = await requestPasswordReset(email);
    setWorking(false);
    if (result.ok) setMessage(result.message ?? 'Password reset instructions were requested.');
    else setError(result.message ?? 'Password reset could not be requested.');
  }

  async function startTotp() {
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'VAD Market authenticator',
      });
      if (enrollError) throw enrollError;
      if (!data?.totp?.secret || !data?.totp?.uri || !data.id) {
        throw new Error('The sign-in provider did not return an authenticator secret.');
      }
      setEnrollment({ id: data.id, secret: data.totp.secret, uri: data.totp.uri });
      setCode('');
      setMessage('Add this secret to your authenticator app, then verify a current six-digit code.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Authenticator setup is not available for this account.');
    } finally {
      setWorking(false);
    }
  }

  async function verifyTotp() {
    if (!enrollment) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the current six-digit code from your authenticator app.');
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: enrollment.id });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enrollment.id,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) throw verifyError;
      setEnrollment(null);
      setCode('');
      setMessage('Two-factor authentication has been verified and enabled by the sign-in provider.');
      await loadFactors();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The authenticator code could not be verified.');
    } finally {
      setWorking(false);
    }
  }

  function disableTotp(factorId: string) {
    Alert.alert('Disable two-factor authentication?', 'This removes the selected authenticator factor from your account.', [
      { text: 'Keep enabled', style: 'cancel' },
      { text: 'Disable', style: 'destructive', onPress: () => {
        setWorking(true);
        setError(null);
        void supabase.auth.mfa.unenroll({ factorId })
          .then(({ error: unenrollError }) => {
            if (unenrollError) throw unenrollError;
            setMessage('Authenticator removed from this account.');
            return loadFactors();
          })
          .catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : 'Authenticator could not be removed.');
          })
          .finally(() => setWorking(false));
      } },
    ]);
  }

  const verifiedTotp = factors.filter((factor) => factor.factor_type === 'totp');

  return (
    <ProductSubpage title="Security Settings" maxWidth={720}>
      <View style={{ gap: theme.spacing.md }}>
        <View style={{ gap: 4 }}>
          <VadText variant="caption" tone="brand">ACCOUNT SECURITY</VadText>
          <VadText variant="title">Protect your VAD account</VadText>
          <VadText variant="caption" tone="secondary">Password recovery and authenticator-based two-factor controls use your current sign-in provider.</VadText>
        </View>

        <VadCard style={{ gap: theme.spacing.sm }}>
          <VadText variant="heading">Password</VadText>
          <VadText variant="body" tone="secondary">Request a verified password reset link for {email || 'your registered email'}.</VadText>
          <VadButton label="Send password reset email" variant="secondary" loading={working} disabled={!email} onPress={() => void sendPasswordReset()} />
        </VadCard>

        <VadCard style={{ gap: theme.spacing.sm }}>
          <View style={{ gap: 3 }}>
            <VadText variant="heading">Two-Factor Authentication</VadText>
            <VadText variant="caption" tone="secondary">Authenticator factors are listed from the sign-in provider. A factor is enabled only after its code has been verified.</VadText>
          </View>
          {loading ? <VadText variant="caption" tone="secondary">Checking authenticator status…</VadText> : error && factors.length === 0 ? (
            <VadText variant="caption" tone="danger">{error}</VadText>
          ) : verifiedTotp.length ? (
            <View style={{ gap: theme.spacing.sm }}>
              {verifiedTotp.map((factor) => (
                <View key={factor.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <VadText variant="bodyStrong">Authenticator app</VadText>
                    <VadText variant="caption" tone="secondary">Verified by your sign-in provider</VadText>
                  </View>
                  <VadButton label="Remove" variant="danger" size="small" fullWidth={false} disabled={working} onPress={() => disableTotp(factor.id)} />
                </View>
              ))}
            </View>
          ) : enrollment ? (
            <View style={{ gap: theme.spacing.sm }}>
              <VadText variant="bodyStrong">1. Add this secret to your authenticator app</VadText>
              <View style={{ padding: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }}>
                <VadText selectable style={{ fontFamily: 'monospace', fontSize: 15, letterSpacing: 1 }}>{enrollment.secret}</VadText>
              </View>
              <VadText variant="caption" tone="secondary">Use the manual setup key in your authenticator app. Do not share it with anyone.</VadText>
              <VadText variant="bodyStrong">2. Verify the current code</VadText>
              <VadInput label="Six-digit authenticator code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="000000" autoComplete="one-time-code" />
              <VadButton label="Verify and enable" loading={working} onPress={() => void verifyTotp()} />
              <VadButton label="Cancel setup" variant="secondary" disabled={working} onPress={() => { setEnrollment(null); setCode(''); }} />
            </View>
          ) : (
            <View style={{ gap: theme.spacing.sm }}>
              <VadText variant="caption" tone="secondary">Not enabled</VadText>
              <VadButton label="Set up authenticator" loading={working} onPress={() => void startTotp()} />
            </View>
          )}
        </VadCard>

        <VadCard style={{ gap: 6 }}>
          <VadText variant="heading">Active Sessions</VadText>
          <VadText variant="caption" tone="secondary">This app build does not have a server API for listing and revoking other device sessions. It will not display fabricated devices. Use Log Out to end this local session.</VadText>
        </VadCard>

        {message ? <VadCard style={{ borderColor: theme.colors.yes, backgroundColor: theme.colors.yesSoft }}><VadText variant="caption" tone="yes">{message}</VadText></VadCard> : null}
        {error && !(loading && factors.length === 0) ? <VadCard style={{ borderColor: theme.colors.no, backgroundColor: theme.colors.noSoft }}><VadText variant="caption" tone="no">{error}</VadText></VadCard> : null}
      </View>
    </ProductSubpage>
  );
}
