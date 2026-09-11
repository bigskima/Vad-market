import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  View,
} from 'react-native';

import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import type { PublicNotice } from '@/services/home-content-api';

export function ProductAnnouncementBar({ notice }: { notice?: PublicNotice | null }) {
  const theme = useVadTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [paused, setPaused] = useState(false);

  const visible = Boolean(notice && dismissedId !== notice.public_id);

  useEffect(() => {
    running.current?.stop();
    translateX.setValue(0);

    if (!visible || paused || !contentWidth) return;

    const animation = Animated.loop(
      Animated.timing(translateX, {
        toValue: -contentWidth,
        duration: Math.max(12000, contentWidth * 38),
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    running.current = animation;
    animation.start();

    return () => animation.stop();
  }, [contentWidth, paused, translateX, visible]);

  if (!notice || !visible) return null;

  const warning = notice.tone === 'WARNING';
  const backgroundColor = warning ? theme.colors.warningSoft : theme.colors.yesSoft;
  const borderColor = warning ? theme.colors.warning : theme.colors.yes;
  const textTone = warning ? 'warning' : 'yes';
  const repeated = `VAD STATUS  •  ${notice.message}     •     `;

  return (
    <View
      accessibilityRole="alert"
      style={{
        minHeight: 42,
        flexDirection: 'row',
        alignItems: 'center',
        overflow: 'hidden',
        borderBottomWidth: 1,
        borderBottomColor: borderColor,
        backgroundColor,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Pause announcement"
        onHoverIn={() => setPaused(true)}
        onHoverOut={() => setPaused(false)}
        onPressIn={() => setPaused(true)}
        onPressOut={() => setPaused(false)}
        style={{ flex: 1, minHeight: 42, justifyContent: 'center', overflow: 'hidden' }}
      >
        <Animated.View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            transform: [{ translateX }],
          }}
        >
          <View
            onLayout={(event) => {
              const width = event.nativeEvent.layout.width;
              if (width > 0 && Math.abs(width - contentWidth) > 1) setContentWidth(width);
            }}
            style={{ paddingHorizontal: theme.spacing.xl, flexDirection: 'row', alignItems: 'center' }}
          >
            <VadText variant="label" tone={textTone} numberOfLines={1}>{repeated}</VadText>
          </View>
          <View style={{ paddingHorizontal: theme.spacing.xl, flexDirection: 'row', alignItems: 'center' }}>
            <VadText variant="label" tone={textTone} numberOfLines={1}>{repeated}</VadText>
          </View>
        </Animated.View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss announcement"
        hitSlop={4}
        onPress={() => setDismissedId(notice.public_id)}
        style={({ pressed }) => ({
          width: 44,
          height: 42,
          alignItems: 'center',
          justifyContent: 'center',
          borderLeftWidth: 1,
          borderLeftColor: borderColor,
          backgroundColor,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <VadIcon name="close" size={16} color={borderColor} />
      </Pressable>
    </View>
  );
}
