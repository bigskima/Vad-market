import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useVadTheme } from '@/providers/theme-provider';
import { VadIcon } from './vad-icon';
import { VadText } from './vad-text';

export type VadMediaItem = {
  uri: string;
  type?: 'image' | 'video';
  alt?: string;
};

export function VadMediaContainer({
  items,
  aspectRatio = 16 / 9,
}: {
  items: VadMediaItem[];
  aspectRatio?: number;
}) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState<VadMediaItem | null>(null);
  const visible = useMemo(() => items.filter((item) => Boolean(item.uri)).slice(0, 4), [items]);

  if (!visible.length) return null;

  const columns = visible.length === 1 ? 1 : 2;
  const gap = 4;

  return (
    <>
      <View
        accessibilityLabel="Post media"
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap,
          overflow: 'hidden',
          borderRadius: theme.radius.xl,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceMuted,
        }}
      >
        {visible.map((item, index) => {
          const multiHeight = visible.length > 2 ? 154 : 190;
          const itemStyle = columns === 1
            ? { width: '100%' as const, aspectRatio }
            : { width: '49.4%' as const, height: multiHeight };

          return (
            <MediaTile
              key={`${item.uri}-${index}`}
              item={item}
              style={itemStyle}
              onPress={() => setSelected(item)}
              overlay={index === 3 && items.length > 4 ? `+${items.length - 4}` : undefined}
            />
          );
        })}
      </View>

      <Modal
        visible={Boolean(selected)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSelected(null)}
      >
        <SafeAreaView
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.96)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close media preview"
            onPress={() => setSelected(null)}
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              zIndex: 3,
              width: 48,
              height: 48,
              borderRadius: 24,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.14)',
            }}
          >
            <VadIcon name="close" size={19} color="#FFFFFF" />
          </Pressable>

          {selected?.type === 'video' ? (
            <View style={{ width: Math.min(width - 40, 760), aspectRatio, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' }}>
                <VadIcon name="activity" size={27} color="#FFFFFF" />
              </View>
              <VadText variant="bodyStrong" tone="inverse">Video attachment</VadText>
            </View>
          ) : selected ? (
            <Image
              source={{ uri: selected.uri }}
              accessibilityLabel={selected.alt ?? 'Expanded post image'}
              resizeMode="contain"
              style={{ width: '100%', height: '88%' }}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </>
  );
}

function MediaTile({
  item,
  onPress,
  overlay,
  style,
}: {
  item: VadMediaItem;
  onPress: () => void;
  overlay?: string;
  style: { width: '100%' | '49.4%'; aspectRatio?: number; height?: number };
}) {
  const theme = useVadTheme();
  const [loading, setLoading] = useState(item.type !== 'video');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.alt ?? (item.type === 'video' ? 'Open video attachment' : 'Open image attachment')}
      onPress={onPress}
      style={({ pressed }) => [
        style,
        {
          minHeight: 120,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.surfaceMuted,
          opacity: pressed ? 0.86 : 1,
        },
      ]}
    >
      {item.type === 'video' ? (
        <View style={{ alignItems: 'center', justifyContent: 'center', gap: theme.spacing.xs }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceRaised }}>
            <VadIcon name="activity" size={22} tone="brand" />
          </View>
          <VadText variant="caption" tone="secondary">Video</VadText>
        </View>
      ) : (
        <>
          {loading ? (
            <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={theme.colors.brandPrimary} />
            </View>
          ) : null}
          <Image
            source={{ uri: item.uri }}
            accessibilityLabel={item.alt ?? 'Post image'}
            resizeMode="cover"
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            style={{ width: '100%', height: '100%' }}
          />
        </>
      )}

      {overlay ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.58)',
          }}
        >
          <VadText variant="title" tone="inverse">{overlay}</VadText>
        </View>
      ) : null}
    </Pressable>
  );
}
