import { TextInput, View, type TextInputProps } from 'react-native';

import { useVadTheme } from '@/providers/theme-provider';
import { VadText } from './vad-text';

type Props = TextInputProps & { label?: string; error?: string };

export function VadInput({
  label,
  error,
  multiline,
  style,
  onChange,
  onChangeText,
  editable = true,
  ...props
}: Props) {
  const theme = useVadTheme();

  return (
    <View style={{ gap: theme.spacing.xs }}>
      {label ? <VadText variant="label" tone="secondary">{label}</VadText> : null}
      <TextInput
        {...props}
        editable={editable}
        multiline={multiline}
        onChange={(event) => {
          onChange?.(event);
          onChangeText?.(event.nativeEvent.text);
        }}
        placeholderTextColor={theme.colors.textTertiary}
        selectionColor={theme.colors.brandPrimary}
        style={[
          {
            minHeight: multiline ? 110 : 50,
            borderWidth: 1,
            borderColor: error ? theme.colors.danger : theme.colors.border,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surface,
            color: theme.colors.textPrimary,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: multiline ? theme.spacing.sm : theme.spacing.xs,
            textAlignVertical: multiline ? 'top' : 'center',
            fontSize: 16,
            opacity: editable ? 1 : 0.55,
          },
          style,
        ]}
      />
      {error ? <VadText variant="caption" tone="danger">{error}</VadText> : null}
    </View>
  );
}
