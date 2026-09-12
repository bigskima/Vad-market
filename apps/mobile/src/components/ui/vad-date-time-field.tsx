import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  minDate?: string;
  minuteStep?: 5 | 10 | 15 | 30;
  clearable?: boolean;
};

export function VadDateTimeField({
  label,
  value,
  onChange,
  hint,
  minDate,
  minuteStep = 15,
  clearable = false,
}: Props) {
  const theme = useVadTheme();
  const [open, setOpen] = useState(false);
  const initial = useMemo(() => parseValue(value, minDate), [value, minDate]);
  const [draft, setDraft] = useState(initial);

  function showPicker() {
    setDraft(parseValue(value, minDate));
    setOpen(true);
  }

  const days = useMemo(() => buildDays(minDate, 35), [minDate]);
  const minutes = useMemo(() => {
    const result: number[] = [];
    for (let minute = 0; minute < 60; minute += minuteStep) result.push(minute);
    return result;
  }, [minuteStep]);

  return (
    <View style={{ gap: 6 }}>
      <VadText variant="label">{label}</VadText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Choose ${label}`}
        onPress={showPicker}
        style={({ pressed }) => ({
          minHeight: 52,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: pressed ? theme.colors.brandPrimary : theme.colors.borderStrong,
          backgroundColor: theme.colors.surface,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
        })}
      >
        <View style={{ flex: 1, gap: 1 }}>
          <VadText tone={value ? 'primary' : 'tertiary'}>
            {value ? formatDateTime(value) : 'Choose date and time'}
          </VadText>
          {value ? (
            <VadText variant="caption" tone="tertiary">
              {formatRelative(value)}
            </VadText>
          ) : null}
        </View>
        <VadText variant="heading" tone="brand">⌄</VadText>
      </Pressable>
      {hint ? <VadText variant="caption" tone="tertiary">{hint}</VadText> : null}

      <VadBottomSheet visible={open} title={`Choose ${label.toLowerCase()}`} onClose={() => setOpen(false)}>
        <View style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: theme.spacing.sm }}>
            <VadText variant="bodyStrong">Date</VadText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {days.map((day) => (
                <PickerChoice
                  key={day.key}
                  label={day.label}
                  detail={day.detail}
                  selected={sameDay(draft, day.date)}
                  onPress={() => setDraft(withDate(draft, day.date))}
                />
              ))}
            </View>
          </View>

          <View style={{ gap: theme.spacing.sm }}>
            <VadText variant="bodyStrong">Time</VadText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[6, 8, 9, 10, 12, 14, 16, 18, 20, 22].map((hour) => (
                <PickerChoice
                  key={hour}
                  label={formatHour(hour)}
                  selected={draft.getHours() === hour}
                  onPress={() => {
                    const next = new Date(draft);
                    next.setHours(hour);
                    setDraft(next);
                  }}
                />
              ))}
            </View>
          </View>

          <View style={{ gap: theme.spacing.sm }}>
            <VadText variant="bodyStrong">Minutes</VadText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {minutes.map((minute) => (
                <PickerChoice
                  key={minute}
                  label={`:${String(minute).padStart(2, '0')}`}
                  selected={draft.getMinutes() === minute}
                  onPress={() => {
                    const next = new Date(draft);
                    next.setMinutes(minute, 0, 0);
                    setDraft(next);
                  }}
                />
              ))}
            </View>
          </View>

          <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.md, gap: theme.spacing.sm }}>
            <VadText variant="caption" tone="secondary">Selected</VadText>
            <VadText variant="heading">{formatDateTime(draft.toISOString())}</VadText>
            <VadButton
              label="Use this date and time"
              onPress={() => {
                onChange(draft.toISOString());
                setOpen(false);
              }}
            />
            {clearable && value ? (
              <VadButton
                label="Clear date"
                variant="secondary"
                onPress={() => {
                  onChange('');
                  setOpen(false);
                }}
              />
            ) : null}
          </View>
        </View>
      </VadBottomSheet>
    </View>
  );
}

function PickerChoice({ label, detail, selected = false, onPress }: { label: string; detail?: string; selected?: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: detail ? 104 : 72,
        minHeight: detail ? 54 : 42,
        justifyContent: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
        backgroundColor: selected ? theme.colors.brandSoft : pressed ? theme.colors.surfaceMuted : theme.colors.surface,
        opacity: pressed ? 0.78 : 1,
      })}
    >
      <VadText variant={detail ? 'bodyStrong' : 'caption'} tone={selected ? 'brand' : 'primary'}>{label}</VadText>
      {detail ? <VadText variant="caption" tone="tertiary">{detail}</VadText> : null}
    </Pressable>
  );
}

function parseValue(value: string, minDate?: string) {
  const parsed = value ? new Date(value) : new Date();
  const minimum = minDate ? new Date(minDate) : null;
  const date = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  if (minimum && Number.isFinite(minimum.getTime()) && date < minimum) return new Date(minimum);
  date.setSeconds(0, 0);
  const minute = Math.ceil(date.getMinutes() / 15) * 15;
  if (minute >= 60) {
    date.setHours(date.getHours() + 1, 0, 0, 0);
  } else {
    date.setMinutes(minute, 0, 0);
  }
  return date;
}

function buildDays(minDate: string | undefined, count: number) {
  const start = minDate && Number.isFinite(Date.parse(minDate)) ? new Date(minDate) : new Date();
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      key: date.toISOString().slice(0, 10),
      date,
      label: index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : date.toLocaleDateString(undefined, { weekday: 'short' }),
      detail: date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    };
  });
}

function withDate(source: Date, day: Date) {
  const next = new Date(source);
  next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
  return next;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatHour(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Choose date and time';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRelative(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const diffHours = Math.round((date.getTime() - Date.now()) / 3_600_000);
  if (Math.abs(diffHours) < 1) return 'Within the next hour';
  if (diffHours > 0 && diffHours < 24) return `In about ${diffHours} ${diffHours === 1 ? 'hour' : 'hours'}`;
  const days = Math.round(diffHours / 24);
  if (days > 0) return `In about ${days} ${days === 1 ? 'day' : 'days'}`;
  return 'Past date';
}
