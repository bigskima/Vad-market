import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadDateTimeField } from '@/components/ui/vad-date-time-field';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

type ExpiryPreset = 'NONE' | '1H' | '24H' | '7D' | 'CUSTOM';

const PRESETS: Array<{ key: ExpiryPreset; label: string }> = [
  { key: 'NONE', label: 'No expiry' },
  { key: '1H', label: '1 hour' },
  { key: '24H', label: '24 hours' },
  { key: '7D', label: '7 days' },
  { key: 'CUSTOM', label: 'Custom' },
];

function futureIso(milliseconds: number) {
  return new Date(Date.now() + milliseconds).toISOString();
}

export function validateTesterExpiry(value: string) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Choose a valid expiry time, or use No expiry.';
  if (timestamp <= Date.now() + 5_000) return 'Choose an expiry in the future, or use No expiry.';
  return null;
}

export function TesterAccessExpiry({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const theme = useVadTheme();
  const [preset, setPreset] = useState<ExpiryPreset>(value ? 'CUSTOM' : 'NONE');

  function select(next: ExpiryPreset) {
    setPreset(next);
    if (next === 'NONE') onChange('');
    if (next === '1H') onChange(futureIso(60 * 60 * 1_000));
    if (next === '24H') onChange(futureIso(24 * 60 * 60 * 1_000));
    if (next === '7D') onChange(futureIso(7 * 24 * 60 * 60 * 1_000));
    if (next === 'CUSTOM' && validateTesterExpiry(value)) onChange(futureIso(60 * 60 * 1_000));
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ gap: 2 }}>
        <VadText variant="bodyStrong">Override expiry</VadText>
        <VadText variant="caption" tone="secondary">
          No expiry is the easiest option for ongoing testing. Choose a time limit only when you want access to switch off automatically.
        </VadText>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {PRESETS.map((item) => {
          const selected = preset === item.key;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => select(item.key)}
              style={({ pressed }) => ({
                borderWidth: 1,
                borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
                backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
                borderRadius: theme.radius.pill,
                paddingHorizontal: 12,
                paddingVertical: 9,
                opacity: pressed ? 0.72 : 1,
              })}
            >
              <VadText variant="caption" tone={selected ? 'brand' : 'secondary'}>{item.label}</VadText>
            </Pressable>
          );
        })}
      </View>
      {preset === 'CUSTOM' ? (
        <VadDateTimeField
          label="Custom expiry"
          value={value}
          onChange={onChange}
          clearable
          hint="Choose a future time. Clearing this field is the same as No expiry."
        />
      ) : value ? (
        <VadText variant="caption" tone="tertiary">Ends {new Date(value).toLocaleString()}</VadText>
      ) : null}
    </View>
  );
}
