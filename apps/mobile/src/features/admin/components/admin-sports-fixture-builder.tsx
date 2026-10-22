import { useMemo, useState } from 'react';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import type { SportsMarketTaxonomy } from '@/services/admin-guided-market-catalog-api';
import {
  discoverSportsFixtures,
  draftSportsMarketsWithAI,
  type AIDraftedMarket,
  type ProviderFixture,
} from '@/services/market-provider-gateway-api';
import { useVadTheme } from '@/providers/theme-provider';

type Props = {
  taxonomy: SportsMarketTaxonomy;
  onUseDraft: (draft: AIDraftedMarket) => void;
};

function localDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}
function plusDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

export function AdminSportsFixtureBuilder({ taxonomy, onUseDraft }: Props) {
  const theme = useVadTheme();
  const sports = taxonomy.sports.filter((sport) => sport.status === 'ACTIVE');
  const [sportCode, setSportCode] = useState(sports[0]?.code ?? '');
  const [competitionCode, setCompetitionCode] = useState('');
  const [dateFrom, setDateFrom] = useState(() => localDate(new Date()));
  const [dateTo, setDateTo] = useState(() => localDate(plusDays(new Date(), 14)));
  const [search, setSearch] = useState('');
  const [events, setEvents] = useState<ProviderFixture[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<AIDraftedMarket[]>([]);
  const [selectedDraft, setSelectedDraft] = useState<string | null>(null);
  const [source, setSource] = useState('');
  const [aiInfo, setAiInfo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const sport = sports.find((item) => item.code === sportCode) ?? null;
  const competitions = useMemo(
    () => taxonomy.competitions.filter((item) => item.status === 'ACTIVE' && item.sportCode === sportCode),
    [taxonomy.competitions, sportCode],
  );
  const competition = competitions.find((item) => item.code === competitionCode) ?? competitions[0] ?? null;
  const mapped = Boolean(competition?.fixtureProviderCode && competition?.fixtureCompetitionCode);

  function chooseSport(next: string) {
    setSportCode(next);
    setCompetitionCode('');
    setEvents([]);
    setSelected([]);
    setSuggestions([]);
    setSelectedDraft(null);
    setSource('');
    setError(null);
  }
  function chooseCompetition(next: string) {
    setCompetitionCode(next);
    setEvents([]);
    setSelected([]);
    setSuggestions([]);
    setSelectedDraft(null);
    setSource('');
    setError(null);
  }
  function toggleEvent(eventId: string) {
    setSelected((current) => {
      if (current.includes(eventId)) return current.filter((item) => item !== eventId);
      if (current.length >= 10) {
        setError('Select up to 10 fixtures per AI drafting run.');
        return current;
      }
      setError(null);
      return [...current, eventId];
    });
  }
  async function loadFixtures() {
    if (!sport || !competition || !mapped) {
      setError('This competition has no fixture provider mapping yet. Configure it in Admin → Providers before importing fixtures.');
      return;
    }
    setWorking(true);
    setError(null);
    setSuggestions([]);
    setSelectedDraft(null);
    try {
      const result = await discoverSportsFixtures({
        sportCode,
        competitionCode: competition.code,
        dateFrom,
        dateTo,
        search,
        limit: 120,
      });
      setEvents(result.events ?? []);
      setSelected([]);
      setSource(result.source + ' · imported ' + result.importedCount + ' fixtures');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not import fixtures.');
    } finally {
      setWorking(false);
    }
  }
  async function generateDrafts() {
    if (!selected.length || working) return;
    setWorking(true);
    setError(null);
    try {
      const result = await draftSportsMarketsWithAI(selected);
      setSuggestions(result.suggestions ?? []);
      setSelectedDraft(null);
      setAiInfo(result.aiProvider + ' · ' + result.aiModel + ' · ' + result.suggestionCount + ' draft suggestions');
      if (!result.suggestions?.length) setError('The AI provider returned no suitable market drafts.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'AI market drafting failed.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <VadCard variant="surface" style={{ gap: theme.spacing.md }}>
      <ViewHeading />
      <VadText variant="caption" tone="secondary">
        Pick a sport and competition from VAD’s database, import upcoming fixtures from its configured data provider, select up to ten events, then let AI draft market questions. This feed is for discovery only; VAD’s configured Oracle workflow remains the settlement authority.
      </VadText>
      <ViewField label="Sport">
        <ViewChips>
          {sports.map((item) => (
            <VadChip key={item.code} label={item.name} selected={sportCode === item.code} tone={sportCode === item.code ? 'brand' : 'neutral'} onPress={() => chooseSport(item.code)} />
          ))}
        </ViewChips>
      </ViewField>
      <ViewField label="Competition / league">
        {competitions.length ? (
          <ViewChips>
            {competitions.map((item) => (
              <VadChip key={item.code} label={item.name} selected={competition?.code === item.code} tone={competition?.code === item.code ? 'brand' : 'neutral'} onPress={() => chooseCompetition(item.code)} />
            ))}
          </ViewChips>
        ) : <VadText variant="caption" tone="secondary">No active competitions are configured for this sport yet. Add one in the sports catalogue.</VadText>}
      </ViewField>
      {competition ? (
        <VadCard variant="muted" style={{ gap: 4 }}>
          <VadText variant="caption" tone={mapped ? 'yes' : 'warning'}>
            {mapped ? 'Fixture source configured · ' + competition.fixtureProviderCode : 'Fixture source not configured'}
          </VadText>
          <VadText variant="caption" tone="secondary">
            Outcome source: {competition.providerCode ?? 'Manual verified source'} · {competition.resultMode}. Fixture source and outcome source are configured separately.
          </VadText>
        </VadCard>
      ) : null}
      <ViewField label="Fixture date range (YYYY-MM-DD)">
        <ViewChips>
          <VadInput label="From" value={dateFrom} onChangeText={setDateFrom} placeholder="2026-10-22" />
          <VadInput label="To" value={dateTo} onChangeText={setDateTo} placeholder="2026-11-05" />
        </ViewChips>
      </ViewField>
      <VadInput label="Find team / athlete (optional)" value={search} onChangeText={setSearch} placeholder="Search team, player or matchup" />
      <VadButton label={working ? 'Working…' : 'Import upcoming fixtures'} onPress={() => void loadFixtures()} disabled={working || !mapped || !competition} />
      {source ? <VadText variant="caption" tone="secondary">{source}</VadText> : null}
      {events.length ? (
        <View style={{ gap: theme.spacing.sm }}>
          <VadText variant="bodyStrong">Imported fixtures · choose up to 10</VadText>
          {events.map((event) => {
            const isSelected = selected.includes(event.publicId);
            return (
              <VadCard key={event.publicId} variant="surface" style={{ gap: 6, borderColor: isSelected ? theme.colors.brandPrimary : theme.colors.border }}>
                <ViewChips>
                  <VadChip label={isSelected ? 'Selected' : 'Select'} selected={isSelected} tone={isSelected ? 'brand' : 'neutral'} onPress={() => toggleEvent(event.publicId)} />
                  <VadChip label={event.status.replaceAll('_', ' ')} tone="neutral" />
                </ViewChips>
                <VadText variant="bodyStrong">{event.participantA} vs {event.participantB}</VadText>
                <VadText variant="caption" tone="secondary">{event.competitionName} · {new Date(event.startsAt).toLocaleString()}</VadText>
                {event.venue ? <VadText variant="caption" tone="tertiary">{event.venue}</VadText> : null}
              </VadCard>
            );
          })}
          <VadButton label={working ? 'Drafting with AI…' : 'Draft markets with AI (' + selected.length + ')'} onPress={() => void generateDrafts()} disabled={working || selected.length < 1} />
        </View>
      ) : null}
      {aiInfo ? <VadText variant="caption" tone="secondary">{aiInfo}</VadText> : null}
      {suggestions.length ? (
        <View style={{ gap: theme.spacing.sm }}>
          <VadText variant="bodyStrong">AI suggestions · human review required</VadText>
          {suggestions.map((draft, index) => {
            const key = draft.eventPublicId + ':' + draft.prediction;
            const active = selectedDraft === key;
            return (
              <VadCard key={key} variant="surface" style={{ gap: 7, borderColor: active ? theme.colors.brandPrimary : theme.colors.border }}>
                <ViewChips>
                  <VadChip label={draft.resultChecking === 'AUTOMATIC' ? 'Existing Oracle policy' : 'Verified source required'} tone={draft.resultChecking === 'AUTOMATIC' ? 'yes' : 'warning'} />
                  <VadChip label={Math.round(draft.confidence * 100) + '% AI confidence'} tone="neutral" />
                </ViewChips>
                <VadText variant="bodyStrong">{draft.title}</VadText>
                <VadText variant="caption" tone="secondary">{draft.description}</VadText>
                <VadText variant="caption" tone="secondary">Kickoff: {new Date(draft.startsAt).toLocaleString()}</VadText>
                {draft.riskFlags.length ? <VadText variant="caption" tone="warning">{draft.riskFlags.join(' · ')}</VadText> : null}
                <VadButton label={active ? 'Draft selected' : 'Use this draft in market form'} variant={active ? 'primary' : 'secondary'} onPress={() => { setSelectedDraft(key); onUseDraft(draft); }} />
              </VadCard>
            );
          })}
        </View>
      ) : null}
      {error ? <VadCard variant="muted" style={{ borderColor: theme.colors.no, gap: 4 }}><VadText variant="caption" tone="no">{error}</VadText></VadCard> : null}
    </VadCard>
  );
}

function ViewHeading() {
  return (
    <ViewField label="SPORTS · DATA IMPORT + AI" />
  );
}
function ViewField({ label, children }: { label: string; children?: React.ReactNode }) {
  const theme = useVadTheme();
  return (
    <View style={{ gap: 7 }}>
      <VadText variant="caption" tone="secondary" style={{ fontWeight: '700' }}>{label}</VadText>
      {children}
    </View>
  );
}
function ViewChips({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{children}</View>;
}
import { View } from 'react-native';
import type React from 'react';
