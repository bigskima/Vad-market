import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

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
  clearable?: boolean;
  dateOnly?: boolean;
};

export function VadDateTimeField({
  label,
  value,
  onChange,
  hint,
  minDate,
  clearable = false,
  dateOnly = false,
}: Props) {
  const theme = useVadTheme();
  const [open, setOpen] = useState(false);
  const initial = useMemo(() => parseValue(value, minDate), [value, minDate]);
  const [draft, setDraft] = useState(initial);
  const [minuteText, setMinuteText] = useState(() => String(initial.getMinutes()).padStart(2, '0'));
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(initial));

  function showPicker() {
    const next = parseValue(value, minDate);
    setDraft(next);
    setMinuteText(String(next.getMinutes()).padStart(2, '0'));
    setMonthCursor(startOfMonth(next));
    setOpen(true);
  }

  const days = useMemo(() => buildMonthDays(monthCursor, minDate), [monthCursor, minDate]);

  function moveMonth(delta: number) {
    setMonthCursor((current) => {
      const next = new Date(current);
      next.setMonth(next.getMonth() + delta, 1);
      const minimum = minDate && Number.isFinite(Date.parse(minDate)) ? startOfMonth(new Date(minDate)) : null;
      if (minimum && next < minimum) return minimum;
      return next;
    });
  }

  function setExactMinute(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    setMinuteText(digits);
    if (!digits) return;
    const minute = Number(digits);
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) return;
    const next = new Date(draft);
    next.setMinutes(minute, 0, 0);
    setDraft(next);
  }

  function adjustMinute(delta: number) {
    const next = new Date(draft);
    next.setMinutes(next.getMinutes() + delta, 0, 0);
    setDraft(next);
    setMinuteText(String(next.getMinutes()).padStart(2, '0'));
  }

  function normalizeMinuteText() {
    const minute = Number(minuteText);
    if (!minuteText || !Number.isInteger(minute) || minute < 0 || minute > 59) {
      setMinuteText(String(draft.getMinutes()).padStart(2, '0'));
      return;
    }
    setMinuteText(String(minute).padStart(2, '0'));
  }

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
            {value ? (dateOnly ? formatDate(value) : formatDateTime(value)) : dateOnly ? 'Choose date' : 'Choose date and time'}
          </VadText>
          {value && !dateOnly ? <VadText variant="caption" tone="tertiary">{formatRelative(value)}</VadText> : null}
        </View>
        <VadText variant="heading" tone="brand">⌄</VadText>
      </Pressable>
      {hint ? <VadText variant="caption" tone="tertiary">{hint}</VadText> : null}

      <VadBottomSheet visible={open} title={`Choose ${label.toLowerCase()}`} onClose={() => setOpen(false)}>
        <View style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
              <MonthButton label="‹" accessibilityLabel="Previous month" onPress={() => moveMonth(-1)} disabled={!canMovePrevious(monthCursor, minDate)} />
              <View style={{ flex: 1, alignItems: 'center', gap: 1 }}>
                <VadText variant="bodyStrong">{monthCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</VadText>
                <VadText variant="caption" tone="tertiary">Choose a day</VadText>
              </View>
              <MonthButton label="›" accessibilityLabel="Next month" onPress={() => moveMonth(1)} />
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {days.map((day) => (
                <DayChoice
                  key={day.key}
                  date={day.date}
                  disabled={day.disabled}
                  selected={sameDay(draft, day.date)}
                  onPress={() => {
                    if (day.disabled) return;
                    setDraft(withDate(draft, day.date));
                  }}
                />
              ))}
            </View>
          </View>

          {!dateOnly ? (
            <>
              <View style={{ gap: theme.spacing.sm }}>
                <VadText variant="bodyStrong">Hour</VadText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {Array.from({ length: 24 }, (_, hour) => hour).map((hour) => (
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
                <View style={{ gap: 2 }}>
                  <VadText variant="bodyStrong">Minute</VadText>
                  <VadText variant="caption" tone="tertiary">Choose any minute from 00 to 59. You are no longer limited to preset intervals.</VadText>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <MinuteButton label="−1" accessibilityLabel="Previous minute" onPress={() => adjustMinute(-1)} />
                  <View
                    style={{
                      minWidth: 104,
                      minHeight: 54,
                      borderWidth: 1,
                      borderColor: theme.colors.brandPrimary,
                      borderRadius: theme.radius.lg,
                      backgroundColor: theme.colors.brandSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 12,
                    }}
                  >
                    <TextInput
                      value={minuteText}
                      onChangeText={setExactMinute}
                      onBlur={normalizeMinuteText}
                      keyboardType="number-pad"
                      inputMode="numeric"
                      maxLength={2}
                      selectTextOnFocus
                      accessibilityLabel="Minute from 00 to 59"
                      placeholder="00"
                      placeholderTextColor={theme.colors.textTertiary}
                      selectionColor={theme.colors.brandPrimary}
                      cursorColor={theme.colors.brandPrimary}
                      style={{
                        width: 72,
                        textAlign: 'center',
                        color: theme.colors.textPrimary,
                        fontSize: 24,
                        fontWeight: '700',
                        paddingVertical: 8,
                        backgroundColor: 'transparent',
                      }}
                    />
                  </View>
                  <MinuteButton label="+1" accessibilityLabel="Next minute" onPress={() => adjustMinute(1)} />
                </View>
              </View>
            </>
          ) : null}

          <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.md, gap: theme.spacing.sm }}>
            <VadText variant="caption" tone="secondary">Selected</VadText>
            <VadText variant="heading">{dateOnly ? formatDate(draft.toISOString()) : formatDateTime(draft.toISOString())}</VadText>
            <VadButton
              label={dateOnly ? 'Use this date' : 'Use this date and time'}
              onPress={() => {
                onChange(dateOnly ? toLocalDateValue(draft) : draft.toISOString());
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

function MonthButton({ label, accessibilityLabel, disabled = false, onPress }: { label: string; accessibilityLabel: string; disabled?: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 22,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surfaceRaised,
        opacity: disabled ? 0.35 : pressed ? 0.72 : 1,
      })}
    >
      <VadText variant="heading" tone="brand">{label}</VadText>
    </Pressable>
  );
}

function MinuteButton({ label, accessibilityLabel, onPress }: { label: string; accessibilityLabel: string; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: 58,
        minHeight: 50,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surfaceRaised,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <VadText variant="bodyStrong" tone="brand">{label}</VadText>
    </Pressable>
  );
}

function DayChoice({ date, disabled, selected, onPress }: { date: Date; disabled: boolean; selected: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 58,
        minHeight: 54,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
        backgroundColor: selected ? theme.colors.brandSoft : pressed ? theme.colors.surfaceMuted : theme.colors.surface,
        opacity: disabled ? 0.28 : pressed ? 0.78 : 1,
      })}
    >
      <VadText variant="caption" tone="tertiary">{date.toLocaleDateString(undefined, { weekday: 'short' })}</VadText>
      <VadText variant="bodyStrong" tone={selected ? 'brand' : 'primary'}>{date.getDate()}</VadText>
    </Pressable>
  );
}

