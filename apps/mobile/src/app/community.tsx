import { router } from 'expo-router';
import { View } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { runtimeCapabilityMessage } from '@/features/policy/runtime-capability-copy';
import { SocialConvictionFeed } from '@/features/social/social-conviction-feed';
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
  const canCreatePost = runtime.snapshot.capabilities.createPost;
  const createPostReason = runtime.snapshot.reasons.createPost;

  const openMarket = (market: MarketCatalogItem) => {
    router.push({
      pathname: '/market/[marketId]',
      params: { marketId: market.instrument_public_id },
    });
  };

  return (
    <ProductSubpage title="Community" maxWidth={1040}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="label" tone="brand">COMMUNITY</VadText>
        <VadText variant="title">Conviction with a public track record.</VadText>
        <VadText tone="secondary">
          Share reasoning, attach a live market when relevant and inspect the
          creator behind a prediction without turning reputation into oracle
          authority.
        </VadText>
      </View>

      {!canCreatePost ? (
        <View
          style={{
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: theme.colors.border,
            paddingVertical: theme.spacing.md,
            gap: 2,
          }}
        >
          <VadText variant="bodyStrong">Posting is currently unavailable</VadText>
          <VadText variant="caption" tone="secondary">
            {runtimeCapabilityMessage(createPostReason, 'post')}
          </VadText>
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
