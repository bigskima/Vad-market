import { useMemo, useRef, useState } from 'react';
import { Pressable, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

const callingCodes: Record<string, string> = {
  NG: '+234',
  GH: '+233',
  KE: '+254',
  ZA: '+27',
  GB: '+44',
  US: '+1',
  CA: '+1',
  IN: '+91',
  AU: '+61',
  DE: '+49',
  FR: '+33',
};

function inferCallingCode() {
  try {
    const navigatorLocale = (globalThis as { navigator?: { language?: string } }).navigator?.language;
    const locale = navigatorLocale ?? Intl.DateTimeFormat().resolvedOptions().locale;
    const region = locale.split(/[-_]/).find((part) => /^[A-Z]{2}$/i.test(part) && part.length === 2)?.toUpperCase();
    return region ? callingCodes[region] ?? '+' : '+';
  } catch {
    return '+';
  }
}

export function PhoneVerificationScreen() {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const {
    requestPhoneVerification,
    verifyPhoneOtp,
    dismissPhoneVerification,
  } = useAuth();
  const [countryCode, setCountryCode] = useState(inferCallingCode);
  const [subscriber, setSubscriber] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const otpRefs = useRef<Array<TextInput | null>>([]);

  const phone = useMemo(() => {
    const prefix = countryCode.trim().startsWith('+') ? countryCode.trim() : `+${countryCode.trim()}`;
    return `${prefix}${subscriber.replace(/\D/g, '').replace(/^0+/, '')}`;
  }, [countryCode, subscriber]);
  const otp = digits.join('');

  async function sendCode() {
    if (working) return;
    setWorking(true);
    setError(null);
    setMessage(null);
    const result = await requestPhoneVerification(phone);
    setWorking(false);
    if (!result.ok) {
      setError(result.message ?? 'We could not send a verification code right now. Please try again.');
      return;
    }
    setSentTo(phone);
    setDigits(['', '', '', '', '', '']);
    setMessage(result.message ?? 'Verification code sent.');
    setTimeout(() => otpRefs.current[0]?.focus(), 50);
  }

  async function confirmCode() {
    if (!sentTo || otp.length !== 6 || working) return;
    setWorking(true);
    setError(null);
    setMessage(null);
    const result = await verifyPhoneOtp(sentTo, otp);
    setWorking(false);
    if (!result.ok) {
      setError(result.message ?? 'We could not confirm that code. Check it and try again.');
      return;
    }
    setMessage(result.message ?? 'Phone number verified.');
  }

  function updateDigit(index: number, value: string) {
    const nextValue = value.replace(/\D/g, '').slice(-1);
    setDigits((current) => current.map((digit, digitIndex) => digitIndex === index ? nextValue : digit));
    setError(null);
    if (nextValue && index < 5) otpRefs.current[index + 1]?.focus();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          flex: 1,
          alignSelf: 'center',
          width: '100%',
          maxWidth: 1100,
          paddingHorizontal: width < 380 ? theme.spacing.md : theme.spacing.xl,
          paddingVertical: theme.spacing.xl,
          justifyContent: 'center',
          gap: wide ? theme.spacing.xxxl : theme.spacing.xl,
        }}
      >
        <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', gap: wide ? theme.spacing.huge : theme.spacing.xl }}>
          <View style={{ flex: wide ? 1 : undefined, gap: theme.spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <VadLogo size={42} />
              <VadText variant="heading">VAD</VadText>
            </View>
            <View style={{ gap: theme.spacing.sm }}>
              <VadText variant="caption" tone="brand">ACCOUNT SECURITY</VadText>
              <VadText variant="display">Verify your phone.</VadText>
              <VadText tone="secondary">
                Add an international phone number so VAD can use it as an extra security check for sensitive account actions.
              </VadText>
            </View>
            {wide ? (
              <VadCard variant="brand" style={{ gap: theme.spacing.sm }}>
                <VadText variant="bodyStrong">Your account stays the same</VadText>
                <VadText variant="caption" tone="secondary">
                  Verifying your phone adds another way to protect your existing VAD account. It does not create another profile or wallet.
                </VadText>
              </VadCard>
            ) : null}
          </View>

          <VadCard variant="floating" style={{ flex: wide ? 0.9 : undefined, width: '100%', maxWidth: wide ? 470 : undefined, gap: theme.spacing.lg }}>
            <View style={{ gap: 4 }}>
              <VadText variant="heading">{sentTo ? 'Enter your code' : 'Your phone number'}</VadText>
              <VadText variant="caption" tone="secondary">
                {sentTo ? `We sent a six-digit code to ${sentTo}.` : 'We selected a likely country code from your device settings. You can change it.'}
              </VadText>
            </View>

            {!sentTo ? (
              <View style={{ gap: theme.spacing.md }}>
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-end' }}>
                  <View style={{ width: 104 }}>
                    <VadInput
                      label="Code"
                      floatingLabel
                      value={countryCode}
                      onChangeText={(value) => {
                        const normalized = value.replace(/[^+\d]/g, '').slice(0, 5);
                        setCountryCode(normalized);
                        setError(null);
                      }}
                      keyboardType="phone-pad"
                      autoComplete="tel-country-code"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <VadInput
                      label="Phone number"
                      floatingLabel
                      value={subscriber}
                      onChangeText={(value) => {
                        setSubscriber(value.replace(/[^\d\s()-]/g, ''));
                        setError(null);
                      }}
                      keyboardType="phone-pad"
                      autoComplete="tel-national"
                    />
                  </View>
                </View>
                <VadButton
                  label="Send verification code"
                  loading={working}
                  disabled={!subscriber.trim() || countryCode.replace(/\D/g, '').length < 1}
                  onPress={() => void sendCode()}
                />
              </View>
            ) : (
              <View style={{ gap: theme.spacing.lg }}>
                <View style={{ flexDirection: 'row', gap: width < 380 ? 6 : theme.spacing.xs, justifyContent: 'space-between' }}>
                  {digits.map((digit, index) => (
                    <TextInput
                      key={index}
                      ref={(node) => { otpRefs.current[index] = node; }}
                      accessibilityLabel={`Verification digit ${index + 1}`}
                      value={digit}
                      onChangeText={(value) => updateDigit(index, value)}
                      onKeyPress={(event) => {
                        if (event.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
                          otpRefs.current[index - 1]?.focus();
                        }
                      }}
                      keyboardType="number-pad"
                      inputMode="numeric"
                      maxLength={1}
                      selectTextOnFocus
                      style={{
                        width: width < 380 ? 42 : 48,
                        height: 54,
                        borderRadius: theme.radius.lg,
                        borderWidth: 1,
                        borderColor: digit ? theme.colors.brandPrimary : theme.colors.border,
                        backgroundColor: theme.colors.surface,
                        color: theme.colors.textPrimary,
                        textAlign: 'center',
                        fontSize: 22,
                        fontWeight: '800',
                      }}
                    />
                  ))}
                </View>

                <VadButton label="Verify phone" loading={working} disabled={otp.length !== 6} onPress={() => void confirmCode()} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'center' }}>
                  <Pressable accessibilityRole="button" onPress={() => { setSentTo(null); setError(null); setMessage(null); }} hitSlop={8}>
                    <VadText variant="caption" tone="brand">Change number</VadText>
                  </Pressable>
                  <Pressable accessibilityRole="button" disabled={working} onPress={() => void sendCode()} hitSlop={8}>
                    <VadText variant="caption" tone="brand">Send again</VadText>
                  </Pressable>
                </View>
              </View>
            )}

            {error ? (
              <View accessibilityRole="alert" style={{ borderRadius: theme.radius.md, backgroundColor: theme.colors.noSoft, padding: theme.spacing.sm }}>
                <VadText variant="caption" tone="danger">{error}</VadText>
              </View>
            ) : message ? (
              <View accessibilityRole="alert" style={{ borderRadius: theme.radius.md, backgroundColor: theme.colors.yesSoft, padding: theme.spacing.sm }}>
                <VadText variant="caption" tone="yes">{message}</VadText>
              </View>
            ) : null}

            <VadButton label="Verify later" variant="ghost" disabled={working} onPress={dismissPhoneVerification} />
          </VadCard>
        </View>
      </View>
    </SafeAreaView>
  );
}
