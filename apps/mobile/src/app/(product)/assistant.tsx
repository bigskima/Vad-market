import { useLocalSearchParams } from 'expo-router';

import { AssistantScreen } from '@/features/assistant/assistant-screen';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { useProductDataContext } from '@/providers/product-data-provider';

export default function AssistantRoute() {
  const data = useProductDataContext();
  const params = useLocalSearchParams<{
    marketId?: string;
    prompt?: string;
    from?: string;
  }>();
  const marketId = Array.isArray(params.marketId) ? params.marketId[0] : params.marketId;
  const prompt = Array.isArray(params.prompt) ? params.prompt[0] : params.prompt;
  const from = Array.isArray(params.from) ? params.from[0] : params.from;

  return (
    <ProductSubpage title="VAD Assistant" maxWidth={1120}>
      <AssistantScreen
        initialMarketId={marketId ?? null}
        initialPrompt={prompt ?? ''}
        sourceRoute={from ?? '/assistant'}
        activeAssetCodes={data.activeAssetCodes}
        countryCode={data.countryCode}
      />
    </ProductSubpage>
  );
}
