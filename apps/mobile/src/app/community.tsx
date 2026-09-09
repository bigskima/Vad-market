import { router } from 'expo-router';
import { View } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { ProductSubpage } from '@/features/navigation/product-subpage';
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

  const openMarket = (market: MarketCatalogItem) => {
    router.push({
      pathname: '/market/[marketId]',
      params: { marketId: market.instrument_public_id },
    });
  };

  return (
    <ProductSubpage title="Community" maxWidth={900}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="label" tone="brand">COMMUNITY</VadText>
        <VadText variant="title">Conviction with a public track record.</VadText>
        <VadText tone="secondary">
          Share reasoning, attach a live market when relevant and inspect the
          creator behind a prediction without turning reputation into oracle
          authority.
        </VadText>
      </View>

      <SocialConvictionFeed
        markets={data.markets}
        canCreatePost={runtime.snapshot.capabilities.createPost}
        onOpenMarket={openMarket}
      />
    </ProductSubpage>
  );
}
