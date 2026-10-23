import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadText } from '@/components/ui/vad-text';
import { ProductRoute } from '@/features/navigation/product-route';
import { WalletScreen } from '@/features/wallet/wallet-screen';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { supabase } from '@/lib/supabase';

export default function WalletRoute() {
  const data = useProductDataContext();
  const theme = useVadTheme();
  const [temporaryTestCredit, setTemporaryTestCredit] = useState<{
    active: boolean;
    amount?: number | string;
    availableBalance?: number | string;
    message?: string;
  } | null>(null);
  const walletReadFailedWithoutData = Boolean(data.sectionErrors.wallet && !data.wallet.length);

  useEffect(() => {
    let active = true;
    void supabase.rpc('my_temporary_ngn_test_credit_status')
      .then(({ data: status, error }) => {
        if (!active) return;
        if (error || !status || typeof status !== 'object') {
          setTemporaryTestCredit(null);
          return;
        }
        setTemporaryTestCredit(status as {
          active: boolean;
          amount?: number | string;
          availableBalance?: number | string;
          message?: string;
        });
      })
      .catch(() => { if (active) setTemporaryTestCredit(null); });
    return () => { active = false; };
  }, []);

  return (
    <ProductRoute active="Wallet">
      {walletReadFailedWithoutData ? (
        <VadErrorState
          title="Wallet balance could not be loaded"
          message={data.sectionErrors.wallet ?? 'Wallet data is unavailable.'}
          onRetry={() => void data.load()}
        />
      ) : (
        <View style={{ gap: theme.spacing.lg }}>
          {temporaryTestCredit?.active ? (
            <VadCard variant="surface" style={{ gap: theme.spacing.sm, borderColor: theme.colors.warning }}>
              <View style={{ gap: 4 }}>
                <VadText variant="label" tone="brand">TEMPORARY NGN MARKET-TEST CREDIT</VadText>
                <VadText variant="title">₦{Number(temporaryTestCredit.amount ?? 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })}</VadText>
                <VadText variant="caption" tone="secondary">
                  This is a temporary, synthetic test credit—not a deposit or real cash balance. It can be used to place orders on actual published NGN markets, and those trades settle through the normal market/ledger path. NGN deposits, transfers and withdrawals are locked while the credit is active.
                </VadText>
              </View>
            </VadCard>
          ) : null}
          <WalletScreen
            wallets={data.wallet}
            walletActivity={data.walletActivity}
            walletActivityError={data.sectionErrors.walletActivity ?? null}
            unreadNotificationCount={data.notifications.filter((notification) => !notification.read_at).length}
            onDeposit={() => router.push('/wallet/deposit')}
            onWithdraw={() => router.push('/wallet/withdraw')}
            onTransfer={() => router.push('/wallet/send')}
            onActivity={() => router.push('/wallet/activity')}
            onRetryActivity={() => void data.refreshPortfolio()}
            onNotifications={() => router.push('/notifications')}
            activeAssetCodes={data.activeAssetCodes}
            temporaryNgnCreditActive={Boolean(temporaryTestCredit?.active)}
          />
        </View>
      )}
    </ProductRoute>
  );
}
