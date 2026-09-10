import { View } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import type { PublicNotice } from '@/services/home-content-api';

export function HomePublicNotice({ notice }: { notice?: PublicNotice }) {
  const theme = useVadTheme();
  const density = useProductDensity();

  if (!notice) return null;

  const warning = notice.tone === 'WARNING';

  return (
    <View
      accessibilityRole="alert"
      style={{
        minHeight: density.compact ? 30 : 32,
        justifyContent: 'center',
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: warning ? theme.colors.warning : theme.colors.yes,
        backgroundColor: warning ? theme.colors.warningSoft : theme.colors.yesSoft,
        paddingHorizontal: density.compact ? 10 : 12,
        paddingVertical: 4,
      }}
    >
      <VadText
        variant="caption"
        tone={warning ? 'warning' : 'yes'}
        numberOfLines={1}
        style={{ fontWeight: '700', textAlign: 'center' }}
      >
        {notice.message}
      </VadText>
    </View>
  );
}
