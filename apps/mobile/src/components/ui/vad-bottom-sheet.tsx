import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VadIcon } from './vad-icon';
import { VadText } from './vad-text';
import { useVadTheme } from '@/providers/theme-provider';

export function VadBottomSheet({
  visible,
  title,
  onClose,
  children,
  dismissible = true,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  dismissible?: boolean;
}) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const dialog = width >= 768;
  const compact = width < 380;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={dialog ? 'fade' : 'slide'}
      statusBarTranslucent
      onRequestClose={() => {
        if (dismissible) onClose();
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flex: 1,
            justifyContent: dialog ? 'center' : 'flex-end',
            alignItems: dialog ? 'center' : 'stretch',
            backgroundColor: theme.colors.overlay,
            padding: dialog ? theme.spacing.xl : 0,
          }}
        >
          {dismissible ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close dialog"
              onPress={onClose}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View pointerEvents="none" style={StyleSheet.absoluteFill} />
          )}

          <SafeAreaView
            edges={dialog ? [] : ['bottom']}
            style={[
              dialog ? theme.shadows.floating : theme.shadows.card,
              {
                width: '100%',
                maxWidth: dialog ? 680 : undefined,
                maxHeight: dialog ? '84%' : '90%',
                backgroundColor: theme.colors.surface,
                borderRadius: dialog ? theme.radius.xxl : 0,
                borderTopLeftRadius: theme.radius.xxl,
                borderTopRightRadius: theme.radius.xxl,
                borderWidth: 1,
                borderColor: theme.colors.border,
                overflow: 'hidden',
              },
            ]}
          >
            {!dialog ? (
              <View style={{ alignItems: 'center', paddingTop: theme.spacing.xs }}>
                <View
                  style={{
                    width: 44,
                    height: 4,
                    borderRadius: theme.radius.pill,
                    backgroundColor: theme.colors.borderStrong,
                  }}
                />
              </View>
            ) : null}

            <View
              style={{
                minHeight: 64,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: compact ? theme.spacing.md : theme.spacing.lg,
                paddingVertical: theme.spacing.sm,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
              }}
            >
              <VadText variant="heading" style={{ flex: 1 }} numberOfLines={2}>
                {title}
              </VadText>

              {dismissible ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  onPress={onClose}
                  hitSlop={4}
                  style={({ pressed }) => ({
                    width: 44,
                    height: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 22,
                    backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surfaceRaised,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  })}
                >
                  <VadIcon name="close" size={17} tone="secondary" />
                </Pressable>
              ) : null}
            </View>

            <ScrollView
              style={{ flexShrink: 1 }}
              contentContainerStyle={{
                paddingHorizontal: compact ? theme.spacing.md : theme.spacing.lg,
                paddingTop: theme.spacing.md,
                paddingBottom: theme.spacing.lg,
              }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              {children}
            </ScrollView>
          </SafeAreaView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
