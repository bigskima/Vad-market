import { Stack } from 'expo-router';

import { useVadTheme } from '@/providers/theme-provider';

export default function PlayLayout() {
  const theme = useVadTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        animation: 'slide_from_right',
      }}
    />
  );
}
