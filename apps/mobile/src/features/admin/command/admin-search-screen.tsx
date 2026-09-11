import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import {
  getVisibleAdminGroups,
  type AdminHref,
} from '@/features/admin/components/admin-navigation';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';

type SearchResult = {
  key: string;
  kind: string;
  title: string;
  detail: string;
  href: AdminHref;
  terms: string;
};

function rowText(row: Record<string, unknown>, keys: string[], fallback: string) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
  }
  return fallback;
}

export function AdminSearchScreen() {
  const theme = useVadTheme();
  const data = useAdminData();
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();

  const results = useMemo(() => {
    const areas: SearchResult[] = getVisibleAdminGroups(data.access)
      .flatMap((group) => group.items.map((item) => ({ group: group.label, item })))
      .map(({ group, item }) => ({
        key: `area-${item.href}`,
        kind: group,
        title: item.label,
        detail: item.description,
        href: item.href,
        terms: `${group} ${item.label} ${item.description}`.toLowerCase(),
      }));

    const records: SearchResult[] = [
      ...data.marketQueue.map((row, index) => ({
        key: `market-${index}-${rowText(row, ['public_id', 'instrument_public_id'], '')}`,
        kind: 'Market',
        title: rowText(row, ['question', 'title', 'market_title'], 'Market review'),
        detail: rowText(row, ['status', 'category', 'public_id'], 'Governance queue'),
        href: '/admin/governance' as const,
        terms: JSON.stringify(row).toLowerCase(),
      })),
      ...data.oracleQueue.map((row, index) => ({
        key: `oracle-${index}-${rowText(row, ['public_id', 'event_public_id'], '')}`,
        kind: 'Oracle',
        title: rowText(row, ['question', 'title', 'event_title'], 'Oracle review'),
        detail: rowText(row, ['status', 'resolution_status', 'event_public_id'], 'Resolution queue'),
        href: '/admin/governance' as const,
        terms: JSON.stringify(row).toLowerCase(),
      })),
      ...data.kycQueue.map((row) => ({
        key: `kyc-${row.case_public_id}`,
        kind: 'KYC',
        title: `${row.verification_level} · ${row.status}`,
        detail: `${row.case_public_id} · ${row.country_code} · ${row.provider_code ?? 'No provider'}`,
        href: '/admin/compliance' as const,
        terms: `${row.case_public_id} ${row.user_id} ${row.country_code} ${row.verification_level} ${row.provider_code ?? ''} ${row.status}`.toLowerCase(),
      })),
      ...data.paymentQueue.map((row) => ({
        key: `payment-${row.intent_public_id}`,
        kind: 'Payment',
        title: `${row.operation} · ${row.asset_code} ${row.amount}`,
        detail: `${row.intent_public_id} · ${row.status} · ${row.provider_code ?? 'No provider'}`,
        href: '/admin/payments' as const,
        terms: `${row.intent_public_id} ${row.user_id} ${row.asset_code} ${row.operation} ${row.amount} ${row.provider_code ?? ''} ${row.status} ${row.failure_code ?? ''}`.toLowerCase(),
      })),
      ...data.providerChanges.map((row) => ({
        key: `provider-change-${row.request_public_id}`,
        kind: 'Provider approval',
        title: `${row.provider_code}: ${row.current_status} → ${row.requested_status}`,
        detail: `${row.request_public_id} · ${row.reason}`,
        href: '/admin/providers' as const,
        terms: `${row.request_public_id} ${row.provider_code} ${row.environment} ${row.current_status} ${row.requested_status} ${row.reason}`.toLowerCase(),
      })),
      ...data.providers.map((row, index) => ({
        key: `provider-${row.provider_code}-${row.operation ?? 'base'}-${index}`,
        kind: 'Provider',
        title: `${row.provider_code} · ${row.environment}`,
        detail: `${row.operation ?? 'Base provider'} · ${row.country_code ?? 'Global'} · ${row.asset_code ?? 'All assets'} · ${row.configured ? row.provider_status : 'UNCONFIGURED'}`,
        href: '/admin/providers' as const,
        terms: `${row.provider_code} ${row.provider_type} ${row.environment} ${row.provider_status} ${row.operation ?? ''} ${row.country_code ?? ''} ${row.asset_code ?? ''} ${row.route_status ?? ''}`.toLowerCase(),
      })),
    ];

    const all = [...areas, ...records];
    if (!normalized) return areas.slice(0, 8);
    return all.filter((result) => result.terms.includes(normalized)).slice(0, 40);
  }, [data.access, data.kycQueue, data.marketQueue, data.oracleQueue, data.paymentQueue, data.providerChanges, data.providers, normalized]);

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.xs }}>
        <VadText variant="label" tone="brand">COMMAND</VadText>
        <VadText variant="title">Operations Search</VadText>
        <VadText tone="secondary">
          Search the operations areas and records available to your current role. You will only see information your role can access.
        </VadText>
      </View>

      <VadInput
        label="Search operations"
        value={query}
        onChangeText={setQuery}
        placeholder="Market, payment, KYC case, provider…"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />

      <View style={{ gap: theme.spacing.sm }}>
        <VadText variant="caption" tone="secondary">
          {normalized ? `${results.length} RESULT${results.length === 1 ? '' : 'S'}` : 'QUICK ACCESS'}
        </VadText>

        {results.length ? (
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
            }}
          >
            {results.map((result) => (
              <Pressable
                key={result.key}
                accessibilityRole="button"
                accessibilityLabel={`Open ${result.kind}: ${result.title}`}
                onPress={() => router.push(result.href)}
                style={({ pressed }) => ({
                  minHeight: 72,
                  paddingVertical: theme.spacing.md,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.md,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.border,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <VadText variant="caption" tone="tertiary">
                    {result.kind.toUpperCase()}
                  </VadText>
                  <VadText variant="bodyStrong" numberOfLines={1}>
                    {result.title}
                  </VadText>
                  <VadText variant="caption" tone="secondary" numberOfLines={1}>
                    {result.detail}
                  </VadText>
                </View>
                <VadText variant="heading" tone="tertiary">›</VadText>
              </Pressable>
            ))}
          </View>
        ) : (
          <VadCard variant="outlined" style={{ gap: theme.spacing.sm }}>
            <VadText variant="heading">No matching operations records</VadText>
            <VadText tone="secondary">
              Try a public ID, provider code, market title, operation or status visible to your role.
            </VadText>
          </VadCard>
        )}
      </View>
    </View>
  );
}
