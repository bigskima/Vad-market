import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { PaymentReadinessCard } from '@/components/payment-readiness-card';
import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';
import { useAuth } from '@/providers/auth-provider';
import { useCurrencyPreference } from '@/providers/currency-preference-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { supabase } from '@/lib/supabase';

export default function DepositRoute() {
  const { session } = useAuth();
  const runtime = useRuntimeCapabilities(session);
  const currencyPreference = useCurrencyPreference();
  const theme = useVadTheme();
  const [creditStatus, setCreditStatus] = useState<{ loaded: boolean; active: boolean }>({ loaded: false, active: false });
  useEffect(() => {
    let current = true;
    void supabase.rpc('my_temporary_ngn_test_credit_status')
      .then(({ data, error }) => {
        if (!current) return;
        setCreditStatus({
          loaded: true,
          active: !error && Boolean(data && typeof data === 'object' && (data as { active?: boolean }).active),
        });
      })
      .catch(() => { if (current) setCreditStatus({ loaded: true, active: false }); });
    return () => { current = false; };
  }, []);
  const reason = runtime.snapshot.reasons.deposit;
  const hasNgn = runtime.snapshot.context.activeAssetCodes.includes('NGN') && currencyPreference.isCurrencyEnabled('NGN');

  if (!hasNgn) return <Redirect href="/wallet" />;

  if (!creditStatus.loaded || creditStatus.active) {
    return (
      <ProductSubpage title="Deposit" maxWidth={980}>
        <VadCard variant="surface" style={{ gap: theme.spacing.sm, borderColor: theme.colors.brandPrimary }}>
          <VadText variant="bodyStrong">{creditStatus.active ? 'NGN deposits temporarily locked' : 'Checking NGN test-credit restrictions'}</VadText>
          <VadText variant="caption" tone="secondary">
            {creditStatus.active
              ? 'A temporary market-testing credit is active. NGN deposits are locked until the test credit is revoked, so the test balance cannot be mixed with incoming real funds.'
              : 'Verifying whether a temporary NGN market-test credit is active before enabling this action.'}
          </VadText>
        </VadCard>
      </ProductSubpage>
    );
  }

  return (
    <ProductSubpage title="Deposit" maxWidth={980}>
      <PaymentReadinessCard
        initialMode="DEPOSIT"
        lockMode
        canOperate={runtime.snapshot.capabilities.deposit}
        capabilityReason={reason}
        capabilityLoading={
          runtime.isRefreshing && reason === 'CAPABILITIES_LOADING'
        }
      />
    </ProductSubpage>
  );
}
