import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getAdminFinancialMarketDataSources,
  setAdminFinancialMarketDataSourceStatus,
  type AdminFinancialMarketDataSource,
} from '@/services/financial-market-data-api';

export function AdminFinancialMarketDataSources() {
  const theme = useVadTheme();
  const [sources, setSources] = useState<AdminFinancialMarketDataSource[]>([]);
  const [reason, setReason] = useState('');
  const [workingCode, setWorkingCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSources(await getAdminFinancialMarketDataSources());
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Financial market-data sources could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const setStatus = useCallback(async (source: AdminFinancialMarketDataSource) => {
    if (reason.trim().length < 3) {
      setError('Enter a reason before changing a financial display-source status.');
      return;
    }
    setWorkingCode(source.code);
    setError(null);
    setMessage(null);
    try {
      const nextStatus = source.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
      await setAdminFinancialMarketDataSourceStatus({
        code: source.code,
        status: nextStatus,
        reason: reason.trim(),
      });
      setReason('');
      setMessage(source.name + ' is now ' + nextStatus.toLowerCase() + '.');
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'The financial data-source status could not be changed.');
    } finally {
      setWorkingCode(null);
    }
  }, [reason, load]);

  const grouped = [
    { title: 'Stocks & equities', sources: sources.filter((source) => source.asset_class === 'STOCKS') },
    { title: 'Commodities & energy', sources: sources.filter((source) => source.asset_class === 'COMMODITIES') },
    { title: 'Foreign exchange', sources: sources.filter((source) => source.asset_class === 'FOREX') },
    { title: 'Economic indicators', sources: sources.filter((source) => source.asset_class === 'ECONOMICS') },
  ];

  return (
    <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
      <View style={{ gap: 3 }}>
        <VadText variant="label" tone="brand">FINANCIAL DATA · DISPLAY ONLY</VadText>
        <VadText variant="heading">Financial asset quote sources</VadText>
        <VadText variant="caption" tone="secondary">
          Configure which approved quote source feeds the financial-asset explorer and market-detail context. These providers never settle VAD markets. New feeds remain disabled until their required credentials are configured securely.
        </VadText>
      </View>
      {loading ? (
        <View style={{ gap: theme.spacing.sm }}><VadSkeleton height={100} radius={theme.radius.md} /><VadSkeleton height={100} radius={theme.radius.md} /></View>
      ) : sources.length ? (
        <View style={{ gap: theme.spacing.lg }}>
          {grouped.map((group) => group.sources.length ? (
            <View key={group.title} style={{ gap: theme.spacing.sm }}>
              <VadText variant="bodyStrong">{group.title}</VadText>
              {group.sources.map((source) => (
                <View key={source.code} style={{ gap: 7, paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8 }}>
                    <View style={{ flex: 1, minWidth: 190, gap: 3 }}>
                      <VadText variant="bodyStrong">{source.name}</VadText>
                      <VadText variant="caption" tone="secondary">{source.code} · {source.adapter_code}</VadText>
                      <VadText variant="caption" tone="tertiary">{source.base_url}</VadText>
                      <VadText variant="caption" tone="tertiary">
                        Secret reference: {source.secret_reference || 'Not required'} · cache {source.cache_seconds}s · request-budget units {source.daily_request_limit}/day
                      </VadText>
                    </View>
                    <VadChip label={source.status} tone={source.status === 'ACTIVE' ? 'yes' : 'neutral'} />
                  </View>
                  {typeof source.provider_metadata.notes === 'string' ? (
                    <VadText variant="caption" tone="secondary">{source.provider_metadata.notes}</VadText>
                  ) : null}
                  <VadButton
                    label={source.status === 'ACTIVE' ? 'Disable display feed' : 'Enable display feed'}
                    variant={source.status === 'ACTIVE' ? 'secondary' : 'primary'}
                    size="small"
                    fullWidth={false}
                    loading={workingCode === source.code}
                    disabled={Boolean(workingCode) || reason.trim().length < 3}
                    onPress={() => void setStatus(source)}
                  />
                </View>
              ))}
            </View>
          ) : null) }
        </View>
      ) : (
        <VadText variant="caption" tone="secondary">No additional financial quote sources are configured.</VadText>
      )}
      <VadInput
        label="Reason for source status change"
        value={reason}
        onChangeText={setReason}
        placeholder="Why are you enabling or disabling this display source?"
      />
      {error ? <VadErrorState title="Financial data source action failed" message={error} onRetry={() => void load()} /> : null}
      {message ? <VadText variant="caption" tone="yes">{message}</VadText> : null}
    </VadCard>
  );
}
