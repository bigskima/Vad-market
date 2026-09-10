import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { useVadTheme } from '@/providers/theme-provider';
import { VadText } from './vad-text';

type Props = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
};

export function VadInput({
  label,
  error,
  hint,
  multiline,
  style,
  onFocus,
  onBlur,
  accessibilityLabel,
  accessibilityHint,
  editable = true,
  leading,
  trailing,
  ...props
}: Props) {
  const theme = useVadTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.brandPrimary
      : theme.colors.border;

  return (
    <View style={{ gap: theme.spacing.xs }}>
      {label ? (
        <VadText
          variant="label"
          tone={error ? 'danger' : focused ? 'primary' : 'secondary'}
        >
          {label}
        </VadText>
      ) : null}

      <View
        style={{
          minHeight: multiline ? 112 : 52,
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          borderWidth: focused ? 1.5 : 1,
          borderColor,
          borderRadius: theme.radius.lg,
          backgroundColor: focused ? theme.colors.surfaceRaised : theme.colors.surface,
          paddingHorizontal: theme.spacing.md,
          opacity: editable ? 1 : 0.55,
        }}
      >
        {leading ? (
          <View style={{ minHeight: 50, justifyContent: 'center', paddingRight: theme.spacing.sm }}>
            {leading}
          </View>
        ) : null}

        <TextInput
          {...props}
          editable={editable}
          multiline={multiline}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={accessibilityHint ?? error ?? hint}
          placeholderTextColor={theme.colors.textTertiary}
          selectionColor={theme.colors.brandPrimary}
          cursorColor={theme.colors.brandPrimary}
          style={[
            {
              flex: 1,
              minHeight: multiline ? 108 : 50,
              color: theme.colors.textPrimary,
              paddingVertical: multiline ? theme.spacing.md : 0,
              textAlignVertical: multiline ? 'top' : 'center',
              fontSize: 16,
              lineHeight: 22,
              backgroundColor: 'transparent',
            },
            style,
            // Preserve theme-aware plain text even when a screen passes its own text style.
            { color: theme.colors.textPrimary },
          ]}
        />

        {trailing ? (
          <View style={{ minHeight: 50, justifyContent: 'center', paddingLeft: theme.spacing.sm }}>
            {trailing}
          </View>
        ) : null}
      </View>

      {error ? (
        <VadText variant="caption" tone="danger">{error}</VadText>
      ) : hint ? (
        <VadText variant="caption" tone="tertiary">{hint}</VadText>
      ) : null}
    </View>
  );
}
