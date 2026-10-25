import { router } from 'expo-router';
import { View } from 'react-native';

import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { AssistantEntry } from '@/features/assistant/assistant-entry';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { runtimeCapabilityReason } from '@/features/policy/runtime-capability-copy';
import { SocialConvictionFeed } from '@/features/social/social-conviction-feed';
import { TourTarget } from '@/features/tour/tour-provider';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';
import { useAuth } from '@/providers/auth-provider';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import type { MarketCatalogItem } from '@/services/market-api';

export default function CommunityRoute() {
  const { session } = useAuth();
  const data = useProductDataContext();
  const runtime = useRuntimeCapabilities(session);
  const theme = useVadTheme();
  const createPostReason = runtime.snapshot.reasons.createPost;
  const createPostLoading = runtime.isRefreshing && createPostReason === 'CAPABILITIES_LOADING';
  const canCreatePost = runtime.snapshot.capabilities.createPost;

  const openMarket = (market: MarketCatalogItem) => {
    router.push({
      pathname: '/market/[marketId]',
      params: { marketId: market.instrument_public_id },
    });
  };

  return (
    <ProductSubpage title="Community" maxWidth={800}>
      <AssistantEntry
        compact
        label="Ask VAD AI"
        detail="Understand market discussions."
        prompt="Help me understand how to evaluate reasoning in VAD Community posts without confusing trader conviction with the official market result."
        sourceRoute="/community"
      />

      {createPostLoading ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.xl,
            backgroundColor: theme.colors.surfaceRaised,
            padding: theme.spacing.md,
            gap: theme.spacing.xs,
          }}
        >
          <VadSkeleton width={150} height={18} />
          <VadSkeleton width="72%" height={16} />
        </View>
      ) : !canCreatePost ? (
        <View
          accessibilityRole="alert"
          style={{
            borderLeftWidth: 3,
            borderLeftColor: theme.colors.warning,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.warningSoft,
            padding: theme.spacing.md,
            gap: 2,
          }}
        >
          <VadText variant="caption" tone="warning">POSTING UNAVAILABLE</VadText>
          <VadText variant="caption" tone="secondary">{runtimeCapabilityReason(createPostReason)}</VadText>
        </View>
      ) : null}

      <TourTarget id="community-feed">
      <SocialConvictionFeed
        markets={data.markets}
        canCreatePost={canCreatePost}
        onOpenMarket={openMarket}
      />
      </TourTarget>
    </ProductSubpage>
  );
}
