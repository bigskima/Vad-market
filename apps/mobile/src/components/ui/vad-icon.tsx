import { View } from 'react-native';

import { useVadTheme } from '@/providers/theme-provider';

export type VadIconName =
  | 'home'
  | 'markets'
  | 'wallet'
  | 'portfolio'
  | 'account'
  | 'plus'
  | 'search'
  | 'operations'
  | 'back'
  | 'chevronRight'
  | 'community'
  | 'activity'
  | 'arrowUp'
  | 'arrowDown';

type Tone = 'primary' | 'secondary' | 'tertiary' | 'brand' | 'yes' | 'no' | 'inverse';

export function VadIcon({
  name,
  size = 20,
  tone = 'primary',
  color,
}: {
  name: VadIconName;
  size?: number;
  tone?: Tone;
  color?: string;
}) {
  const theme = useVadTheme();
  const tones = {
    primary: theme.colors.textPrimary,
    secondary: theme.colors.textSecondary,
    tertiary: theme.colors.textTertiary,
    brand: theme.colors.brandPrimary,
    yes: theme.colors.yes,
    no: theme.colors.no,
    inverse: theme.colors.textInverse,
  } as const;
  const ink = color ?? tones[tone];
  const line = Math.max(1.5, size * 0.085);

  if (name === 'plus') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', width: size * 0.56, height: line, borderRadius: line, backgroundColor: ink }} />
        <View style={{ position: 'absolute', width: line, height: size * 0.56, borderRadius: line, backgroundColor: ink }} />
      </View>
    );
  }

  if (name === 'search') {
    return (
      <View style={{ width: size, height: size }}>
        <View style={{ position: 'absolute', width: size * 0.58, height: size * 0.58, borderWidth: line, borderColor: ink, borderRadius: size, left: size * 0.08, top: size * 0.08 }} />
        <View style={{ position: 'absolute', width: size * 0.34, height: line, borderRadius: line, backgroundColor: ink, right: size * 0.03, bottom: size * 0.18, transform: [{ rotate: '45deg' }] }} />
      </View>
    );
  }

  if (name === 'back' || name === 'chevronRight') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            width: size * 0.38,
            height: size * 0.38,
            borderLeftWidth: line,
            borderBottomWidth: line,
            borderColor: ink,
            transform: [{ rotate: name === 'back' ? '45deg' : '225deg' }],
          }}
        />
      </View>
    );
  }

  if (name === 'arrowUp' || name === 'arrowDown') {
    const up = name === 'arrowUp';
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: line, height: size * 0.58, borderRadius: line, backgroundColor: ink }} />
        <View
          style={{
            position: 'absolute',
            width: size * 0.34,
            height: size * 0.34,
            borderLeftWidth: line,
            borderTopWidth: line,
            borderColor: ink,
            top: up ? size * 0.16 : undefined,
            bottom: up ? undefined : size * 0.16,
            transform: [{ rotate: up ? '45deg' : '225deg' }],
          }}
        />
      </View>
    );
  }

  if (name === 'home') {
    return (
      <View style={{ width: size, height: size }}>
        <View style={{ position: 'absolute', width: size * 0.5, height: size * 0.5, borderLeftWidth: line, borderTopWidth: line, borderColor: ink, left: size * 0.25, top: size * 0.12, transform: [{ rotate: '45deg' }], borderTopLeftRadius: size * 0.06 }} />
        <View style={{ position: 'absolute', width: size * 0.66, height: size * 0.48, borderWidth: line, borderTopWidth: 0, borderColor: ink, left: size * 0.17, bottom: size * 0.08, borderBottomLeftRadius: size * 0.1, borderBottomRightRadius: size * 0.1 }} />
      </View>
    );
  }

  if (name === 'wallet') {
    return (
      <View style={{ width: size, height: size, justifyContent: 'center' }}>
        <View style={{ width: size * 0.88, height: size * 0.62, borderWidth: line, borderColor: ink, borderRadius: size * 0.18, alignSelf: 'center' }} />
        <View style={{ position: 'absolute', right: size * 0.04, width: size * 0.34, height: size * 0.28, borderWidth: line, borderColor: ink, borderRadius: size * 0.1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: line * 1.2, height: line * 1.2, borderRadius: line, backgroundColor: ink }} />
        </View>
      </View>
    );
  }

  if (name === 'account') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center' }}>
        <View style={{ width: size * 0.34, height: size * 0.34, borderRadius: size, borderWidth: line, borderColor: ink, marginTop: size * 0.05 }} />
        <View style={{ position: 'absolute', bottom: size * 0.07, width: size * 0.72, height: size * 0.38, borderWidth: line, borderColor: ink, borderRadius: size, borderBottomLeftRadius: size * 0.16, borderBottomRightRadius: size * 0.16 }} />
      </View>
    );
  }

  if (name === 'operations') {
    const square = size * 0.28;
    return (
      <View style={{ width: size, height: size, flexDirection: 'row', flexWrap: 'wrap', gap: size * 0.12, alignItems: 'center', justifyContent: 'center' }}>
        {[0, 1, 2, 3].map((item) => (
          <View key={item} style={{ width: square, height: square, borderWidth: line, borderColor: ink, borderRadius: size * 0.07 }} />
        ))}
      </View>
    );
  }

  if (name === 'community') {
    return (
      <View style={{ width: size, height: size }}>
        <View style={{ position: 'absolute', left: size * 0.16, top: size * 0.12, width: size * 0.3, height: size * 0.3, borderRadius: size, borderWidth: line, borderColor: ink }} />
        <View style={{ position: 'absolute', right: size * 0.12, top: size * 0.24, width: size * 0.24, height: size * 0.24, borderRadius: size, borderWidth: line, borderColor: ink }} />
        <View style={{ position: 'absolute', left: size * 0.08, bottom: size * 0.08, width: size * 0.5, height: size * 0.32, borderWidth: line, borderColor: ink, borderRadius: size }} />
        <View style={{ position: 'absolute', right: size * 0.04, bottom: size * 0.1, width: size * 0.36, height: size * 0.26, borderWidth: line, borderColor: ink, borderRadius: size }} />
      </View>
    );
  }

  const bars = name === 'portfolio' ? [0.52, 0.82, 0.66] : [0.42, 0.72, 0.94];
  return (
    <View style={{ width: size, height: size, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: size * 0.12, paddingBottom: size * 0.08 }}>
      {bars.map((height, index) => (
        <View
          key={index}
          style={{
            width: size * 0.18,
            height: size * height,
            borderRadius: size * 0.09,
            backgroundColor: ink,
            opacity: name === 'portfolio' && index === 1 ? 0.7 : 1,
          }}
        />
      ))}
    </View>
  );
}
