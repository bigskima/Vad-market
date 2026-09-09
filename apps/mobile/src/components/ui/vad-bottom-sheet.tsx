import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useVadTheme } from '@/providers/theme-provider';
import { VadText } from './vad-text';

export function VadBottomSheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const theme = useVadTheme();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)' }}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, borderWidth: 1, borderColor: theme.colors.border, maxHeight: '78%' }}>
        <View style={{ alignItems: 'center', paddingTop: theme.spacing.xs }}><View style={{ width: 44, height: 4, borderRadius: 999, backgroundColor: theme.colors.borderStrong }} /></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: theme.spacing.lg, paddingBottom: theme.spacing.sm }}><VadText variant="heading" style={{ flex: 1 }}>{title}</VadText><Pressable onPress={onClose}><VadText variant="label" tone="brand">Close</VadText></Pressable></View>
        <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg }}>{children}</View>
      </SafeAreaView>
    </View>
  </Modal>;
}
