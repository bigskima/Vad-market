import { useEffect, useRef } from 'react';
import { Animated, type ViewProps } from 'react-native';

import { useVadTheme } from '@/providers/theme-provider';

export function VadSkeleton({
  width = '100%',
  height = 16,
  radius,
  style,
  ...props
}: ViewProps & { width?: number | `${number}%`; height?: number; radius?: number }) {
  const theme = useVadTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: theme.motion.slow * 2,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: theme.motion.slow * 2,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, theme.motion.slow]);

  return (
    <Animated.View
      {...props}
      style={[
        {
          width,
          height,
          borderRadius: radius ?? theme.radius.md,
          backgroundColor: theme.colors.surfaceMuted,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.48, 0.92] }),
        },
        style,
      ]}
    />
  );
}
