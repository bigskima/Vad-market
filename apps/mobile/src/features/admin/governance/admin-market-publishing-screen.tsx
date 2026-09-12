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
  getAdminFeaturedMarketSettings,
  getAdminMarketPublicationQueue,
  publishAdminMarket,
  refreshAdminFeaturedMarketRankings,
  setAdminVadMarket,
  updateAdminFeaturedMarketSettings,
  type AdminFeaturedMarketSettings,
  type AdminMarketPublicationRow,
} from '@/services/admin-market-publishing-api';

type Action = 'PUBLISH' | 'ADD_VAD' | 'UPDATE_VAD' | 'REMOVE_VAD';
type PendingAction = { row: AdminMarketPublicationRow; action: Action } | null;
type Priority = 'HIGH' | 'STANDARD' | 'LOW';

const priorityValues: Record<Priority, number> = {
  HIGH: 10,
  STANDARD: 100,
  LOW: 500,
};

export function AdminMarketPublishingScreen() {
  const theme = useVadTheme();
  const [rows, setRows] = useState<AdminMarketPublicationRow[]>([]);
  const [settings, setSettings] = useState<AdminFeaturedMarketSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [reason, setReason] = useState('');
  const [priority, setPriority] = useState<Priority>('STANDARD');
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [featuredEnabled, setFeaturedEnabled] = useState(true);
  const [minimumVolume, setMinimumVolume] = useState('1000000');
  const [windowHours, setWindowHours] = useState(24);
  const [maxMarkets, setMaxMarkets] = useState('20');
  const [settingsReason, setSettingsReason] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const applySettingsToForm = useCallback((next: AdminFeaturedMarketSettings) => {
    setSettings(next);
    setFeaturedEnabled(next.enabled);
    setMinimumVolume(String(Math.round(next.minimumVolumeNgn)));
    setWindowHours(next.windowHours);
    setMaxMarkets(String(next.maxMarkets));
  }, []);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    setError(null);
    try {
      const [nextRows, nextSettings] = await Promise.all([
        getAdminMarketPublicationQueue(),
        getAdminFeaturedMarketSettings(),
      ]);
      setRows(nextRows);
      applySettingsToForm(nextSettings);
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : 'Market publishing information could not be loaded.',
      );
    } finally {
      if (background) setRefreshing(false);
      else setLoading(false);
    }
  }, [applySettingsToForm]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const ready = useMemo(
    () => rows.filter((row) => row.instrument_status === 'DRAFT' && row.event_status === 'APPROVED'),
    [rows],
  );
  const scheduled = useMemo(
    () => rows.filter((row) => row.instrument_status === 'DRAFT' && row.event_status === 'SCHEDULED'),
    [rows],
  );
  const vad = useMemo(
    () => rows.filter((row) => row.instrument_status === 'OPEN' && row.is_vad_market),
    [rows],
  );
  const live = useMemo(
    () => rows.filter((row) => row.instrument_status === 'OPEN' && !row.is_vad_market),
    [rows],
  );
  const automaticFeatured = useMemo(
    () => rows
      .filter((row) => row.instrument_status === 'OPEN' && Boolean(row.automatic_featured))
      .sort((a, b) => (a.automatic_feature_rank ?? 9999) - (b.automatic_feature_rank ?? 9999)),
    [rows],
  );
  const inactive = useMemo(
    () => rows.filter((row) => row.instrument_status === 'SUSPENDED' || row.instrument_status === 'CLOSED'),
    [rows],
  );

  function openAction(row: AdminMarketPublicationRow, action: Action) {
    setPending({ row, action });
    setReason('');
    setPriority(priorityFromValue(row.vad_priority));
    setActionError(null);
  }

  async function apply() {
    if (!pending || reason.trim().length < 3) return;
    setWorking(true);
    setActionError(null);
    try {
      const selectedPriority = priorityValues[priority];
      if (pending.action === 'PUBLISH') {
        await publishAdminMarket({
          instrumentPublicId: pending.row.instrument_public_id,
          vadPriority: selectedPriority,
          reason,
        });
        setMessage('Market published. It is now live in All Markets and included in VAD Markets.');
      } else {
        await setAdminVadMarket({
          instrumentPublicId: pending.row.instrument_public_id,
          active: pending.action !== 'REMOVE_VAD',
          priority: selectedPriority,
          reason,
        });
        setMessage(
          pending.action === 'REMOVE_VAD'
            ? 'Market removed from VAD Markets. It remains live in All Markets.'
            : 'VAD Markets placement updated.',
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

  async function saveFeaturedSettings() {
    const parsedMinimum = Number(minimumVolume);
    const parsedMaximum = Number(maxMarkets);
    if (!Number.isFinite(parsedMinimum) || parsedMinimum < 0) {
      setSettingsError('Enter a valid minimum trading amount.');
      return;
    }
    if (!Number.isInteger(parsedMaximum) || parsedMaximum < 1 || parsedMaximum > 50) {
      setSettingsError('Choose between 1 and 50 markets.');
      return;
    }
    if (settingsReason.trim().length < 3) {
      setSettingsError('Enter a short reason for this change.');
      return;
    }

    setSavingSettings(true);
    setSettingsError(null);
    try {
      const next = await updateAdminFeaturedMarketSettings({
        enabled: featuredEnabled,
        minimumVolumeNgn: parsedMinimum,
        windowHours,
        maxMarkets: parsedMaximum,
        reason: settingsReason,
      });
      applySettingsToForm(next);
      setSettingsReason('');
      setMessage('Featured Markets settings saved and the ranking was refreshed.');
      await load(true);
    } catch (value) {
      setSettingsError(value instanceof Error ? value.message : 'Featured Markets settings could not be saved.');
    } finally {
      setSavingSettings(false);
    }
  }

  async function refreshRanking() {
    setRefreshing(true);
    setSettingsError(null);
    try {
      await refreshAdminFeaturedMarketRankings();
      await load(true);
      setMessage('Featured Markets ranking refreshed from recent completed trading activity.');
    } catch (value) {
      setSettingsError(value instanceof Error ? value.message : 'Featured Markets could not be refreshed.');
      setRefreshing(false);
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

  if (error && !rows.length && !settings) {
    return (
      <VadErrorState
        title="Markets workspace unavailable"
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
          <VadText variant="label" tone="brand">MARKETS</VadText>
          <VadText variant="title">Publish and manage VAD Markets.</VadText>
          <VadText variant="caption" tone="secondary">
            Publishing makes an approved market live in All Markets and places it in VAD Markets. Featured Markets are ranked separately from completed trading activity.
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

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <VadChip label={`${ready.length} ready`} tone={ready.length ? 'warning' : 'neutral'} />
        <VadChip label={`${vad.length} VAD Markets`} tone="brand" />
        <VadChip label={`${automaticFeatured.length} featured`} tone="yes" />
        <VadChip label={`${live.length} other live`} />
      </View>

      {message ? (
        <View style={{ borderLeftWidth: 3, borderLeftColor: theme.colors.yes, backgroundColor: theme.colors.yesSoft, borderRadius: theme.radius.md, padding: theme.spacing.md, gap: 3 }}>
          <VadText variant="bodyStrong" tone="yes">Updated</VadText>
          <VadText variant="caption" tone="secondary">{message}</VadText>
        </View>
      ) : null}

      {error ? (
        <VadErrorState title="Some market information may be stale" message={error} onRetry={() => void load(true)} />
      ) : null}

      <MarketSection title="Ready to publish" count={ready.length} countTone={ready.length ? 'warning' : 'neutral'}>
        {ready.length ? ready.map((row) => (
          <MarketRow key={row.instrument_public_id} row={row}>
            <VadButton label="Publish market" size="small" onPress={() => openAction(row, 'PUBLISH')} />
          </MarketRow>
        )) : <VadEmptyState title="No approved markets waiting" body="Approved markets appear here when they are ready to go live." />}
      </MarketSection>

      {scheduled.length ? (
        <MarketSection title="Scheduled" count={scheduled.length} countTone="neutral">
          {scheduled.map((row) => (
            <MarketRow key={row.instrument_public_id} row={row}>
              <VadText variant="caption" tone="secondary">
                Available to publish when its opening time arrives.
              </VadText>
            </MarketRow>
          ))}
        </MarketSection>
      ) : null}

      <MarketSection title="VAD Markets" count={vad.length} countTone="brand">
        {vad.length ? vad.map((row) => (
          <MarketRow key={row.instrument_public_id} row={row} badge="VAD MARKET" badgeTone="brand">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <VadButton label="Change priority" variant="secondary" size="small" fullWidth={false} onPress={() => openAction(row, 'UPDATE_VAD')} />
              <VadButton label="Remove from VAD Markets" variant="ghost" size="small" fullWidth={false} onPress={() => openAction(row, 'REMOVE_VAD')} />
            </View>
          </MarketRow>
        )) : <VadEmptyState title="No VAD Markets are live" body="Publishing a market automatically adds it here." />}
      </MarketSection>

      <View style={{ gap: theme.spacing.sm }}>
        <View style={{ gap: 3 }}>
          <VadText variant="heading">Automatic Featured Markets</VadText>
          <VadText variant="caption" tone="secondary">
            VAD ranks recent completed trading activity automatically. VAD Markets stay separate and are never displaced by this list.
          </VadText>
        </View>
        <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <VadText variant="bodyStrong" style={{ flex: 1, minWidth: 180 }}>Automatic featuring</VadText>
            <VadChip label="On" selected={featuredEnabled} tone={featuredEnabled ? 'yes' : 'neutral'} onPress={() => setFeaturedEnabled(true)} />
            <VadChip label="Paused" selected={!featuredEnabled} tone={!featuredEnabled ? 'warning' : 'neutral'} onPress={() => setFeaturedEnabled(false)} />
          </View>

          <VadInput
            label="Minimum recent trading activity (₦)"
            value={minimumVolume}
            onChangeText={(value) => {
              setMinimumVolume(value.replace(/[^\d.]/g, ''));
              setSettingsError(null);
            }}
            keyboardType="decimal-pad"
            hint="A market must reach this amount before it can appear in Featured Markets."
          />

          <View style={{ gap: 7 }}>
            <VadText variant="label">Measure activity over</VadText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {[
                { label: '6 hours', value: 6 },
                { label: '24 hours', value: 24 },
                { label: '7 days', value: 168 },
              ].map((option) => (
                <VadChip
                  key={option.value}
                  label={option.label}
                  selected={windowHours === option.value}
                  tone={windowHours === option.value ? 'brand' : 'neutral'}
                  onPress={() => setWindowHours(option.value)}
                />
              ))}
            </View>
          </View>

          <VadInput
            label="Maximum markets shown"
            value={maxMarkets}
            onChangeText={(value) => {
              setMaxMarkets(value.replace(/\D/g, ''));
              setSettingsError(null);
            }}
            keyboardType="number-pad"
            hint="Only the highest-ranked eligible markets are shown. Maximum 50."
          />

          <VadInput
            label="Reason for change"
            value={settingsReason}
            onChangeText={(value) => {
              setSettingsReason(value);
              setSettingsError(null);
            }}
            placeholder="Why are you changing the Featured Markets rules?"
          />

          {settingsError ? <VadErrorState title="Could not update Featured Markets" message={settingsError} /> : null}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <VadButton label="Save settings" loading={savingSettings} fullWidth={false} onPress={() => void saveFeaturedSettings()} />
            <VadButton label="Refresh ranking now" variant="secondary" loading={refreshing} fullWidth={false} onPress={() => void refreshRanking()} />
          </View>
          {settings?.lastRefreshedAt ? (
            <VadText variant="caption" tone="tertiary">
              Ranking last refreshed {new Date(settings.lastRefreshedAt).toLocaleString()}.
            </VadText>
          ) : null}
        </VadCard>

        {automaticFeatured.length ? (
          <View style={{ gap: theme.spacing.sm }}>
            {automaticFeatured.map((row) => (
              <MarketRow
                key={row.instrument_public_id}
                row={row}
                badge={`#${row.automatic_feature_rank ?? '—'} FEATURED`}
                badgeTone="yes"
              >
                <VadText variant="caption" tone="secondary">
                  {formatNaira(row.automatic_volume_ngn ?? 0)} recent completed trading · {row.automatic_trade_count ?? 0} trades
                </VadText>
              </MarketRow>
            ))}
          </View>
        ) : (
          <VadEmptyState title="No market has qualified yet" body="Markets appear here automatically when recent completed trading reaches the amount you set." />
        )}
      </View>

      <MarketSection title="Other live markets" count={live.length} countTone="neutral">
        {live.length ? live.map((row) => (
          <MarketRow key={row.instrument_public_id} row={row}>
            <VadButton label="Add to VAD Markets" variant="secondary" size="small" onPress={() => openAction(row, 'ADD_VAD')} />
          </MarketRow>
        )) : <VadEmptyState title="No other live markets" body="Live markets outside the VAD Markets collection will appear here." />}
      </MarketSection>

      {inactive.length ? (
        <MarketSection title="Paused & closed" count={inactive.length} countTone="neutral">
          {inactive.map((row) => <MarketRow key={row.instrument_public_id} row={row} />)}
        </MarketSection>
      ) : null}

      <VadBottomSheet
        visible={Boolean(pending)}
        title={actionTitle(pending?.action)}
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
                Closes {new Date(pending.row.closes_at).toLocaleString()}
              </VadText>
            </VadCard>

            {pending.action === 'PUBLISH' ? (
              <VadCard variant="brand" style={{ gap: 3 }}>
                <VadText variant="bodyStrong">This will make the market live.</VadText>
                <VadText variant="caption" tone="secondary">
                  It will appear in All Markets and VAD Markets. Automatic Featured Markets remain a separate activity-based list.
                </VadText>
              </VadCard>
            ) : null}

            {pending.action !== 'REMOVE_VAD' ? (
              <View style={{ gap: 7 }}>
                <VadText variant="label">VAD Markets priority</VadText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {(['HIGH', 'STANDARD', 'LOW'] as Priority[]).map((option) => (
                    <VadChip
                      key={option}
                      label={option === 'HIGH' ? 'High' : option === 'STANDARD' ? 'Standard' : 'Low'}
                      selected={priority === option}
                      tone={priority === option ? 'brand' : 'neutral'}
                      onPress={() => setPriority(option)}
                    />
                  ))}
                </View>
                <VadText variant="caption" tone="tertiary">Higher-priority VAD Markets appear earlier in the horizontal collection.</VadText>
              </View>
            ) : null}

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
              label={actionButtonLabel(pending.action)}
              variant={pending.action === 'REMOVE_VAD' ? 'secondary' : 'primary'}
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

function MarketSection({
  title,
  count,
  countTone,
  children,
}: {
  title: string;
  count: number;
  countTone: 'brand' | 'yes' | 'warning' | 'neutral';
  children: ReactNode;
}) {
  const theme = useVadTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <VadText variant="heading">{title}</VadText>
        <VadChip label={String(count)} tone={countTone} />
      </View>
      <View style={{ gap: theme.spacing.sm }}>{children}</View>
    </View>
  );
}

function MarketRow({
  row,
  badge,
  badgeTone = 'neutral',
  children,
}: {
  row: AdminMarketPublicationRow;
  badge?: string;
  badgeTone?: 'brand' | 'yes' | 'warning' | 'neutral';
  children?: ReactNode;
}) {
  const theme = useVadTheme();
  return (
    <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 200, gap: 3 }}>
          <VadText variant="bodyStrong">{row.title}</VadText>
          <VadText variant="caption" tone="secondary">{row.category} · {row.asset_code}</VadText>
          <VadText variant="caption" tone="tertiary">
            {row.opens_at ? `Opens ${new Date(row.opens_at).toLocaleString()} · ` : ''}closes {new Date(row.closes_at).toLocaleString()}
          </VadText>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <VadChip label={friendlyStatus(row.instrument_status)} tone={row.instrument_status === 'OPEN' ? 'yes' : 'neutral'} />
          {badge ? <VadChip label={badge} tone={badgeTone} /> : null}
        </View>
      </View>
      {children}
    </VadCard>
  );
}

function priorityFromValue(value: number | null): Priority {
  if (value != null && value <= 25) return 'HIGH';
  if (value != null && value >= 300) return 'LOW';
  return 'STANDARD';
}

function actionTitle(action?: Action) {
  if (action === 'PUBLISH') return 'Publish market';
  if (action === 'ADD_VAD') return 'Add to VAD Markets';
  if (action === 'UPDATE_VAD') return 'Change VAD Markets priority';
  if (action === 'REMOVE_VAD') return 'Remove from VAD Markets';
  return 'Market action';
}

function actionButtonLabel(action: Action) {
  if (action === 'PUBLISH') return 'Publish market';
  if (action === 'ADD_VAD') return 'Add to VAD Markets';
  if (action === 'UPDATE_VAD') return 'Save priority';
  return 'Remove from VAD Markets';
}

function friendlyStatus(status: string) {
  if (status === 'OPEN') return 'LIVE';
  if (status === 'DRAFT') return 'READY';
  if (status === 'SUSPENDED') return 'PAUSED';
  return status;
}

function formatNaira(value: number) {
  return `₦${Math.round(Number(value) || 0).toLocaleString('en-NG')}`;
}
