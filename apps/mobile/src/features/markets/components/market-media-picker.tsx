import * as ImagePicker from 'expo-image-picker';
import { Image, Platform, Pressable, View } from 'react-native';

import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import {
  MARKET_MEDIA_MAX_BYTES,
  type MarketMediaSelection,
} from '@/services/market-media-api';

export function MarketMediaPicker({
  value,
  onChange,
  disabled = false,
  label = 'Market image',
}: {
  value: MarketMediaSelection | null;
  onChange: (next: MarketMediaSelection | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  const theme = useVadTheme();

  async function chooseImage() {
    if (disabled) return;

    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.82,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize != null && asset.fileSize > MARKET_MEDIA_MAX_BYTES) return;

    onChange({
      uri: asset.uri,
      mimeType: asset.mimeType ?? null,
      fileName: asset.fileName ?? null,
      fileSize: asset.fileSize ?? null,
      width: asset.width,
      height: asset.height,
    });
  }

  return (
    <View style={{ gap: 7 }}>
      <View style={{ gap: 1 }}>
        <VadText variant="caption" tone="tertiary">{label.toUpperCase()} · OPTIONAL</VadText>
        <VadText variant="caption" tone="secondary">
          Add a clear visual. VAD keeps it compact beside the market question instead of turning the feed into an image gallery.
        </VadText>
      </View>

      {value ? (
        <View
          style={{
            minHeight: 92,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.surfaceMuted,
            padding: theme.spacing.sm,
          }}
        >
          <Image
            source={{ uri: value.uri }}
            resizeMode="cover"
            style={{ width: 104, height: 68, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface }}
          />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <VadText variant="bodyStrong" numberOfLines={1}>Image ready</VadText>
            <VadText variant="caption" tone="secondary" numberOfLines={2}>
              {value.fileName || `${value.width} × ${value.height}`} · {formatBytes(value.fileSize)}
            </VadText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <MediaAction label="Replace" icon="markets" disabled={disabled} onPress={() => void chooseImage()} />
              <MediaAction label="Remove" icon="close" disabled={disabled} onPress={() => onChange(null)} />
            </View>
          </View>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose an optional market image"
          disabled={disabled}
          onPress={() => void chooseImage()}
          style={({ pressed }) => ({
            minHeight: 82,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: pressed ? theme.colors.brandPrimary : theme.colors.borderStrong,
            borderRadius: theme.radius.lg,
            backgroundColor: pressed ? theme.colors.brandSoft : theme.colors.surfaceMuted,
            padding: theme.spacing.sm,
            opacity: disabled ? 0.5 : 1,
          })}
        >
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 15,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.brandSoft,
            }}
          >
            <VadIcon name="plus" size={20} tone="brand" />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <VadText variant="bodyStrong">Add market image</VadText>
            <VadText variant="caption" tone="secondary">JPG, PNG or WebP · up to 5 MB · 16:9 crop</VadText>
          </View>
          <VadIcon name="chevronRight" size={16} tone="tertiary" />
        </Pressable>
      )}
    </View>
  );
}

function MediaAction({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: 'markets' | 'close';
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 34,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 9,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.pill,
        backgroundColor: pressed ? theme.colors.surface : theme.colors.surfaceRaised,
        opacity: disabled ? 0.5 : 1,
      })}
    >
      <VadIcon name={icon} size={13} tone="secondary" />
      <VadText variant="caption" tone="secondary">{label}</VadText>
    </Pressable>
  );
}

function formatBytes(value: number | null) {
  if (value == null || !Number.isFinite(value)) return 'size checked on upload';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
