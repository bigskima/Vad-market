import { useState } from 'react';
import {
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputFocusEventData,
  type TextInputProps,
} from 'react-native';

import { useVadTheme } from '@/providers/theme-provider';
import { VadText } from './vad-text';

type Props = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
};

export function VadInput({
  label,
  error,
  hint,
  multiline,
  style,
  onFocus,
  onBlur,
  editable = true,
  ...props
}: Props) {
  const theme = useVadTheme();
  const [focused, setFocused] = useState(false);

  function handleFocus(
    event: NativeSyntheticEvent<TextInputFocusEventData>,
  ) {
    setFocused(true);
    onFocus?.(event);
  }

  function handleBlur(
    event: NativeSyntheticEvent<TextInputFocusEventData>,
  ) {
    setFocused(false);
    onBlur?.(event);
  }

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
          tone={focused ? 'primary' : 'secondary'}
        >
          {label}
        </VadText>
      ) : null}

      <TextInput
        {...props}
        editable={editable}
        multiline={multiline}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholderTextColor={theme.colors.textTertiary}
        selectionColor={theme.colors.brandPrimary}
        cursorColor={theme.colors.brandPrimary}
        style={[
          {
            minHeight: multiline ? 112 : 50,
            borderWidth: focused ? 1.5 : 1,
            borderColor,
            borderRadius: theme.radius.md,
            backgroundColor: focused
              ? theme.colors.surfaceRaised
              : theme.colors.surface,
            color: theme.colors.textPrimary,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: multiline
              ? theme.spacing.sm
              : theme.spacing.xs,
            textAlignVertical: multiline ? 'top' : 'center',
            fontSize: 16,
            lineHeight: 22,
            opacity: editable ? 1 : 0.55,
          },
          style,
        ]}
      />

      {error ? (
        <VadText variant="caption" tone="danger">{error}</VadText>
      ) : hint ? (
        <VadText variant="caption" tone="tertiary">{hint}</VadText>
      ) : null}
    </View>
  );
}
