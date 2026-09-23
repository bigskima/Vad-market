import {
  DynamicProvider,
  useGetWalletAccounts,
  useSendEmailOTP,
  useUser,
  useVerifyOTP,
} from '@dynamic-labs-sdk/react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import {
  clearDynamicWalletSession,
  dynamicClient,
  dynamicWalletConfiguration,
  ensureDynamicEmbeddedWallets,
  initializeDynamicWalletClient,
} from '@/lib/dynamic-client.native';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

type OtpVerification = NonNullable<ReturnType<typeof useSendEmailOTP>['data']>;

export function CryptoWalletConnections() {
  const theme = useVadTheme();
  const [initialized, setInitialized] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(() =>
    dynamicWalletConfiguration.ready && dynamicClient
      ? null
      : 'Dynamic wallet activation is not configured for this build.',
  );

  useEffect(() => {
    let active = true;

    if (!dynamicWalletConfiguration.ready || !dynamicClient) {
      return () => {
        active = false;
      };
    }

    void initializeDynamicWalletClient()
      .then(() => {
        if (active) {
          setInitializationError(null);
          setInitialized(true);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setInitializationError(
            reason instanceof Error
              ? reason.message
              : 'VAD could not initialize embedded wallets.',
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (initializationError || !dynamicClient) {
    return (
      <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
        <VadText variant="caption" tone="brand">SELF-CUSTODY USDC</VadText>
        <VadText variant="heading">Embedded wallet unavailable</VadText>
        <VadText variant="caption" tone="secondary">
          {initializationError ?? 'Dynamic wallet activation is not configured for this build.'}
        </VadText>
      </VadCard>
    );
  }

  if (!initialized) {
    return (
      <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
        <VadText variant="caption" tone="brand">SELF-CUSTODY USDC</VadText>
        <VadSkeleton height={64} radius={theme.radius.lg} />
      </VadCard>
    );
  }

  return (
    <DynamicProvider client={dynamicClient}>
      <DynamicEmailWallet />
    </DynamicProvider>
  );
}

function DynamicEmailWallet() {
  const theme = useVadTheme();
  const { session } = useAuth();
  const vadEmail = session?.user.email?.trim().toLowerCase() ?? '';
  const vadEmailConfirmed = Boolean(
    session?.user.email_confirmed_at ?? session?.user.confirmed_at,
  );
  const dynamicUserState: unknown = useUser();
  const dynamicEmail = readDynamicEmail(dynamicUserState);
  const walletsQuery = useGetWalletAccounts();
  const sendOtp = useSendEmailOTP();
  const verifyOtp = useVerifyOTP();

  const [otpVerification, setOtpVerification] = useState<OtpVerification | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const walletRows = useMemo(
    () => (walletsQuery.data ?? []).map(toWalletRow).filter((wallet) => wallet.address),
    [walletsQuery.data],
  );

  useEffect(() => {
    if (!dynamicEmail) return;
    if (vadEmail && dynamicEmail === vadEmail) return;

    let active = true;
    void clearDynamicWalletSession()
      .then(() => {
        if (!active) return;
        setOtpVerification(null);
        setVerificationCode('');
        setLocalError(
          vadEmail
            ? 'A previous wallet session was cleared. Activate the wallet again with your current VAD email.'
            : null,
        );
        void walletsQuery.refetch();
      })
      .catch(() => {
        if (active) setLocalError('VAD could not safely clear the previous wallet session.');
      })
      .finally(() => undefined);

    return () => {
      active = false;
    };
  }, [dynamicEmail, vadEmail, walletsQuery]);

  const startEmailVerification = useCallback(async () => {
    if (!vadEmail) {
      setLocalError('Your VAD account does not have an email address.');
      return;
    }
    if (!vadEmailConfirmed) {
      setLocalError('Confirm your VAD account email before activating a USDC wallet.');
      return;
    }

    setLocalError(null);
    try {
      const result = await sendOtp.mutateAsync({ email: vadEmail });
      setOtpVerification(result);
      setVerificationCode('');
    } catch (reason) {
      setLocalError(
        reason instanceof Error
          ? reason.message
          : 'VAD could not send the wallet verification code.',
      );
    }
  }, [sendOtp, vadEmail, vadEmailConfirmed]);

  const completeEmailVerification = useCallback(async () => {
    const code = verificationCode.trim();
    if (!otpVerification || !code) return;

    setLocalError(null);
    try {
      await verifyOtp.mutateAsync({
        otpVerification,
        verificationToken: code,
      });
      await ensureDynamicEmbeddedWallets();
      setOtpVerification(null);
      setVerificationCode('');
      await walletsQuery.refetch();
    } catch (reason) {
      setLocalError(
        reason instanceof Error
          ? reason.message
          : 'The verification code could not be confirmed.',
      );
    }
  }, [otpVerification, verificationCode, verifyOtp, walletsQuery]);

  const ensureWalletsForAuthenticatedSession = useCallback(async () => {
    setLocalError(null);
    try {
      await ensureDynamicEmbeddedWallets();
      await walletsQuery.refetch();
    } catch (reason) {
      setLocalError(
        reason instanceof Error
          ? reason.message
          : 'VAD could not finish creating the embedded wallets.',
      );
    }
  }, [walletsQuery]);

  const authenticatedForVadUser = Boolean(vadEmail && dynamicEmail === vadEmail);
  const sessionMismatch = Boolean(dynamicEmail && dynamicEmail !== vadEmail);
  const busy = sessionMismatch || sendOtp.isPending || verifyOtp.isPending;

  return (
    <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
      <View style={{ gap: 3 }}>
        <VadText variant="caption" tone="brand">SELF-CUSTODY USDC</VadText>
        <VadText variant="heading">VAD embedded wallet</VadText>
        <VadText variant="caption" tone="secondary">
          Your normal VAD login stays unchanged. Email verification activates a self-custody crypto wallet for USDC markets.
        </VadText>
      </View>

      {authenticatedForVadUser && walletRows.length ? (
        <View style={{ gap: theme.spacing.sm }}>
          {walletRows.map((wallet, index) => (
            <VadCard
              key={wallet.id || `${wallet.chain}-${wallet.address}-${index}`}
              variant="muted"
              style={{ gap: theme.spacing.xs }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: theme.spacing.sm,
                }}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <VadText variant="bodyStrong">{walletLabel(wallet.chain)}</VadText>
                  <VadText variant="caption" tone="tertiary" numberOfLines={1}>
                    {shortAddress(wallet.address)}
                  </VadText>
                </View>
                <VadChip label="EMBEDDED" tone="brand" />
                <VadChip label="ACTIVE" tone="yes" />
              </View>
            </VadCard>
          ))}
          <VadText variant="caption" tone="tertiary">
            Private keys remain with the embedded-wallet security layer. VAD&apos;s NGN balance is separate.
          </VadText>
        </View>
      ) : otpVerification ? (
        <View style={{ gap: theme.spacing.sm }}>
          <VadText variant="bodyStrong">Check {maskEmail(vadEmail)}</VadText>
          <VadText variant="caption" tone="secondary">
            Enter the verification code Dynamic sent to the same email used by your VAD account.
          </VadText>
          <VadInput
            label="Verification code"
            value={verificationCode}
            onChangeText={(value) => {
              setVerificationCode(value.replace(/\s/g, ''));
              setLocalError(null);
            }}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={8}
            editable={!busy}
          />
          <VadButton
            label="Verify & activate wallet"
            loading={verifyOtp.isPending}
            disabled={!verificationCode.trim() || busy}
            onPress={() => void completeEmailVerification()}
          />
          <VadButton
            label="Send a new code"
            variant="secondary"
            loading={sendOtp.isPending}
            disabled={busy}
            onPress={() => void startEmailVerification()}
          />
        </View>
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          <VadCard variant="muted" style={{ gap: 3 }}>
            <VadText variant="caption" tone="tertiary">VAD ACCOUNT EMAIL</VadText>
            <VadText variant="bodyStrong">{vadEmail || 'No email available'}</VadText>
          </VadCard>
          <VadButton
            label={authenticatedForVadUser ? 'Finish wallet setup' : 'Activate USDC wallet'}
            loading={busy || walletsQuery.isFetching}
            disabled={!vadEmail || !vadEmailConfirmed || busy}
            onPress={() => {
              if (authenticatedForVadUser) void ensureWalletsForAuthenticatedSession();
              else void startEmailVerification();
            }}
          />
          <VadText variant="caption" tone="tertiary">
            {vadEmailConfirmed
              ? 'No Google, Apple or separate wallet app is required for this sandbox flow.'
              : 'Confirm your VAD account email first. Dynamic wallet activation will use that same email.'}
          </VadText>
        </View>
      )}

      {localError ? (
        <VadErrorState
          title="Wallet activation needs attention"
          message={localError}
          onRetry={() => {
            setLocalError(null);
            void startEmailVerification();
          }}
        />
      ) : null}
    </VadCard>
  );
}

function readDynamicEmail(value: unknown): string {
  if (!value || typeof value !== 'object') return '';

  const row = value as Record<string, unknown>;
  if (typeof row.email === 'string') return row.email.trim().toLowerCase();

  if ('data' in row) {
    const nested = readDynamicEmail(row.data);
    if (nested) return nested;
  }

  const credentials = row.verifiedCredentials;
  if (Array.isArray(credentials)) {
    for (const credential of credentials) {
      const nested = readDynamicEmail(credential);
      if (nested) return nested;
    }
  }

  return '';
}

function toWalletRow(value: unknown) {
  if (!value || typeof value !== 'object') {
    return { id: '', address: '', chain: '' };
  }

  const row = value as Record<string, unknown>;
  return {
    id: typeof row.id === 'string' ? row.id : '',
    address: typeof row.address === 'string' ? row.address : '',
    chain: typeof row.chain === 'string'
      ? row.chain
      : typeof row.chainName === 'string'
        ? row.chainName
        : '',
  };
}

function walletLabel(chain: string) {
  const normalized = chain.toUpperCase();
  if (normalized.includes('SOL')) return 'Solana wallet';
  if (normalized.includes('EVM') || normalized.includes('ETH')) return 'EVM wallet';
  return chain ? `${chain} wallet` : 'Embedded wallet';
}

function shortAddress(address: string) {
  if (address.length <= 18) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function maskEmail(email: string) {
  const [name, domain] = email.split('@');
  if (!name || !domain) return email;
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${'*'.repeat(Math.max(2, Math.min(6, name.length - visible.length)))}@${domain}`;
}
