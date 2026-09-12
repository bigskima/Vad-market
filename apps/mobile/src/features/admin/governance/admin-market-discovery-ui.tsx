import type { ReactNode } from 'react';
import { View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import type { AdminMarketPublicationRow } from '@/services/admin-market-publishing-api';

export function DiscoveryRulePanel({ title, subtitle, enabled, onEnabledChange, children }: {
  title: string;
  subtitle: string;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  children: ReactNode;
}) {
  const theme = useVadTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ gap: 3 }}>
        <VadText variant="heading">{title}</VadText>
        <VadText variant="caption" tone="secondary">{subtitle}</VadText>
      </View>
      <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <VadText variant="bodyStrong" style={{ flex: 1, minWidth: 180 }}>Automatic ranking</VadText>
          <VadChip label="On" selected={enabled} tone={enabled ? 'yes' : 'neutral'} onPress={() => onEnabledChange(true)} />
          <VadChip label="Paused" selected={!enabled} tone={!enabled ? 'warning' : 'neutral'} onPress={() => onEnabledChange(false)} />
        </View>
        {children}
      </VadCard>
    </View>
  );
}

export function DiscoveryChoiceGroup({ label, options, value, onChange }: {
  label: string;
  options: { label: string; value: number }[];
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={{ gap: 7 }}>
      <VadText variant="label">{label}</VadText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {options.map((option) => (
          <VadChip key={option.value} label={option.label} selected={value === option.value} tone={value === option.value ? 'brand' : 'neutral'} onPress={() => onChange(option.value)} />
        ))}
      </View>
    </View>
  );
}

export function DiscoveryMarketRow({ row, badge, badgeTone, detail, children }: {
  row: AdminMarketPublicationRow;
  badge: string;
  badgeTone: 'yes' | 'warning' | 'brand' | 'neutral';
  detail?: string;
  children?: ReactNode;
}) {
  const theme = useVadTheme();
  return (
    <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 200, gap: 3 }}>
          <VadText variant="bodyStrong">{row.title}</VadText>
          <VadText variant="caption" tone="secondary">{row.category} · {row.asset_code}</VadText>
          {detail ? <VadText variant="caption" tone="tertiary">{detail}</VadText> : null}
        </View>
        <VadChip label={badge} tone={badgeTone} />
      </View>
      {children}
    </VadCard>
  );
}

export function formatDiscoveryNaira(value: number) {
  return `₦${Math.round(Number(value) || 0).toLocaleString('en-NG')}`;
}

export function formatDiscoveryGrowth(value: number) {
  const growth = Math.max(Number(value) || 0, 1);
  return `${growth.toFixed(growth >= 10 ? 0 : 1)}× recent pace`;
}
