import { Image, View } from 'react-native';

import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { profileMediaUrl } from '@/services/profile-api';

export function ProfileAvatar({
  path,
  name,
  size = 42,
  fallback = 'initial',
}: {
  path?: string | null;
  name?: string | null;
  size?: number;
  fallback?: 'initial' | 'account';
}) {
  const theme = useVadTheme();
  const uri = profileMediaUrl(path);

  if (uri) {
    return (
      <Image
        source={{ uri }}
        resizeMode="cover"
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.colors.surfaceMuted,
        }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.colors.brandSoft,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {fallback === 'account' ? (
        <VadIcon name="account" size={Math.max(16, size * 0.44)} tone="brand" />
      ) : (
        <VadText variant="bodyStrong" tone="brand">
          {(name ?? 'V').slice(0, 1).toUpperCase()}
        </VadText>
      )}
    </View>
  );
}
