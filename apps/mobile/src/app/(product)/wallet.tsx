import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { VadErrorState } from '@/components/ui/vad-error-state';
import { ProductRoute } from '@/features/navigation/product-route';
import { WalletScreen } from '@/features/wallet/wallet-screen';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { getTemporaryNgnTestCreditStatus, type TemporaryNgnTestCreditStatus } from '@/services/temporary-ngn-test-credit-api';

export default function WalletRoute() {
  const data = useProductDataContext();
  const theme = useVadTheme();
  const [temporaryTestCredit, setTemporaryTestCredit] = useState<TemporaryNgnTestCreditStatus | null>(null);

  useEffect(() => {
    let active = true;
    void getTemporaryNgnTestCreditStatus()
      .then((status) => { if (active) setTemporaryTestCredit(status); })
      .catch(() => { if (active) setTemporaryTestCredit(null); });
    return () => { active = false; };
  }, []);
  const walletReadFailedWithoutData = Boolean(data.sectionErrors.wallet && !data.wallet.length);

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
            temporaryTestCredit={temporaryTestCredit?.active ? temporaryTestCredit : null}
          />
        </View>
      )}
    </ProductRoute>
  );
}
