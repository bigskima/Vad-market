import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  Pressable,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import { VadDateTimeField } from './vad-date-time-field';
import { VadText } from './vad-text';

type Props = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
  success?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  floatingLabel?: boolean;
  revealable?: boolean;
  datePicker?: boolean;
  dateOnly?: boolean;
};

export function VadInput({
  label,
  error,
  hint,
  success,
  multiline,
  style,
  onFocus,
  onBlur,
  onChangeText,
  accessibilityLabel,
  accessibilityHint,
  editable = true,
  leading,
  trailing,
  floatingLabel = false,
  revealable = false,
  datePicker,
  dateOnly,
  secureTextEntry,
  value,
  ...props
}: Props) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const singleHeight = density.phone ? 48 : 52;
  const multiHeight = density.phone ? (density.compact ? 96 : 104) : 116;
  const hasValue = typeof value === 'string' && value.length > 0;
  const floatActive = floatingLabel && Boolean(label) && (focused || hasValue);

  const inferredDateField = Boolean(
    label
      && /\bdate\b/i.test(label)
      && !multiline
      && editable
      && typeof value === 'string'
      && onChangeText,
  );
  const useDatePicker = datePicker ?? inferredDateField;
  const useDateOnly = dateOnly ?? Boolean(label && /\bdate\b/i.test(label) && !/\btime\b/i.test(label));

  if (useDatePicker && typeof value === 'string' && onChangeText) {
    return (
      <View style={{ gap: density.phone ? theme.spacing.xxs : theme.spacing.xs }}>
        <VadDateTimeField
          label={label ?? 'Date'}
          value={value}
          onChange={onChangeText}
          hint={error ?? success ?? hint}
          dateOnly={useDateOnly}
          clearable
        />
        {error ? <VadText variant="caption" tone="danger">{error}</VadText> : null}
        {!error && success ? <VadText variant="caption" tone="yes">{success}</VadText> : null}
      </View>
    );
  }

  const borderColor = error
    ? theme.colors.danger
    : success
      ? theme.colors.yes
      : focused
        ? theme.colors.brandPrimary
        : theme.colors.border;

  return (
    <View style={{ gap: density.phone ? theme.spacing.xxs : theme.spacing.xs }}>
      {label && !floatingLabel ? (
        <VadText
          variant="label"
          tone={error ? 'danger' : success ? 'yes' : focused ? 'primary' : 'secondary'}
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
          borderRadius: density.phone ? theme.radius.lg : theme.radius.xl,
          backgroundColor: focused ? theme.colors.surfaceRaised : theme.colors.surface,
          paddingHorizontal: density.phone ? 13 : theme.spacing.md,
          opacity: editable ? 1 : 0.55,
        }}
      >
        {floatActive ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -9,
              left: leading ? 44 : 12,
              paddingHorizontal: 5,
              backgroundColor: theme.colors.surface,
              zIndex: 2,
            }}
          >
            <VadText variant="caption" tone={error ? 'danger' : success ? 'yes' : 'brand'} style={{ fontSize: 11 }}>
              {label}
            </VadText>
          </View>
        ) : null}

        {leading ? (
          <View style={{ minHeight: singleHeight, justifyContent: 'center', paddingRight: theme.spacing.sm }}>
            {leading}
          </View>
        ) : null}

        <TextInput
          {...props}
          value={value}
          editable={editable}
          multiline={multiline}
          onChangeText={onChangeText}
          secureTextEntry={revealable ? Boolean(secureTextEntry && !revealed) : secureTextEntry}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={accessibilityHint ?? error ?? success ?? hint}
          placeholder={floatActive ? props.placeholder : (floatingLabel && label ? label : props.placeholder)}
          placeholderTextColor={theme.colors.textTertiary}
          selectionColor={theme.colors.brandPrimary}
          cursorColor={theme.colors.brandPrimary}
          style={[
            {
              flex: 1,
              minHeight: multiline ? multiHeight - 4 : singleHeight - 2,
              color: theme.colors.textPrimary,
              paddingVertical: multiline ? (density.phone ? 11 : theme.spacing.md) : 0,
              textAlignVertical: multiline ? 'top' : 'center',
              fontSize: density.phone ? 15 : 16,
              lineHeight: density.phone ? 21 : 22,
              backgroundColor: 'transparent',
            },
            style,
            { color: theme.colors.textPrimary },
          ]}
        />

        {revealable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            onPress={() => setRevealed((current) => !current)}
            hitSlop={6}
            style={({ pressed }) => ({
              minWidth: 44,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <VadText variant="caption" tone="brand">{revealed ? 'Hide' : 'Show'}</VadText>
          </Pressable>
        ) : trailing ? (
          <View style={{ minHeight: singleHeight, justifyContent: 'center', paddingLeft: theme.spacing.sm }}>
            {trailing}
          </View>
        ) : null}
      </View>

      {error ? (
        <VadText variant="caption" tone="danger">{error}</VadText>
      ) : success ? (
        <VadText variant="caption" tone="yes">{success}</VadText>
      ) : hint ? (
        <VadText variant="caption" tone="tertiary">{hint}</VadText>
      ) : null}
    </View>
  );
}
