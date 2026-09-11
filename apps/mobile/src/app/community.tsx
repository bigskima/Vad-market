import { router } from 'expo-router';
import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadSectionHeader } from '@/components/ui/vad-section-header';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { runtimeCapabilityReason } from '@/features/policy/runtime-capability-copy';
import { SocialConvictionFeed } from '@/features/social/social-conviction-feed';
import { useProductDensity } from '@/hooks/use-product-density';
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
  const density = useProductDensity();
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
      <VadSectionHeader
        title="Community"
        subtitle="Share your view, follow other creators and discuss the markets you care about."
      />

      <VadCard
        variant="brand"
        style={{
          padding: density.phone ? theme.spacing.md : theme.spacing.lg,
          gap: theme.spacing.xs,
        }}
      >
        <VadText variant="caption" tone="brand">VAD COMMUNITY</VadText>
        <VadText variant={density.phone ? 'heading' : 'title'}>Share your reasoning. Build a track record.</VadText>
        <VadText variant="caption" tone="secondary">
          Link your predictions to live markets and see how your calls perform over time. Every market still follows its own published rules.
        </VadText>
      </VadCard>

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

      <SocialConvictionFeed
        markets={data.markets}
        canCreatePost={canCreatePost}
        onOpenMarket={openMarket}
      />
    </ProductSubpage>
  );
}