function PickerChoice({ label, selected = false, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: 72,
        minHeight: 42,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
        backgroundColor: selected ? theme.colors.brandSoft : pressed ? theme.colors.surfaceMuted : theme.colors.surface,
        opacity: pressed ? 0.78 : 1,
      })}
    >
      <VadText variant="caption" tone={selected ? 'brand' : 'primary'}>{label}</VadText>
    </Pressable>
  );
}

function parseValue(value: string, minDate: string | undefined) {
  const parsed = parseInputDate(value);
  const minimum = minDate ? parseInputDate(minDate) : null;
  const date = parsed ?? new Date();
  if (minimum && date < minimum) return new Date(minimum);
  date.setSeconds(0, 0);
  return date;
}

function parseInputDate(value: string) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const local = new Date(year, month - 1, day, 12, 0, 0, 0);
    return Number.isFinite(local.getTime()) ? local : null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

function canMovePrevious(month: Date, minDate?: string) {
  if (!minDate) return true;
  const minimum = parseInputDate(minDate);
  if (!minimum) return true;
  return startOfMonth(month) > startOfMonth(minimum);
}

function buildMonthDays(month: Date, minDate?: string) {
  const minimum = minDate ? parseInputDate(minDate) : null;
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const count = new Date(year, monthIndex + 1, 0).getDate();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(year, monthIndex, index + 1, 12, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    return {
      key: `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
      date,
      disabled: Boolean(minimum && endOfDay < minimum),
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
  return date.toLocaleTimeString(undefined, { hour: 'numeric' });
}

function formatDate(value: string) {
  const date = parseInputDate(value);
  if (!date) return 'Choose date';
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(value: string) {
  const date = parseInputDate(value);
  if (!date) return 'Choose date and time';
  return date.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function toLocalDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatRelative(value: string) {
  const date = parseInputDate(value);
  if (!date) return '';
  const diffHours = Math.round((date.getTime() - Date.now()) / 3_600_000);
  if (Math.abs(diffHours) < 1) return 'Within the next hour';
  if (diffHours > 0 && diffHours < 24) return `In about ${diffHours} ${diffHours === 1 ? 'hour' : 'hours'}`;
  const days = Math.round(diffHours / 24);
  if (days > 0) return `In about ${days} ${days === 1 ? 'day' : 'days'}`;
  return 'Past date';
}
