import { Image, type ImageStyle, type StyleProp } from 'react-native';

export function VadLogo({ size = 34, style }: { size?: number; style?: StyleProp<ImageStyle> }) {
  return <Image source={require('../../../assets/images/vad-logo-square.png')} resizeMode="contain" style={[{ width: size, height: size, borderRadius: Math.max(8, size * 0.22) }, style]} />;
}
