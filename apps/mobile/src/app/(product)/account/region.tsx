import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { TourTarget } from '@/features/tour/tour-provider';
import { useCurrencyPreference, type VADCurrency } from '@/providers/currency-preference-provider';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function LanguageRegionScreen() {
  const theme = useVadTheme();
  const data = useProductDataContext();
  const currency = useCurrencyPreference();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Device default';
  const available = (['NGN', 'USDC'] as VADCurrency[])
    .filter((code) => currency.isCurrencyEligible(code));

  return (
    <ProductSubpage title="Language & Region" maxWidth={720}>
      <View style={{ gap: theme.spacing.md }}>
        <View style={{ gap: 4 }}>
          <VadText variant="caption" tone="brand">REGIONAL PREFERENCES</VadText>
          <VadText variant="title">Language and currency visibility</VadText>
          <VadText variant="caption" tone="secondary">Choose which currencies to show. Balances won't be converted.</VadText>
        </View>

        <VadCard style={{ gap: theme.spacing.md }}>
          <RegionValue label="Language" value="English" />
          <RegionValue label="Account region" value={data.countryCode || 'Not available'} />
          <RegionValue label="Time zone" value={timeZone} />
        </VadCard>

        <TourTarget id="region-settings">
        <VadCard style={{ gap: theme.spacing.sm }}>
          <VadText variant="heading">Eligible currencies</VadText>
          <VadText variant="caption" tone="secondary">Choose which currencies appear in Markets, Wallet and Portfolio.</VadText>
          {available.map((code) => {
            const enabled = currency.isCurrencyEnabled(code);
            return (
              <Pressable key={code} accessibilityRole="switch" accessibilityLabel={`Show ${code} in trading`} accessibilityState={{ checked: enabled, disabled: currency.loading }} disabled={currency.loading} onPress={() => void currency.toggleCurrency(code)} style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingVertical: 7, opacity: pressed ? 0.75 : 1 })}>
                <View style={{ flex: 1, gap: 2 }}>
                  <VadText variant="bodyStrong">{code}</VadText>
                  <VadText variant="caption" tone="secondary">{code === 'NGN' ? 'Nigerian naira account and eligible markets.' : 'USDC account and eligible markets.'}</VadText>
                </View>
                <View style={{ width: 43, height: 25, borderRadius: 14, padding: 3, justifyContent: 'center', alignItems: enabled ? 'flex-end' : 'flex-start', backgroundColor: enabled ? theme.colors.brandPrimary : theme.colors.border }}>
                  <View style={{ width: 19, height: 19, borderRadius: 10, backgroundColor: theme.colors.surface }} />
                </View>
              </Pressable>
            );
          })}
        </VadCard>
        </TourTarget>
      </View>
    </ProductSubpage>
  );
}

function RegionValue({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ gap: 2 }}>
      <VadText variant="caption" tone="secondary">{label}</VadText>
      <VadText variant="bodyStrong">{value}</VadText>
      <View style={{ height: 1, backgroundColor: theme.colors.border, marginTop: 8 }} />
    </View>
  );
}
