import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
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
  const { width, height } = useWindowDimensions();
  const dialog = width >= 768;
  const compact = width < 380;
  const [dragOffset] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (visible) dragOffset.setValue(0);
  }, [dragOffset, visible]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) =>
      dismissible && !dialog && gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_event, gesture) => {
      dragOffset.setValue(Math.max(0, gesture.dy));
    },
    onPanResponderRelease: (_event, gesture) => {
      if (dismissible && (gesture.dy > 112 || gesture.vy > 0.85)) {
        Animated.timing(dragOffset, {
          toValue: Math.max(height, 520),
          duration: theme.motion.standard,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) onClose();
        });
      } else {
        Animated.spring(dragOffset, {
          toValue: 0,
          stiffness: 240,
          damping: 25,
          mass: 0.8,
          useNativeDriver: true,
        }).start();
      }
    },
    onPanResponderTerminate: () => {
      Animated.spring(dragOffset, {
        toValue: 0,
        stiffness: 240,
        damping: 25,
        mass: 0.8,
        useNativeDriver: true,
      }).start();
    },
  }), [dialog, dismissible, dragOffset, height, onClose, theme.motion.standard]);

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

          <Animated.View
            style={{
              width: '100%',
              maxWidth: dialog ? 680 : undefined,
              // Bound the sheet to the modal viewport so long content scrolls
              // inside it instead of expanding beyond the visible screen.
              height: '100%',
              maxHeight: dialog ? '84%' : '90%',
              flexShrink: 1,
              transform: [{ translateY: dialog ? 0 : dragOffset }],
            }}
          >
          <SafeAreaView
            edges={dialog ? [] : ['bottom']}
            style={[
              dialog ? theme.shadows.floating : theme.shadows.card,
              {
                width: '100%',
                maxWidth: dialog ? 680 : undefined,
                flex: 1,
                minHeight: 0,
                maxHeight: '100%',
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
              <View
                {...panResponder.panHandlers}
                accessible
                accessibilityRole="button"
                accessibilityLabel="Drag down to dismiss"
                accessibilityHint="Swipe down to close this sheet"
                style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
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
              style={{ flex: 1, minHeight: 0 }}
              contentContainerStyle={{
                flexGrow: 1,
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
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
