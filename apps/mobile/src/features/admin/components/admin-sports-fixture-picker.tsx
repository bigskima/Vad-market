import { useRef, useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadText } from '@/components/ui/vad-text';
import {
  getAdminSportsFixtures,
  type AdminSportsFixture,
} from '@/services/admin-sports-fixture-api';
import { useVadTheme } from '@/providers/theme-provider';
import { formatDateTimeInDeviceZone } from '@/lib/time-zone';

type FixturePage = Awaited<ReturnType<typeof getAdminSportsFixtures>>;

export type FootballBulkPublishReport = {
  published: number;
  alreadyAvailable: number;
  failed: { fixture: string; reason: string }[];
};

type Props = {
  sportCode: string;
  competitionCode: string;
  competitionName: string;
  providerCode?: string | null;
  providerCompetitionCode?: string | null;
  selectedFixtureId?: string | null;
  onSelect: (fixture: AdminSportsFixture, cacheKey: string) => void;
  onBulkCreate?: (fixtures: AdminSportsFixture[]) => Promise<FootballBulkPublishReport>;
  automaticPublishingAvailable?: boolean;
  bulkCreateDisabledReason?: string | null;
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function rangeEnd(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function kickoffLabel(value: string) {
  return formatDateTimeInDeviceZone(value);
}

export function AdminSportsFixturePicker({
  sportCode,
  competitionCode,
  competitionName,
  providerCode,
  providerCompetitionCode,
  selectedFixtureId,
  onSelect,
  onBulkCreate,
  automaticPublishingAvailable = false,
  bulkCreateDisabledReason,
}: Props) {
  const theme = useVadTheme();
  const [daysAhead, setDaysAhead] = useState<7 | 14>(7);
  const [pageState, setPageState] = useState<{ selectionKey: string; page: FixturePage } | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState<{ selectionKey: string; message: string } | null>(null);
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkReport, setBulkReport] = useState<FootballBulkPublishReport | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const selectionKey = [
    sportCode.trim().toUpperCase(),
    competitionCode.trim().toUpperCase(),
    providerCode?.trim().toUpperCase() ?? '',
    providerCompetitionCode?.trim().toUpperCase() ?? '',
  ].join(':');
  const page = pageState?.selectionKey === selectionKey ? pageState.page : null;
  const error = errorState?.selectionKey === selectionKey ? errorState.message : null;
  const upcomingFixtures = (page?.fixtures ?? []).filter((fixture) =>
    fixture.isUpcoming && Number.isFinite(Date.parse(fixture.startsAt)) && Date.parse(fixture.startsAt) > Date.now()
  );

  async function runBulkCreate() {
    if (!onBulkCreate || bulkWorking || !upcomingFixtures.length) return;
    setBulkWorking(true);
    setBulkError(null);
    setBulkReport(null);
    try {
      const result = await onBulkCreate(upcomingFixtures);
      setBulkReport(result);
      setBulkConfirming(false);
    } catch (value) {
      setBulkError(value instanceof Error ? value.message : 'VAD could not publish the fixture markets.');
    } finally {
      setBulkWorking(false);
    }
  }

  const mappingReady = Boolean(
    sportCode.trim()
    && competitionCode.trim()
    && providerCode?.trim()
    && providerCompetitionCode?.trim()
  );

  async function loadFixtures() {
    if (!mappingReady) return;
    const requestId = ++requestRef.current;
    const requestedSelectionKey = selectionKey;
    setLoading(true);
    setErrorState(null);
    try {
      const today = isoDate(new Date());
      const result = await getAdminSportsFixtures({
        sportCode,
        competitionCode,
        fromDate: today,
        toDate: rangeEnd(daysAhead),
        forceRefresh: Boolean(page),
      });
      if (requestId === requestRef.current) {
        setPageState({ selectionKey: requestedSelectionKey, page: result });
      }
    } catch (value) {
      if (requestId === requestRef.current) {
        setErrorState({
          selectionKey: requestedSelectionKey,
          message: value instanceof Error ? value.message : 'Upcoming fixtures could not be loaded.',
        });
        setPageState(null);
      }
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  return (
    <VadCard variant="muted" style={{ gap: theme.spacing.md }}>
      <View style={{ gap: 4 }}>
        <VadText variant="bodyStrong">Upcoming fixtures</VadText>
        <VadText variant="caption" tone="secondary">
          {competitionName
            ? 'Choose a real ' + competitionName + ' event. Team names and kickoff time will fill automatically.'
            : 'Choose a competition to discover upcoming fixtures.'}
        </VadText>
      </View>

      {!mappingReady ? (
        <VadText variant="caption" tone="warning">
          {competitionCode
            ? 'Fixture import is not mapped to an active provider for this competition. Configure a provider and external competition code in Admin Sports Catalogue.'
            : 'Choose a sport and competition first.'}
        </VadText>
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            <VadChip label="Next 7 days" selected={daysAhead === 7} onPress={() => { setDaysAhead(7); setPageState(null); }} />
            <VadChip label="Next 14 days" selected={daysAhead === 14} onPress={() => { setDaysAhead(14); setPageState(null); }} />
          </View>
          <VadButton
            label={loading ? 'Loading fixtures…' : page ? 'Refresh from provider' : 'Load upcoming fixtures'}
            onPress={() => void loadFixtures()}
            disabled={loading}
            variant="secondary"
          />
          {page ? <VadText variant="caption" tone="secondary">Refreshing calls the configured provider and uses one request from VAD’s daily budget; initial loads reuse cached results.</VadText> : null}
          {error ? <VadText variant="caption" tone="warning">{error}</VadText> : null}
          {page ? (
            <View style={{ gap: theme.spacing.sm }}>
              <VadText variant="caption" tone="secondary">
                Source: {page.source}{page.cached ? ' · cached response' : ''}{page.stale ? ' · older cached data' : ''}
              </VadText>
              {page.fixtures.length ? page.fixtures.map((fixture) => {
                const selected = fixture.fixtureId === selectedFixtureId;
                return (
                  <VadCard
                    key={page.source + ':' + fixture.fixtureId}
                    variant={selected ? 'raised' : 'surface'}
                    style={{
                      gap: theme.spacing.sm,
                      borderWidth: 1,
                      borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
                    }}
                  >
                    <View style={{ gap: 4 }}>
                      <VadText variant="bodyStrong">{fixture.homeTeam} vs {fixture.awayTeam}</VadText>
                      <VadText variant="caption" tone="secondary">{kickoffLabel(fixture.startsAt)}</VadText>
                      <VadText variant="caption" tone="secondary">
                        {fixture.competitionName}{fixture.matchday ? ' · Matchday ' + fixture.matchday : ''}
                      </VadText>
                      {fixture.venue ? <VadText variant="caption" tone="secondary">{fixture.venue}</VadText> : null}
                      <VadText variant="caption" tone="secondary">Fixture ID: {fixture.fixtureId} · {fixture.status}</VadText>
                    </View>
                    <VadButton
                      label={selected ? 'Fixture selected' : 'Use this fixture'}
                      onPress={() => onSelect(fixture, page.cacheKey)}
                      disabled={selected || !fixture.isUpcoming}
                      variant={selected ? 'primary' : 'secondary'}
                    />
                  </VadCard>
                );
              }) : (
                <VadText variant="caption" tone="secondary">
                  No upcoming fixtures were returned for this date range. Try 14 days or choose another competition supported by the configured provider.
                </VadText>
              )}
            </View>
          ) : null}
        </>
      )}
    </VadCard>
  );
}
