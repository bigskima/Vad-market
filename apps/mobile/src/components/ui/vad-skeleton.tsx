import { View, type ViewProps } from 'react-native';

import { useVadTheme } from '@/providers/theme-provider';

export function VadSkeleton({ width = '100%', height = 16, radius, style, ...props }: ViewProps & { width?: number | `${number}%`; height?: number; radius?: number }) {
  const theme = useVadTheme();
  return <View {...props} style={[{ width, height, borderRadius: radius ?? theme.radius.md, backgroundColor: theme.colors.surfaceMuted }, style]} />;
}
