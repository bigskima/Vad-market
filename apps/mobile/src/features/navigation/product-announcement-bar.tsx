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
  const [translateX] = useState(() => new Animated.Value(0));
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const currentX = useRef(0);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [paused, setPaused] = useState(false);

  const visible = Boolean(notice && dismissedId !== notice.public_id);

  useEffect(() => {
    let cancelled = false;
    running.current?.stop();

    if (!visible || !contentWidth) {
      currentX.current = 0;
      translateX.setValue(0);
      return;
    }

    if (paused) {
      translateX.stopAnimation((value) => {
        currentX.current = value;
      });
      return;
    }

    const animate = () => {
      if (cancelled) return;
      const start = currentX.current <= -contentWidth + 1 ? 0 : currentX.current;
      const remaining = Math.max(1, contentWidth + start);
      translateX.setValue(start);

      const animation = Animated.timing(translateX, {
        toValue: -contentWidth,
        duration: Math.max(450, remaining * 38),
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web',
      });
      running.current = animation;
      animation.start(({ finished }) => {
        if (!finished || cancelled) return;
        currentX.current = 0;
        translateX.setValue(0);
        animate();
      });
    };

    animate();

    return () => {
      cancelled = true;
      running.current?.stop();
      translateX.stopAnimation((value) => {
        currentX.current = value;
      });
    };
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
        minHeight: 44,
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
        accessibilityLabel={paused ? 'Resume announcement' : 'Pause announcement'}
        onHoverIn={() => setPaused(true)}
        onHoverOut={() => setPaused(false)}
        onPressIn={() => setPaused(true)}
        onPressOut={() => setPaused(false)}
        style={{ flex: 1, minHeight: 44, justifyContent: 'center', overflow: 'hidden' }}
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
          height: 44,
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
