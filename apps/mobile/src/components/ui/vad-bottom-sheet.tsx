import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useVadTheme } from '@/providers/theme-provider';
import { VadText } from './vad-text';

export function VadBottomSheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const dialog = width >= 760;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={dialog ? 'fade' : 'slide'}
      onRequestClose={onClose}
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
            padding: dialog ? theme.spacing.lg : 0,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close dialog"
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />

          <SafeAreaView
            edges={dialog ? [] : ['bottom']}
            style={{
              width: '100%',
              maxWidth: dialog ? 680 : undefined,
              maxHeight: dialog ? '82%' : '80%',
              backgroundColor: theme.colors.surface,
              borderRadius: dialog ? theme.radius.xl : 0,
              borderTopLeftRadius: theme.radius.xl,
              borderTopRightRadius: theme.radius.xl,
              borderWidth: 1,
              borderColor: theme.colors.border,
              overflow: 'hidden',
            }}
          >
            {!dialog ? (
              <View
                style={{
                  alignItems: 'center',
                  paddingTop: theme.spacing.xs,
                }}
              >
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
                minHeight: 58,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: theme.spacing.lg,
                paddingTop: theme.spacing.md,
                paddingBottom: theme.spacing.sm,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
              }}
            >
              <VadText variant="heading" style={{ flex: 1 }}>
                {title}
              </VadText>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onClose}
                hitSlop={8}
                style={({ pressed }) => ({
                  minHeight: 36,
                  justifyContent: 'center',
                  paddingHorizontal: theme.spacing.sm,
                  opacity: pressed ? 0.55 : 1,
                })}
              >
                <VadText variant="caption" tone="brand">Close</VadText>
              </Pressable>
            </View>

            <View
              style={{
                flexShrink: 1,
                paddingHorizontal: theme.spacing.lg,
                paddingTop: theme.spacing.md,
                paddingBottom: theme.spacing.lg,
              }}
            >
              {children}
            </View>
          </SafeAreaView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
