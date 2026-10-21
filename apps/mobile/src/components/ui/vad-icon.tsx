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
  | 'bell'
  | 'close'
  | 'eye'
  | 'eyeOff'
  | 'bookmark'
  | 'share'
  | 'reply'
  | 'operations'
  | 'back'
  | 'chevronRight'
  | 'community'
  | 'activity'
  | 'arrowUp'
  | 'arrowDown'
  | 'camera'
  | 'shieldCheck'
  | 'creditCard'
  | 'lock'
  | 'shield'
  | 'device'
  | 'palette'
  | 'globe'
  | 'lifeBuoy'
  | 'fileText'
  | 'info'
  | 'filter'
  | 'clock'
  | 'logOut';

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

  if (name === 'plus' || name === 'close') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', transform: name === 'close' ? [{ rotate: '45deg' }] : undefined }}>
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

  if (name === 'bell') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center' }}>
        <View style={{ marginTop: size * 0.12, width: size * 0.62, height: size * 0.58, borderWidth: line, borderColor: ink, borderTopLeftRadius: size, borderTopRightRadius: size, borderBottomWidth: line, borderBottomLeftRadius: size * 0.16, borderBottomRightRadius: size * 0.16 }} />
        <View style={{ marginTop: size * 0.06, width: size * 0.18, height: line, borderRadius: line, backgroundColor: ink }} />
      </View>
    );
  }

  if (name === 'eye' || name === 'eyeOff') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size * 0.84, height: size * 0.52, borderWidth: line, borderColor: ink, borderRadius: size * 0.5, transform: [{ rotate: '-2deg' }], alignItems: 'center', justifyContent: 'center' }}>
          {name === 'eye' ? (
            <View style={{ width: size * 0.22, height: size * 0.22, borderWidth: line, borderColor: ink, borderRadius: size }} />
          ) : (
            <View style={{ width: size * 0.95, height: line * 1.2, backgroundColor: ink, transform: [{ rotate: '-42deg' }] }} />
          )}
        </View>
      </View>
    );
  }

  if (name === 'bookmark') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center' }}>
        <View style={{ width: size * 0.56, height: size * 0.76, borderWidth: line, borderColor: ink, borderRadius: size * 0.08, borderBottomLeftRadius: size * 0.18, borderBottomRightRadius: size * 0.18, marginTop: size * 0.08 }} />
      </View>
    );
  }

  if (name === 'share') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size * 0.62, height: size * 0.5, borderWidth: line, borderColor: ink, borderRadius: size * 0.12, marginTop: size * 0.18 }} />
        <View style={{ position: 'absolute', width: line, height: size * 0.48, backgroundColor: ink, top: size * 0.08 }} />
        <View style={{ position: 'absolute', width: size * 0.26, height: size * 0.26, borderLeftWidth: line, borderTopWidth: line, borderColor: ink, top: size * 0.08, transform: [{ rotate: '45deg' }] }} />
      </View>
    );
  }

  if (name === 'reply') {
    return (
      <View style={{ width: size, height: size, justifyContent: 'center' }}>
        <View style={{ width: size * 0.62, height: size * 0.42, borderTopWidth: line, borderLeftWidth: line, borderColor: ink, borderTopLeftRadius: size * 0.3, alignSelf: 'flex-end', marginTop: size * 0.12 }} />
        <View style={{ position: 'absolute', left: size * 0.08, top: size * 0.26, width: size * 0.28, height: size * 0.28, borderLeftWidth: line, borderBottomWidth: line, borderColor: ink, transform: [{ rotate: '45deg' }] }} />
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

  if (name === 'portfolio') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size * 0.78, height: size * 0.78, borderRadius: size, borderWidth: line, borderColor: ink }} />
        <View style={{ position: 'absolute', width: line, height: size * 0.39, backgroundColor: ink, top: size * 0.11, left: size * 0.49 }} />
        <View style={{ position: 'absolute', width: size * 0.38, height: line, backgroundColor: ink, top: size * 0.49, right: size * 0.11 }} />
        <View style={{ position: 'absolute', width: size * 0.31, height: size * 0.31, top: size * 0.11, right: size * 0.11, borderTopWidth: line, borderRightWidth: line, borderColor: ink, borderTopRightRadius: size * 0.3 }} />
      </View>
    );
  }

  if (name === 'camera') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size * 0.84, height: size * 0.62, borderWidth: line, borderColor: ink, borderRadius: size * 0.14, marginTop: size * 0.14 }} />
        <View style={{ position: 'absolute', top: size * 0.1, left: size * 0.24, width: size * 0.25, height: size * 0.13, borderTopLeftRadius: size * 0.05, borderTopRightRadius: size * 0.05, backgroundColor: ink }} />
        <View style={{ position: 'absolute', width: size * 0.28, height: size * 0.28, borderWidth: line, borderColor: ink, borderRadius: size, top: size * 0.33 }} />
      </View>
    );
  }

  if (name === 'shield' || name === 'shieldCheck') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size * 0.7, height: size * 0.8, borderWidth: line, borderColor: ink, borderTopLeftRadius: size * 0.18, borderTopRightRadius: size * 0.18, borderBottomLeftRadius: size * 0.35, borderBottomRightRadius: size * 0.35, transform: [{ rotate: '0deg' }] }} />
        {name === 'shieldCheck' ? <View style={{ position: 'absolute', width: size * 0.25, height: size * 0.14, borderLeftWidth: line * 1.3, borderBottomWidth: line * 1.3, borderColor: ink, transform: [{ rotate: '-45deg' }], top: size * 0.39 }} /> : null}
      </View>
    );
  }

  if (name === 'creditCard') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size * 0.86, height: size * 0.62, borderWidth: line, borderColor: ink, borderRadius: size * 0.1 }} />
        <View style={{ position: 'absolute', left: size * 0.1, right: size * 0.1, top: size * 0.42, height: line, backgroundColor: ink }} />
        <View style={{ position: 'absolute', width: size * 0.2, height: line, left: size * 0.16, bottom: size * 0.24, backgroundColor: ink }} />
      </View>
    );
  }

  if (name === 'lock') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', top: size * 0.08, width: size * 0.44, height: size * 0.46, borderWidth: line, borderColor: ink, borderTopLeftRadius: size * 0.25, borderTopRightRadius: size * 0.25, borderBottomWidth: 0 }} />
        <View style={{ position: 'absolute', bottom: size * 0.08, width: size * 0.72, height: size * 0.5, borderWidth: line, borderColor: ink, borderRadius: size * 0.12, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: line * 1.4, height: line * 1.4, borderRadius: size, backgroundColor: ink }} />
          <View style={{ width: line, height: size * 0.12, backgroundColor: ink, marginTop: line * 0.3 }} />
        </View>
      </View>
    );
  }

  if (name === 'device') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size * 0.82, height: size * 0.6, borderWidth: line, borderColor: ink, borderRadius: size * 0.08 }} />
        <View style={{ position: 'absolute', bottom: size * 0.1, width: size * 0.28, height: line, backgroundColor: ink }} />
        <View style={{ position: 'absolute', bottom: size * 0.1, width: size * 0.5, height: line, backgroundColor: ink, transform: [{ translateY: size * 0.06 }] }} />
      </View>
    );
  }

  if (name === 'palette') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size * 0.82, height: size * 0.82, borderWidth: line, borderColor: ink, borderRadius: size * 0.45, transform: [{ rotate: '-15deg' }] }} />
        <View style={{ position: 'absolute', width: size * 0.14, height: size * 0.14, borderRadius: size, backgroundColor: ink, left: size * 0.25, top: size * 0.25 }} />
        <View style={{ position: 'absolute', width: size * 0.13, height: size * 0.13, borderRadius: size, backgroundColor: ink, right: size * 0.24, top: size * 0.31 }} />
        <View style={{ position: 'absolute', width: size * 0.13, height: size * 0.13, borderRadius: size, backgroundColor: ink, left: size * 0.34, bottom: size * 0.21 }} />
      </View>
    );
  }

  if (name === 'globe') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size * 0.86, height: size * 0.86, borderWidth: line, borderColor: ink, borderRadius: size }} />
        <View style={{ position: 'absolute', width: size * 0.4, height: size * 0.86, borderWidth: line, borderColor: ink, borderRadius: size }} />
        <View style={{ position: 'absolute', left: size * 0.1, right: size * 0.1, height: line, backgroundColor: ink }} />
      </View>
    );
  }

  if (name === 'lifeBuoy') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size * 0.84, height: size * 0.84, borderWidth: line * 2.2, borderColor: ink, borderRadius: size }} />
        <View style={{ position: 'absolute', width: size * 0.32, height: size * 0.32, borderWidth: line, borderColor: ink, borderRadius: size }} />
        <View style={{ position: 'absolute', width: size * 0.18, height: size * 0.18, top: size * 0.08, left: size * 0.08, borderBottomWidth: line, borderRightWidth: line, borderColor: ink }} />
        <View style={{ position: 'absolute', width: size * 0.18, height: size * 0.18, top: size * 0.08, right: size * 0.08, borderBottomWidth: line, borderLeftWidth: line, borderColor: ink }} />
        <View style={{ position: 'absolute', width: size * 0.18, height: size * 0.18, bottom: size * 0.08, left: size * 0.08, borderTopWidth: line, borderRightWidth: line, borderColor: ink }} />
        <View style={{ position: 'absolute', width: size * 0.18, height: size * 0.18, bottom: size * 0.08, right: size * 0.08, borderTopWidth: line, borderLeftWidth: line, borderColor: ink }} />
      </View>
    );
  }

  if (name === 'fileText') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size * 0.65, height: size * 0.82, borderWidth: line, borderColor: ink, borderRadius: size * 0.06 }} />
        {[0.39, 0.53, 0.67].map((top) => <View key={top} style={{ position: 'absolute', left: size * 0.27, width: size * 0.45, height: line, backgroundColor: ink, top: size * top }} />)}
      </View>
    );
  }

  if (name === 'info') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size * 0.86, height: size * 0.86, borderWidth: line, borderColor: ink, borderRadius: size }} />
        <View style={{ position: 'absolute', width: line * 1.2, height: line * 1.2, borderRadius: size, backgroundColor: ink, top: size * 0.27 }} />
        <View style={{ position: 'absolute', width: line * 1.2, height: size * 0.28, borderRadius: line, backgroundColor: ink, top: size * 0.43 }} />
      </View>
    );
  }

  if (name === 'clock') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size * 0.84, height: size * 0.84, borderRadius: size, borderWidth: line, borderColor: ink }} />
        <View style={{ position: 'absolute', width: line, height: size * 0.28, top: size * 0.21, left: size * 0.48, backgroundColor: ink, borderRadius: line }} />
        <View style={{ position: 'absolute', width: size * 0.25, height: line, top: size * 0.47, left: size * 0.48, backgroundColor: ink, borderRadius: line }} />
      </View>
    );
  }

  if (name === 'filter') {
    return (
      <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ width: size * 0.84, height: line, backgroundColor: ink, borderRadius: line }} />
        <View style={{ width: size * 0.58, height: line, backgroundColor: ink, borderRadius: line, marginTop: size * 0.2 }} />
        <View style={{ width: size * 0.28, height: line, backgroundColor: ink, borderRadius: line, marginTop: size * 0.2 }} />
      </View>
    );
  }

  if (name === 'logOut') {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', left: size * 0.08, top: size * 0.12, width: size * 0.47, height: size * 0.76, borderWidth: line, borderColor: ink, borderRightWidth: 0, borderTopLeftRadius: size * 0.1, borderBottomLeftRadius: size * 0.1 }} />
        <View style={{ position: 'absolute', left: size * 0.25, top: size * 0.45, width: size * 0.62, height: line, backgroundColor: ink, borderRadius: line }} />
        <View style={{ position: 'absolute', right: size * 0.1, top: size * 0.3, width: size * 0.28, height: size * 0.28, borderTopWidth: line, borderRightWidth: line, borderColor: ink, transform: [{ rotate: '45deg' }] }} />
      </View>
    );
  }

  const bars = [0.42, 0.72, 0.94];
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
          }}
        />
      ))}
    </View>
  );
}
