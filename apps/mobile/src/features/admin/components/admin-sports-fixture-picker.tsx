import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getAdminProviderCompetitions,
  getAdminProviderFixtures,
  getAdminProviderSeasons,
  getAdminProviderSports,
  getAdminSportsProviders,
  type AdminSportsCompetitionOption,
  type AdminSportsFixture,
  type AdminSportsFixturePage,
  type AdminSportsOption,
  type AdminSportsProvider,
  type AdminSportsSeasonOption,
} from '@/services/admin-sports-fixture-api';

type SelectorKind = 'provider' | 'sport' | 'competition' | 'season' | null;
type Props = {
  sportCode?: string;
  competitionCode?: string;
  competitionName?: string;
  providerCode?: string | null;
  providerCompetitionCode?: string | null;
  selectedFixtureId?: string | null;
  onSelect: (fixture: AdminSportsFixture, cacheKey: string) => void;
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
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function AdminSportsFixturePicker({
  providerCode: initialProviderCode,
  sportCode: initialSportCode,
  competitionCode: initialCompetitionCode,
  competitionName: initialCompetitionName,
  selectedFixtureId,
  onSelect,
}: Props) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [providers, setProviders] = useState<AdminSportsProvider[]>([]);
  const [sports, setSports] = useState<AdminSportsOption[]>([]);
  const [competitions, setCompetitions] = useState<AdminSportsCompetitionOption[]>([]);
  const [seasons, setSeasons] = useState<AdminSportsSeasonOption[]>([]);
  const [selectedProviderCode, setSelectedProviderCode] = useState(initialProviderCode?.trim().toUpperCase() || 'THESPORTSDB');
  const [selectedSportCode, setSelectedSportCode] = useState(initialSportCode?.trim().toUpperCase() || '');
  const [selectedCompetitionCode, setSelectedCompetitionCode] = useState(initialCompetitionCode?.trim() || '');
  const [selectedSeasonCode, setSelectedSeasonCode] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [query, setQuery] = useState('');
  const [selector, setSelector] = useState<SelectorKind>(null);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [loadingSports, setLoadingSports] = useState(false);
  const [loadingCompetitions, setLoadingCompetitions] = useState(false);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [loadingFixtures, setLoadingFixtures] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [fixtureError, setFixtureError] = useState<string | null>(null);
  const [fixturePage, setFixturePage] = useState<AdminSportsFixturePage | null>(null);
  const providersRequest = useRef(0);
  const sportsRequest = useRef(0);
  const competitionRequest = useRef(0);
  const seasonRequest = useRef(0);
  const fixtureRequest = useRef(0);

  const provider = providers.find((item) => item.code.toUpperCase() === selectedProviderCode) ?? null;
  const sport = sports.find((item) => item.code.toUpperCase() === selectedSportCode) ?? null;
  const competition = competitions.find((item) => item.code === selectedCompetitionCode) ?? null;
  const season = seasons.find((item) => item.code === selectedSeasonCode) ?? null;

  useEffect(() => {
    const timer = setTimeout(() => {
      const requestId = ++providersRequest.current;
      setLoadingProviders(true);
      setCatalogError(null);
      void getAdminSportsProviders().then((result) => {
        if (requestId !== providersRequest.current) return;
        setProviders(result);
        setSelectedProviderCode((current) => {
          const preferred = result.find((item) => item.code.toUpperCase() === current);
          return preferred?.code.toUpperCase() ?? result.find((item) => item.code.toUpperCase() === 'THESPORTSDB')?.code.toUpperCase() ?? result[0]?.code.toUpperCase() ?? '';
        });
      }).catch((error: unknown) => {
        if (requestId === providersRequest.current) setCatalogError(error instanceof Error ? error.message : 'Sports providers could not be loaded.');
      }).finally(() => {
        if (requestId === providersRequest.current) setLoadingProviders(false);
      });
    }, 0);
    return () => {
      clearTimeout(timer);
      providersRequest.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!selectedProviderCode) return;
    const requestId = ++sportsRequest.current;
    const timer = setTimeout(() => {
      setLoadingSports(true);
      setCatalogError(null);
      void getAdminProviderSports(selectedProviderCode).then((result) => {
        if (requestId !== sportsRequest.current) return;
        setSports(result);
        setSelectedSportCode((current) => {
          const existing = result.find((item) => item.code.toUpperCase() === current);
          return existing?.code.toUpperCase() ?? '';
        });
        setCompetitions([]);
        setSeasons([]);
        setSelectedCompetitionCode('');
        setSelectedSeasonCode('');
        setFixturePage(null);
      }).catch((error: unknown) => {
        if (requestId === sportsRequest.current) setCatalogError(error instanceof Error ? error.message : 'Sports could not be loaded.');
      }).finally(() => {
        if (requestId === sportsRequest.current) setLoadingSports(false);
      });
    }, 0);
    return () => {
      clearTimeout(timer);
      sportsRequest.current += 1;
    };
  }, [selectedProviderCode]);

  useEffect(() => {
    if (!selectedProviderCode || !sport) return;
    const requestId = ++competitionRequest.current;
    const timer = setTimeout(() => {
      setLoadingCompetitions(true);
      setCatalogError(null);
      void getAdminProviderCompetitions({
        providerCode: selectedProviderCode,
        sportCode: sport.code,
        providerSportCode: sport.providerSportCode,
        countryCode: countrySearch,
      }).then((result) => {
        if (requestId !== competitionRequest.current) return;
        setCompetitions(result);
        setSeasons([]);
        setSelectedSeasonCode('');
        setFixturePage(null);
        setSelectedCompetitionCode((current) => {
          const existing = result.find((item) => item.code === current);
          if (existing) return existing.code;
          const preferred = initialCompetitionCode
            ? result.find((item) => item.code === initialCompetitionCode || item.name.toLowerCase() === initialCompetitionName?.toLowerCase())
            : undefined;
          return preferred?.code ?? '';
        });
      }).catch((error: unknown) => {
        if (requestId === competitionRequest.current) setCatalogError(error instanceof Error ? error.message : 'Competitions could not be loaded.');
      }).finally(() => {
        if (requestId === competitionRequest.current) setLoadingCompetitions(false);
      });
    }, 0);
    return () => {
      clearTimeout(timer);
      competitionRequest.current += 1;
    };
  }, [selectedProviderCode, sport?.code, sport?.providerSportCode, countrySearch, initialCompetitionCode, initialCompetitionName]);

  useEffect(() => {
    if (!selectedProviderCode || !sport || !competition) return;
    const requestId = ++seasonRequest.current;
    const timer = setTimeout(() => {
      setLoadingSeasons(true);
      setCatalogError(null);
      void getAdminProviderSeasons({
        providerCode: selectedProviderCode,
        sportCode: sport.code,
        competitionCode: competition.providerCompetitionCode || competition.code,
      }).then((result) => {
        if (requestId !== seasonRequest.current) return;
        setSeasons(result);
        setSelectedSeasonCode((current) => {
          const existing = result.find((item) => item.code === current);
          return existing?.code ?? result.find((item) => item.current)?.code ?? result[0]?.code ?? '';
        });
        setFixturePage(null);
      }).catch((error: unknown) => {
        if (requestId === seasonRequest.current) setCatalogError(error instanceof Error ? error.message : 'Seasons could not be loaded.');
      }).finally(() => {
        if (requestId === seasonRequest.current) setLoadingSeasons(false);
      });
    }, 0);
    return () => {
      clearTimeout(timer);
      seasonRequest.current += 1;
    };
  }, [selectedProviderCode, sport?.code, competition?.code, competition?.providerCompetitionCode]);

  async function loadFixtures(forceRefresh = false) {
    if (!provider || !sport || !competition || !season) return;
    const requestId = ++fixtureRequest.current;
    setLoadingFixtures(true);
    setFixtureError(null);
    try {
      const result = await getAdminProviderFixtures({
        providerCode: provider.code,
        sportCode: sport.code,
        competitionCode: competition.providerCompetitionCode || competition.code,
        competitionName: competition.name,
        seasonCode: season.code,
        fromDate: isoDate(new Date()),
        toDate: rangeEnd(30),
        forceRefresh,
      });
      if (requestId === fixtureRequest.current) setFixturePage(result);
    } catch (error) {
      if (requestId === fixtureRequest.current) {
        setFixtureError(error instanceof Error ? error.message : 'Upcoming fixtures could not be loaded.');
        setFixturePage(null);
      }
    } finally {
      if (requestId === fixtureRequest.current) setLoadingFixtures(false);
    }
  }

  const selectionOptions = useMemo(() => {
    let items: { code: string; label: string; description?: string }[] = [];
    if (selector === 'provider') items = providers.map((item) => ({ code: item.code, label: item.name, description: item.note }));
    if (selector === 'sport') items = sports.map((item) => ({ code: item.code, label: item.name }));
    if (selector === 'competition') items = competitions.map((item) => ({ code: item.code, label: item.name, description: item.region ?? undefined }));
    if (selector === 'season') items = seasons.map((item) => ({ code: item.code, label: item.name, description: item.current ? 'Current season' : undefined }));
    const term = query.trim().toLocaleLowerCase();
    return items.filter((item) => !term || (item.label + ' ' + item.code + ' ' + (item.description ?? '')).toLocaleLowerCase().includes(term));
  }, [selector, providers, sports, competitions, seasons, query]);

  const selectorTitle = selector === 'provider' ? 'Choose sports data provider'
    : selector === 'sport' ? 'Choose a sport'
      : selector === 'competition' ? 'Choose a league or competition'
        : selector === 'season' ? 'Choose a season' : '';

  function chooseOption(code: string) {
    if (selector === 'provider') {
      setSelectedProviderCode(code.toUpperCase());
      setSelectedSportCode('');
      setCompetitions([]);
      setSelectedCompetitionCode('');
      setSeasons([]);
      setSelectedSeasonCode('');
      setFixturePage(null);
    } else if (selector === 'sport') {
      setSelectedSportCode(code.toUpperCase());
      setCompetitions([]);
      setSelectedCompetitionCode('');
      setSeasons([]);
      setSelectedSeasonCode('');
      setFixturePage(null);
    } else if (selector === 'competition') {
      setSelectedCompetitionCode(code);
      setSeasons([]);
      setSelectedSeasonCode('');
      setFixturePage(null);
    } else if (selector === 'season') {
      setSelectedSeasonCode(code);
      setFixturePage(null);
    }
    setQuery('');
    setSelector(null);
  }

  function selectorButton(title: string, value: string, disabled: boolean, onPress: () => void) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => ({
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: density.phone ? 12 : 14,
          paddingVertical: density.phone ? 10 : 12,
          backgroundColor: theme.colors.surface,
          opacity: disabled ? 0.5 : pressed ? 0.72 : 1,
          gap: 3,
        })}
      >
        <VadText variant="caption" tone="secondary">{title}</VadText>
        <VadText variant="bodyStrong" numberOfLines={2}>{value || 'Select…'}</VadText>
      </Pressable>
    );
  }

  return (
    <VadCard variant="muted" style={{ gap: theme.spacing.md }}>
      <View style={{ gap: 4 }}>
        <VadText variant="bodyStrong">Find an upcoming sports fixture</VadText>
        <VadText variant="caption" tone="secondary">
          Choose a data source, sport, competition and season. VAD fills in the event details; the fixture feed is for discovery only and does not settle markets.
        </VadText>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        {selectorButton('Data provider', provider?.name ?? (loadingProviders ? 'Loading providers…' : ''), loadingProviders || !providers.length, () => { setQuery(''); setSelector('provider'); })}
        {selectorButton('Sport', sport?.name ?? (loadingSports ? 'Loading sports…' : ''), !provider || loadingSports || !sports.length, () => { setQuery(''); setSelector('sport'); })}
        {selectorButton('League / competition', competition?.name ?? (loadingCompetitions ? 'Loading competitions…' : ''), !sport || loadingCompetitions || !competitions.length, () => { setQuery(''); setSelector('competition'); })}
        {selectorButton('Season', season?.name ?? (loadingSeasons ? 'Loading seasons…' : ''), !competition || loadingSeasons || !seasons.length, () => { setQuery(''); setSelector('season'); })}
      </View>

      {provider?.note ? <VadText variant="caption" tone="secondary">Source: {provider.note}</VadText> : null}
      {sport?.name === 'Soccer' ? <VadText variant="caption" tone="secondary">Football is mapped internally as FOOTBALL for VAD.</VadText> : null}

      {(selector === 'competition' && provider?.adapter === 'THESPORTSDB_V1') ? (
        <VadInput label="Filter competitions by country · optional" value={countrySearch} onChangeText={setCountrySearch} placeholder="England, Spain, Germany…" />
      ) : null}

      <VadButton
        label={loadingFixtures ? 'Loading upcoming fixtures…' : fixturePage ? 'Refresh upcoming fixtures' : 'Load upcoming fixtures'}
        onPress={() => void loadFixtures(Boolean(fixturePage))}
        disabled={!provider || !sport || !competition || !season || loadingFixtures}
        loading={loadingFixtures}
      />
      {catalogError ? <VadText variant="caption" tone="warning">{catalogError}</VadText> : null}
      {fixtureError ? <VadText variant="caption" tone="warning">{fixtureError}</VadText> : null}

      {fixturePage ? (
        <View style={{ gap: theme.spacing.sm }}>
          <VadText variant="caption" tone="secondary">
            Source: {fixturePage.source}{fixturePage.cached ? ' · cached' : ''}{fixturePage.stale ? ' · stale cache' : ''} · Season: {season?.name ?? fixturePage.seasonCode}
          </VadText>
          {fixturePage.fixtures.length ? fixturePage.fixtures.map((fixture) => {
            const selected = fixture.fixtureId === selectedFixtureId;
            return (
              <VadCard
                key={fixturePage.providerCode + ':' + fixture.fixtureId}
                variant={selected ? 'raised' : 'surface'}
                style={{ gap: theme.spacing.sm, borderWidth: 1, borderColor: selected ? theme.colors.brandPrimary : theme.colors.border }}
              >
                <View style={{ gap: 4 }}>
                  <VadText variant="bodyStrong">{fixture.homeTeam} vs {fixture.awayTeam}</VadText>
                  <VadText variant="caption" tone="secondary">{kickoffLabel(fixture.startsAt)}</VadText>
                  <VadText variant="caption" tone="secondary">
                    {fixture.competitionName}{fixture.stage ? ' · ' + fixture.stage : ''}{fixture.matchday ? ' · Matchday ' + fixture.matchday : ''}
                  </VadText>
                  {fixture.venue ? <VadText variant="caption" tone="secondary">{fixture.venue}</VadText> : null}
                  <VadText variant="caption" tone="secondary">Event ID: {fixture.fixtureId} · {fixture.status}</VadText>
                </View>
                <VadButton
                  label={selected ? 'Fixture selected' : 'Use this fixture'}
                  onPress={() => onSelect(fixture, fixturePage.cacheKey)}
                  disabled={selected || !fixture.isUpcoming}
                  variant={selected ? 'primary' : 'secondary'}
                />
              </VadCard>
            );
          }) : (
            <VadText variant="caption" tone="secondary">
              No upcoming events were returned for this selected season and date range. Try another season or provider.
            </VadText>
          )}
        </View>
      ) : null}

      <VadBottomSheet visible={Boolean(selector)} title={selectorTitle} onClose={() => { setSelector(null); setQuery(''); }}>
        <View style={{ gap: theme.spacing.sm }}>
          <VadInput
            label="Search"
            value={query}
            onChangeText={setQuery}
            placeholder={selector === 'provider' ? 'Search provider…' : selector === 'sport' ? 'Search sport…' : selector === 'competition' ? 'Search league…' : 'Search season…'}
            autoCapitalize="none"
          />
          {selectionOptions.length ? selectionOptions.map((item) => (
            <Pressable
              key={item.code}
              onPress={() => chooseOption(item.code)}
              style={({ pressed }) => ({
                padding: theme.spacing.md,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
                gap: 3,
              })}
            >
              <VadText variant="bodyStrong">{item.label}</VadText>
              {item.description ? <VadText variant="caption" tone="secondary">{item.description}</VadText> : null}
            </Pressable>
          )) : (
            <VadText variant="caption" tone="secondary">No matching options from this provider.</VadText>
          )}
        </View>
      </VadBottomSheet>
    </VadCard>
  );
}
