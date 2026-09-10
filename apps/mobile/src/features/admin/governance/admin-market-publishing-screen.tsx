import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getAdminMarketPublicationQueue,
  publishAdminMarket,
  setAdminMarketFeatured,
  type AdminMarketPublicationRow,
} from '@/services/admin-control-api';

type Action = 'PUBLISH' | 'FEATURE' | 'UNFEATURE';
type PendingAction = { row: AdminMarketPublicationRow; action: Action } | null;

export function AdminMarketPublishingScreen() {
  const theme = useVadTheme();
  const [rows, setRows] = useState<AdminMarketPublicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [reason, setReason] = useState('');
  const [rank, setRank] = useState('100');
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    setError(null);
    try {
      setRows(await getAdminMarketPublicationQueue());
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : 'Market publication records could not be loaded.',
      );
    } finally {
      if (background) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const ready = useMemo(
    () => rows.filter((row) => row.instrument_status === 'DRAFT'),
    [rows],
  );
  const live = useMemo(
    () => rows.filter((row) => row.instrument_status === 'OPEN'),
    [rows],
  );

  function openAction(row: AdminMarketPublicationRow, action: Action) {
    setPending({ row, action });
    setReason('');
    setRank(String(row.feature_rank ?? 100));
    setActionError(null);
  }

  async function apply() {
    if (!pending || reason.trim().length < 3) return;
    const parsedRank = Number(rank);
    if (!Number.isInteger(parsedRank) || parsedRank < 0 || parsedRank > 10000) {
      setActionError('Feature rank must be a whole number from 0 to 10000.');
      return;
    }

    setWorking(true);
    setActionError(null);
    try {
      if (pending.action === 'PUBLISH') {
        await publishAdminMarket({
          instrumentPublicId: pending.row.instrument_public_id,
          featureRank: parsedRank,
          reason,
        });
        setMessage(
          'Market published. It is now OPEN, listed in general Markets and automatically featured on Home.',
        );
      } else {
        await setAdminMarketFeatured({
          instrumentPublicId: pending.row.instrument_public_id,
          featured: pending.action === 'FEATURE',
          featureRank: parsedRank,
          reason,
        });
        setMessage(
          pending.action === 'FEATURE'
            ? 'Market added to the featured Home collection.'
            : 'Market removed from the featured Home collection. It remains live in general Markets.',
        );
      }
      setPending(null);
      setReason('');
      await load(true);
    } catch (value) {
      setActionError(
        value instanceof Error ? value.message : 'Market action could not be completed.',
      );
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton width="52%" height={30} />
        <VadSkeleton height={104} radius={theme.radius.lg} />
        <VadSkeleton height={104} radius={theme.radius.lg} />
      </View>
    );
  }

  if (error && !rows.length) {
    return (
      <VadErrorState
        title="Market publication unavailable"
        message={error}
        onRetry={() => {
          setLoading(true);
          void load();
        }}
      />
    );
  }

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.md, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 240, gap: 3 }}>
          <VadText variant="label" tone="brand">MARKET PUBLICATION</VadText>
          <VadText variant="title">Publish & feature markets.</VadText>
          <VadText variant="caption" tone="secondary">
            Approval creates the canonical market configuration. Publication is the explicit step that makes a market visible and tradeable.
          </VadText>
        </View>
        <VadButton
          label="Refresh"
          variant="secondary"
          size="small"
          fullWidth={false}
          loading={refreshing}
          onPress={() => void load(true)}
        />
      </View>

      {message ? (
        <View style={{ borderLeftWidth: 3, borderLeftColor: theme.colors.yes, backgroundColor: theme.colors.yesSoft, borderRadius: theme.radius.md, padding: theme.spacing.md, gap: 3 }}>
          <VadText variant="bodyStrong" tone="yes">Action completed</VadText>
          <VadText variant="caption" tone="secondary">{message}</VadText>
        </View>
      ) : null}

      {error ? (
        <VadErrorState title="Some publication data may be stale" message={error} onRetry={() => void load(true)} />
      ) : null}

      <View style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <VadText variant="heading">Ready to publish</VadText>
          <VadChip label={String(ready.length)} tone={ready.length ? 'warning' : 'neutral'} />
        </View>
        {ready.length ? (
          <View style={{ gap: theme.spacing.sm }}>
            {ready.map((row) => (
              <MarketRow key={row.instrument_public_id} row={row}>
                <VadButton
                  label="Publish & feature"
                  size="small"
                  onPress={() => openAction(row, 'PUBLISH')}
                />
              </MarketRow>
            ))}
          </View>
        ) : (
          <VadEmptyState title="No approved drafts waiting" body="Newly approved markets appear here before publication." />
        )}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <VadText variant="heading">Live markets</VadText>
          <VadChip label={String(live.length)} tone="yes" />
        </View>
        {live.length ? (
          <View style={{ gap: theme.spacing.sm }}>
            {live.map((row) => (
              <MarketRow key={row.instrument_public_id} row={row}>
                <VadButton
                  label={row.is_featured ? 'Remove feature' : 'Feature market'}
                  variant={row.is_featured ? 'secondary' : 'primary'}
                  size="small"
                  onPress={() => openAction(row, row.is_featured ? 'UNFEATURE' : 'FEATURE')}
                />
              </MarketRow>
            ))}
          </View>
        ) : (
          <VadEmptyState title="No live markets" body="Published markets will appear here." />
        )}
      </View>

      <VadBottomSheet
        visible={Boolean(pending)}
        title={pending?.action === 'PUBLISH' ? 'Publish market' : pending?.action === 'FEATURE' ? 'Feature market' : 'Remove feature'}
        onClose={() => {
          if (!working) setPending(null);
        }}
      >
        {pending ? (
          <View style={{ gap: theme.spacing.md }}>
            <VadCard variant="raised" style={{ gap: 3 }}>
              <VadText variant="bodyStrong">{pending.row.title}</VadText>
              <VadText variant="caption" tone="secondary">{pending.row.category} · {pending.row.asset_code}</VadText>
              <VadText variant="caption" tone="tertiary">
                Configured opening: {pending.row.opens_at ? new Date(pending.row.opens_at).toLocaleString() : 'by policy'}
              </VadText>
            </VadCard>

            {pending.action === 'PUBLISH' ? (
              <VadCard variant="brand" style={{ gap: 3 }}>
                <VadText variant="bodyStrong">Publication is a live-state change.</VadText>
                <VadText variant="caption" tone="secondary">
                  VAD will verify the opening/closing window on the server, open the instrument, refresh the public market catalog and feature this market automatically.
                </VadText>
              </VadCard>
            ) : null}

            <VadInput
              label="Feature rank"
              value={rank}
              onChangeText={(value) => {
                setRank(value.replace(/\D/g, ''));
                setActionError(null);
              }}
              keyboardType="number-pad"
              hint="Lower numbers appear earlier in the featured collection."
            />
            <VadInput
              label="Reason"
              value={reason}
              onChangeText={(value) => {
                setReason(value);
                setActionError(null);
              }}
              placeholder="Why are you making this change?"
              multiline
              error={reason.length > 0 && reason.trim().length < 3 ? 'Enter at least 3 characters.' : undefined}
            />

            {actionError ? <VadErrorState title="Action failed" message={actionError} /> : null}

            <VadButton
              label={pending.action === 'PUBLISH' ? 'Publish & feature' : pending.action === 'FEATURE' ? 'Feature market' : 'Remove feature'}
              variant={pending.action === 'UNFEATURE' ? 'secondary' : 'primary'}
              loading={working}
              disabled={reason.trim().length < 3}
              onPress={() => void apply()}
            />
          </View>
        ) : null}
      </VadBottomSheet>
    </View>
  );
}

function MarketRow({ row, children }: { row: AdminMarketPublicationRow; children: ReactNode }) {
  const theme = useVadTheme();
  return (
    <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 200, gap: 3 }}>
          <VadText variant="bodyStrong">{row.title}</VadText>
          <VadText variant="caption" tone="secondary">{row.category} · {row.asset_code}</VadText>
          <VadText variant="caption" tone="tertiary">
            Opens {row.opens_at ? new Date(row.opens_at).toLocaleString() : 'by policy'} · closes {new Date(row.closes_at).toLocaleString()}
          </VadText>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <VadChip label={row.instrument_status} tone={row.instrument_status === 'OPEN' ? 'yes' : 'neutral'} />
          {row.is_featured ? <VadChip label="FEATURED" tone="brand" /> : null}
        </View>
      </View>
      {children}
    </VadCard>
  );
}
