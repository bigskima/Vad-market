import { Image, View } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { profileMediaUrl } from '@/services/profile-api';

export function ProfileAvatar({ path, name, size = 42 }: { path?: string | null; name?: string | null; size?: number }) {
  const theme = useVadTheme();
  const uri = profileMediaUrl(path);
  if (uri) return <Image source={{ uri }} resizeMode="cover" style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.surfaceMuted }} />;
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}><VadText variant="bodyStrong" tone="brand">{(name ?? 'V').slice(0, 1).toUpperCase()}</VadText></View>;
}
