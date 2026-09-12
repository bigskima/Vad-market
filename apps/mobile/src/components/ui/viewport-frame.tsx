import { type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { useVadTheme } from '@/providers/theme-provider';

export function ViewportFrame({ children }: { children: ReactNode }) {
  const theme = useVadTheme();
  const { width, height } = useWindowDimensions();

  return (
    <View
      style={{
        flex: 1,
        width,
        height,
        minWidth: width,
        minHeight: height,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: theme.colors.background,
      }}
    >
      {children}
    </View>
  );
}
