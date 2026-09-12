import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { ProposalScreen } from '@/features/proposals/proposal-screen';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';
import { useAuth } from '@/providers/auth-provider';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function AdminCreateMarketRoute() {
  return (
    <AdminPermissionGate permissions={['markets.manage']}>
      <AdminRouteContainer>
        <AdminCreateMarketContent />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}

function AdminCreateMarketContent() {
  const theme = useVadTheme();
  const { session } = useAuth();
  const data = useProductDataContext();
  const runtime = useRuntimeCapabilities(session);
  const capabilityReason = runtime.snapshot.reasons.submitMarketProposal;

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <VadCard variant="brand" style={{ gap: 4 }}>
        <VadText variant="bodyStrong" tone="brand">CREATE VAD MARKET</VadText>
        <VadText variant="caption" tone="secondary">
          Post a market from the admin workspace. For tester launch, choose Test NGN (TNGN). VAD handles admission and resolution configuration automatically; approved markets then move to Market Publishing.
        </VadText>
      </VadCard>

      <ProposalScreen
        proposals={data.proposals}
        activeAssetCodes={runtime.snapshot.context.activeAssetCodes}
        canSubmitProposal={runtime.snapshot.capabilities.submitMarketProposal}
        capabilityReason={capabilityReason}
        capabilityLoading={runtime.isRefreshing && capabilityReason === 'CAPABILITIES_LOADING'}
        historyLoading={data.loading}
        historyError={data.sectionErrors.proposals}
        onReload={data.load}
      />
    </View>
  );
}
