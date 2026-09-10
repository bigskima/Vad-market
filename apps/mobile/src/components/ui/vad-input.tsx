import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { useProductDensity } from '@/hooks/use-product-density';
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
  const density = useProductDensity();
  const [focused, setFocused] = useState(false);
  const singleHeight = density.phone ? (density.compact ? 44 : 46) : 52;
  const multiHeight = density.phone ? (density.compact ? 92 : 100) : 112;

  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.brandPrimary
      : theme.colors.border;

  return (
    <View style={{ gap: density.phone ? theme.spacing.xxs : theme.spacing.xs }}>
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
          minHeight: multiline ? multiHeight : singleHeight,
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          borderWidth: focused ? 1.5 : 1,
          borderColor,
          borderRadius: density.phone ? theme.radius.md : theme.radius.lg,
          backgroundColor: focused ? theme.colors.surfaceRaised : theme.colors.surface,
          paddingHorizontal: density.phone ? 12 : theme.spacing.md,
          opacity: editable ? 1 : 0.55,
        }}
      >
        {leading ? (
          <View style={{ minHeight: singleHeight, justifyContent: 'center', paddingRight: theme.spacing.sm }}>
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
              minHeight: multiline ? multiHeight - 4 : singleHeight - 2,
              color: theme.colors.textPrimary,
              paddingVertical: multiline ? (density.phone ? 10 : theme.spacing.md) : 0,
              textAlignVertical: multiline ? 'top' : 'center',
              fontSize: density.phone ? 15 : 16,
              lineHeight: density.phone ? 21 : 22,
              backgroundColor: 'transparent',
            },
            style,
            // Plain input text always follows the active light/dark theme.
            { color: theme.colors.textPrimary },
          ]}
        />

        {trailing ? (
          <View style={{ minHeight: singleHeight, justifyContent: 'center', paddingLeft: theme.spacing.sm }}>
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
