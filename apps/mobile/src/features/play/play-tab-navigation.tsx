import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export type PlaySection = 'Discover' | 'Games' | 'My Play';

const items: { value: PlaySection; route: string }[] = [
  { value: 'Discover', route: '/play' },
  { value: 'Games', route: '/play/games' },
  { value: 'My Play', route: '/play/activity' },
];

export function PlayTabNavigation({ active }: { active: PlaySection }) {
  const theme = useVadTheme();

  return (
    <View
      accessibilityRole="tablist"
      style={{
        alignSelf: 'stretch',
        flexDirection: 'row',
        gap: 5,
        padding: 4,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      {items.map((item) => {
        const selected = item.value === active;
        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityLabel={item.value}
            accessibilityState={{ selected }}
            onPress={() => router.replace(item.route as never)}
            style={({ pressed }) => ({
              minHeight: 40,
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 8,
              borderRadius: theme.radius.pill,
              backgroundColor: selected ? theme.colors.brandPrimary : pressed ? theme.colors.surfaceRaised : 'transparent',
              opacity: pressed ? 0.82 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <VadText
              variant="caption"
              tone={selected ? 'inverse' : 'secondary'}
              style={{ fontWeight: selected ? '800' : '600' }}
              numberOfLines={1}
            >
              {item.value}
            </VadText>
          </Pressable>
        );
      })}
    </View>
  );
}
