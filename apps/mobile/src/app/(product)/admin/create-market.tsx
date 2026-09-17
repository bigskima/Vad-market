import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadDateTimeField } from '@/components/ui/vad-date-time-field';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { useVadTheme } from '@/providers/theme-provider';
import {
  createAdminCustomMarket,
  createAdminGuidedMarket,
  getAdminMarketAutoOptions,
  type AdminGuidedMarketSetup,
  type AdminMarketAutoOptions,
} from '@/services/admin-market-approval-api';

const CATEGORIES = ['Politics', 'Sports', 'Crypto', 'Business', 'Economy', 'Technology', 'Entertainment', 'Science', 'World', 'Other'] as const;
type CreateStep = 1 | 2 | 3;
type CreationStyle = 'GUIDED' | 'CUSTOM';
type SportsMarketType = 'MATCH' | 'TRANSFER' | 'OTHER';
type PoliticsMarketType = 'ELECTION' | 'OTHER';
type ResultChecking = 'AUTOMATIC' | 'VERIFIED';
type MatchPrediction = 'HOME_WIN' | 'DRAW' | 'AWAY_WIN';
type PublicationChoice = 'DRAFT' | 'NOW';

export default function AdminCreateMarketRoute() {
  return (
    <AdminPermissionGate permissions={['markets.manage']}>
      <AdminRouteContainer>
        <AdminCreateMarketContent />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}

function AdminCreateMarketContent() {
  const theme = useVadTheme();
  const [options, setOptions] = useState<AdminMarketAutoOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Record<string, unknown> | null>(null);
  const [step, setStep] = useState<CreateStep>(1);
  const [creationStyle, setCreationStyle] = useState<CreationStyle>('GUIDED');
  const [publicationChoice, setPublicationChoice] = useState<PublicationChoice>('DRAFT');
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('Politics');
  const [countryCode, setCountryCode] = useState('');
  const [assetCode, setAssetCode] = useState('');
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [resolvesAfter, setResolvesAfter] = useState('');

  const [sportsMarketType, setSportsMarketType] = useState<SportsMarketType>('MATCH');
  const [competition, setCompetition] = useState('');
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [matchPrediction, setMatchPrediction] = useState<MatchPrediction>('HOME_WIN');
  const [resultChecking, setResultChecking] = useState<ResultChecking>('AUTOMATIC');
  const [matchReference, setMatchReference] = useState('');
  const [player, setPlayer] = useState('');
  const [destinationClub, setDestinationClub] = useState('');

  const [politicsMarketType, setPoliticsMarketType] = useState<PoliticsMarketType>('ELECTION');
  const [electionCountry, setElectionCountry] = useState('');
  const [electionOffice, setElectionOffice] = useState('');
  const [candidate, setCandidate] = useState('');
  const [electionLabel, setElectionLabel] = useState('');

  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [resultCondition, setResultCondition] = useState('');

  useEffect(() => {
    let ignore = false;
    void getAdminMarketAutoOptions()
      .then((next) => {
        if (!ignore) setOptions(next);
      })
      .catch((value) => {
        if (!ignore) setError(value instanceof Error ? value.message : 'Market options could not be loaded.');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => { ignore = true; };
  }, []);

  const resolvedCountryCode = countryCode || (options?.jurisdictions.length === 1 ? options.jurisdictions[0].countryCode : '');
  const jurisdiction = useMemo(
    () => options?.jurisdictions.find((item) => item.countryCode === resolvedCountryCode) ?? null,
    [options, resolvedCountryCode],
  );
  const resolvedAssetCode = assetCode || (jurisdiction?.assets.includes('TNGN') ? 'TNGN' : jurisdiction?.assets[0] ?? '');
  const sandbox = resolvedAssetCode === 'TNGN';
  const usesGuidedBackend = creationStyle === 'GUIDED' && category !== 'Crypto';
  const isAutomaticFootball = usesGuidedBackend && category === 'Sports' && sportsMarketType === 'MATCH' && resultChecking === 'AUTOMATIC';
  const automaticFootballAvailable = sandbox
    ? options?.guided.football.automaticSandboxAvailable === true
    : options?.guided.football.automaticProductionAvailable === true;

  const scheduleValid = [opensAt, closesAt, resolvesAfter].every((value) => value && Number.isFinite(Date.parse(value)))
    && Date.parse(closesAt) > Date.parse(opensAt)
    && Date.parse(resolvesAfter) >= Date.parse(closesAt);
  const canPublishNow = scheduleValid
    && Date.parse(opensAt) <= Date.now()
    && Date.parse(closesAt) > Date.now();

  const suggestedTitle = useMemo(() => {
    if (creationStyle !== 'GUIDED') return '';
    if (category === 'Sports' && sportsMarketType === 'MATCH' && homeTeam.trim() && awayTeam.trim()) {
      const suffix = competition.trim() ? ` in ${competition.trim()}` : '';
      if (matchPrediction === 'DRAW') return `Will ${homeTeam.trim()} vs ${awayTeam.trim()} end in a draw${suffix}?`;
      if (matchPrediction === 'AWAY_WIN') return `Will ${awayTeam.trim()} beat ${homeTeam.trim()}${suffix}?`;
      return `Will ${homeTeam.trim()} beat ${awayTeam.trim()}${suffix}?`;
    }
    if (category === 'Sports' && sportsMarketType === 'TRANSFER' && player.trim() && destinationClub.trim()) {
      return `Will ${player.trim()} join ${destinationClub.trim()}?`;
    }
    if (category === 'Politics' && politicsMarketType === 'ELECTION' && candidate.trim() && electionCountry.trim()) {
      const election = electionLabel.trim() || electionOffice.trim() || 'election';
      return `Will ${candidate.trim()} win the ${election} in ${electionCountry.trim()}?`;
    }
    return '';
  }, [awayTeam, candidate, category, competition, creationStyle, destinationClub, electionCountry, electionLabel, electionOffice, homeTeam, matchPrediction, player, politicsMarketType, sportsMarketType]);

  useEffect(() => {
    if (creationStyle === 'GUIDED' && !titleEdited && suggestedTitle) setTitle(suggestedTitle);
  }, [creationStyle, suggestedTitle, titleEdited]);

  function chooseCategory(item: (typeof CATEGORIES)[number]) {
    setCategory(item);
    setError(null);
    if (creationStyle === 'GUIDED') {
      setTitle('');
      setTitleEdited(false);
      setSourceName('');
      setSourceUrl('');
      setResultCondition('');
      if (item !== 'Sports') setResultChecking('VERIFIED');
      if (item === 'Sports' && sportsMarketType === 'MATCH') setResultChecking('AUTOMATIC');
    }
  }

  function chooseCreationStyle(next: CreationStyle) {
    setCreationStyle(next);
    setError(null);
    if (next === 'GUIDED') setTitleEdited(false);
  }

  function buildGuidedSetup(): AdminGuidedMarketSetup {
    if (category === 'Sports' && sportsMarketType === 'MATCH') {
      return {
        kind: 'FOOTBALL_MATCH',
        resultChecking,
        competition,
        homeTeam,
        awayTeam,
        prediction: matchPrediction,
        matchReference: resultChecking === 'AUTOMATIC' ? matchReference : undefined,
        sourceName: resultChecking === 'VERIFIED' ? sourceName : undefined,
        sourceUrl: resultChecking === 'VERIFIED' ? sourceUrl : undefined,
      };
    }
    if (category === 'Sports' && sportsMarketType === 'TRANSFER') {
      return {
        kind: 'PLAYER_TRANSFER',
        resultChecking: 'VERIFIED',
        player,
        destinationClub,
        sourceName,
        sourceUrl,
      };
    }
    if (category === 'Sports') {
      return { kind: 'SPORTS_EVENT', resultChecking: 'VERIFIED', condition: resultCondition, sourceName, sourceUrl };
    }
    if (category === 'Politics' && politicsMarketType === 'ELECTION') {
      return {
        kind: 'ELECTION_WINNER',
        resultChecking: 'VERIFIED',
        country: electionCountry,
        office: electionOffice,
        candidate,
        electionLabel,
        sourceName,
        sourceUrl,
      };
    }
    if (category === 'Politics') {
      return { kind: 'POLITICAL_EVENT', resultChecking: 'VERIFIED', condition: resultCondition, sourceName, sourceUrl };
    }
    return { kind: 'OBJECTIVE_EVENT', resultChecking: 'VERIFIED', condition: resultCondition, sourceName, sourceUrl };
  }

  function continueFromDetails() {
    setError(null);
    if (!title.trim()) {
      setError('Enter the market question before continuing.');
      return;
    }
    if (!usesGuidedBackend) {
      setStep(2);
      return;
    }
    if (category === 'Sports' && sportsMarketType === 'MATCH') {
      if (!competition.trim() || !homeTeam.trim() || !awayTeam.trim()) {
        setError('Add the competition, home team and away team.');
        return;
      }
      if (resultChecking === 'AUTOMATIC' && !matchReference.trim()) {
        setError('Add the Football-Data match reference for automatic result checking.');
        return;
      }
      if (resultChecking === 'VERIFIED' && !sourceName.trim()) {
        setError('Add the official result source VAD should use.');
        return;
      }
    } else if (category === 'Sports' && sportsMarketType === 'TRANSFER') {
      if (!player.trim() || !destinationClub.trim() || !sourceName.trim()) {
        setError('Add the player, destination club and official result source.');
        return;
      }
    } else if (category === 'Politics' && politicsMarketType === 'ELECTION') {
      if (!electionCountry.trim() || !electionOffice.trim() || !candidate.trim() || !sourceName.trim()) {
        setError('Add the country, office, candidate and official election result source.');
        return;
      }
    } else if (!sourceName.trim()) {
      setError('Add the authoritative result source VAD should use.');
      return;
    }
    setStep(2);
  }

  function continueFromSetup() {
    setError(null);
    if (!resolvedCountryCode || !resolvedAssetCode) {
      setError('Choose a market currency before continuing.');
      return;
    }
    if (![opensAt, closesAt, resolvesAfter].every((value) => value && Number.isFinite(Date.parse(value)))) {
      setError('Choose the opening, closing and result-checking times.');
      return;
    }
    if (Date.parse(closesAt) <= Date.parse(opensAt)) {
      setError('Closing time must be after opening time.');
      return;
    }
    if (Date.parse(resolvesAfter) < Date.parse(closesAt)) {
      setError('Result checking cannot begin before market close.');
      return;
    }
    if (isAutomaticFootball && !automaticFootballAvailable) {
      setError('Automatic football results are not enabled for this currency yet. Go back and choose Verified result, or choose a supported test currency.');
      return;
    }
    setStep(3);
  }

  async function createMarket() {
    if (working || !scheduleValid) return;
    if (publicationChoice === 'NOW' && !canPublishNow) {
      setError('Publish now needs an opening time that has already started and a closing time still in the future.');
      return;
    }
    setError(null);
    setCreated(null);
    setWorking(true);
    try {
      const shared = {
        title,
        description,
        category,
        opensAt: new Date(opensAt).toISOString(),
        closesAt: new Date(closesAt).toISOString(),
        resolvesAfter: new Date(resolvesAfter).toISOString(),
        countryCode: resolvedCountryCode,
        assetCode: resolvedAssetCode,
        publishNow: publicationChoice === 'NOW',
      };
      const next = usesGuidedBackend
        ? await createAdminGuidedMarket({ ...shared, setup: buildGuidedSetup() })
        : await createAdminCustomMarket(shared);
      setCreated(next);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'VAD market could not be created.');
    } finally {
      setWorking(false);
    }
  }

  function resetForm() {
    setCreated(null);
    setStep(1);
    setCreationStyle('GUIDED');
    setPublicationChoice('DRAFT');
    setTitle('');
    setTitleEdited(false);
    setDescription('');
    setCategory('Politics');
    setCountryCode('');
    setAssetCode('');
    setOpensAt('');
    setClosesAt('');
    setResolvesAfter('');
    setSportsMarketType('MATCH');
    setCompetition('');
    setHomeTeam('');
    setAwayTeam('');
    setMatchPrediction('HOME_WIN');
    setResultChecking('AUTOMATIC');
    setMatchReference('');
    setPlayer('');
    setDestinationClub('');
    setPoliticsMarketType('ELECTION');
    setElectionCountry('');
    setElectionOffice('');
    setCandidate('');
    setElectionLabel('');
    setSourceName('');
    setSourceUrl('');
    setResultCondition('');
    setError(null);
  }

  if (loading) {
    return <View style={{ gap: theme.spacing.md }}><VadSkeleton width="50%" height={32} /><VadSkeleton height={110} /><VadSkeleton height={260} /></View>;
  }

  const publicationStatus = String(created?.publication_status ?? 'DRAFT').toUpperCase();
  const createdSource = String(created?.result_source ?? '').trim();
  const reviewResultLabel = usesGuidedBackend
    ? isAutomaticFootball
      ? `Automatic · ${options?.guided.football.automaticSourceName ?? 'Football-Data.org'}`
      : `Verified result${sourceName.trim() ? ` · ${sourceName.trim()}` : ''}`
    : 'VAD configured result checking';

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: 4 }}>
        <VadText variant="label" tone="brand">VAD MARKETS</VadText>
        <VadText variant="title">Create a VAD market.</VadText>
        <VadText tone="secondary">Use guided setup for common market types, or keep the existing custom-question flow when you need full flexibility.</VadText>
      </View>

      {!created ? <CreateStepRail step={step} /> : null}

      {created ? (
        <VadCard variant="raised" style={{ gap: theme.spacing.md, borderColor: theme.colors.yes }}>
          <VadChip label={publicationStatus === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT CREATED'} tone="yes" />
          <VadText variant="title" tone="yes">Market created successfully.</VadText>
          <VadText variant="caption" tone="secondary">
            {publicationStatus === 'PUBLISHED'
              ? 'The market is live for eligible users and its result-checking instructions are saved with the market.'
              : 'The market and its result-checking instructions are saved. Publish it when you are ready for users to see it.'}
          </VadText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <VadChip label={String(created.asset_code ?? resolvedAssetCode)} tone={sandbox ? 'brand' : 'neutral'} />
            {createdSource ? <VadChip label={createdSource} tone="neutral" /> : null}
          </View>
          {publicationStatus !== 'PUBLISHED' ? <VadButton label="Open Market Publishing" onPress={() => router.push('/admin/market-publishing')} /> : null}
          <VadButton label="Create another market" variant="secondary" onPress={resetForm} />
        </VadCard>
      ) : null}

      {!created && step === 1 ? (
        <VadCard variant="raised" style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: 3 }}>
            <VadText variant="caption" tone="brand">STEP 1 · MARKET</VadText>
            <VadText variant="heading">Define the market.</VadText>
            <VadText variant="caption" tone="secondary">Guided setup asks only for the real-world details VAD needs. Custom question keeps the existing flexible creator.</VadText>
          </View>

          <View style={{ gap: 8 }}>
            <VadText variant="label">Creation style</VadText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              <VadChip label="Guided setup" selected={creationStyle === 'GUIDED'} tone={creationStyle === 'GUIDED' ? 'brand' : 'neutral'} onPress={() => chooseCreationStyle('GUIDED')} />
              <VadChip label="Custom question" selected={creationStyle === 'CUSTOM'} tone={creationStyle === 'CUSTOM' ? 'brand' : 'neutral'} onPress={() => chooseCreationStyle('CUSTOM')} />
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <VadText variant="label">Category</VadText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {CATEGORIES.map((item) => (
                <VadChip key={item} label={item} selected={category === item} tone={category === item ? 'brand' : 'neutral'} onPress={() => chooseCategory(item)} />
              ))}
            </View>
          </View>

          {creationStyle === 'GUIDED' && category === 'Sports' ? (
            <View style={{ gap: theme.spacing.lg }}>
              <View style={{ gap: 8 }}>
                <VadText variant="label">Sports market</VadText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                  <VadChip label="Match result" selected={sportsMarketType === 'MATCH'} onPress={() => { setSportsMarketType('MATCH'); setResultChecking('AUTOMATIC'); setTitleEdited(false); setError(null); }} />
                  <VadChip label="Player transfer" selected={sportsMarketType === 'TRANSFER'} onPress={() => { setSportsMarketType('TRANSFER'); setResultChecking('VERIFIED'); setTitleEdited(false); setError(null); }} />
                  <VadChip label="Other sports event" selected={sportsMarketType === 'OTHER'} onPress={() => { setSportsMarketType('OTHER'); setResultChecking('VERIFIED'); setTitleEdited(false); setError(null); }} />
                </View>
              </View>

              {sportsMarketType === 'MATCH' ? (
                <View style={{ gap: theme.spacing.md }}>
                  <View style={{ gap: 8 }}>
                    <VadText variant="label">Sport</VadText>
                    <View style={{ flexDirection: 'row', gap: 7 }}><VadChip label="Football" selected /></View>
                  </View>
                  <VadInput label="Competition" value={competition} onChangeText={(value) => { setCompetition(value); setError(null); }} placeholder="La Liga" />
                  <VadInput label="Home team" value={homeTeam} onChangeText={(value) => { setHomeTeam(value); setError(null); }} placeholder="Real Betis" />
                  <VadInput label="Away team" value={awayTeam} onChangeText={(value) => { setAwayTeam(value); setError(null); }} placeholder="Getafe" />
                  <View style={{ gap: 8 }}>
                    <VadText variant="label">Prediction</VadText>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                      <VadChip label="Home team wins" selected={matchPrediction === 'HOME_WIN'} onPress={() => { setMatchPrediction('HOME_WIN'); setTitleEdited(false); }} />
                      <VadChip label="Draw" selected={matchPrediction === 'DRAW'} onPress={() => { setMatchPrediction('DRAW'); setTitleEdited(false); }} />
                      <VadChip label="Away team wins" selected={matchPrediction === 'AWAY_WIN'} onPress={() => { setMatchPrediction('AWAY_WIN'); setTitleEdited(false); }} />
                    </View>
                  </View>
                  <View style={{ gap: 8 }}>
                    <VadText variant="label">Result checking</VadText>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                      <VadChip label={`Automatic · ${options?.guided.football.automaticSourceName ?? 'Football-Data.org'}`} selected={resultChecking === 'AUTOMATIC'} tone={resultChecking === 'AUTOMATIC' ? 'brand' : 'neutral'} onPress={() => { setResultChecking('AUTOMATIC'); setError(null); }} />
                      <VadChip label="Verified result" selected={resultChecking === 'VERIFIED'} tone={resultChecking === 'VERIFIED' ? 'brand' : 'neutral'} onPress={() => { setResultChecking('VERIFIED'); setError(null); }} />
                    </View>
                  </View>
                  {resultChecking === 'AUTOMATIC' ? (
                    <>
                      <VadInput
                        label="Match reference"
                        value={matchReference}
                        onChangeText={(value) => { setMatchReference(value); setError(null); }}
                        placeholder="Football-Data match number"
                        hint="Paste the Football-Data match number or a reference ending in that number. VAD uses it only to fetch the final result."
                      />
                      <VadCard variant="muted" style={{ gap: 3 }}>
                        <VadText variant="bodyStrong" tone="yes">One final-result check</VadText>
                        <VadText variant="caption" tone="secondary">VAD waits until the result-checking time, then checks this match automatically. Creating the market does not spend a football result request.</VadText>
                      </VadCard>
                    </>
                  ) : <SourceFields sourceName={sourceName} sourceUrl={sourceUrl} setSourceName={setSourceName} setSourceUrl={setSourceUrl} />}
                </View>
              ) : null}

              {sportsMarketType === 'TRANSFER' ? (
                <View style={{ gap: theme.spacing.md }}>
                  <VadInput label="Player" value={player} onChangeText={(value) => { setPlayer(value); setError(null); }} placeholder="Player name" />
                  <VadInput label="Destination club" value={destinationClub} onChangeText={(value) => { setDestinationClub(value); setError(null); }} placeholder="Club name" />
                  <VadCard variant="muted" style={{ gap: 3 }}>
                    <VadText variant="bodyStrong">Verified result</VadText>
                    <VadText variant="caption" tone="secondary">Transfers are verified from the official source you choose. Automatic transfer checking can be added later without changing how admins create these markets.</VadText>
                  </VadCard>
                  <SourceFields sourceName={sourceName} sourceUrl={sourceUrl} setSourceName={setSourceName} setSourceUrl={setSourceUrl} />
                </View>
              ) : null}

              {sportsMarketType === 'OTHER' ? (
                <View style={{ gap: theme.spacing.md }}>
                  <VadInput label="What makes YES true? · optional" value={resultCondition} onChangeText={setResultCondition} multiline placeholder="Example: Resolve YES if the player scores at least 20 league goals before the deadline." />
                  <SourceFields sourceName={sourceName} sourceUrl={sourceUrl} setSourceName={setSourceName} setSourceUrl={setSourceUrl} />
                </View>
              ) : null}
            </View>
          ) : null}

          {creationStyle === 'GUIDED' && category === 'Politics' ? (
            <View style={{ gap: theme.spacing.lg }}>
              <View style={{ gap: 8 }}>
                <VadText variant="label">Political market</VadText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                  <VadChip label="Election winner" selected={politicsMarketType === 'ELECTION'} onPress={() => { setPoliticsMarketType('ELECTION'); setTitleEdited(false); setError(null); }} />
                  <VadChip label="Other political event" selected={politicsMarketType === 'OTHER'} onPress={() => { setPoliticsMarketType('OTHER'); setTitleEdited(false); setError(null); }} />
                </View>
              </View>
              {politicsMarketType === 'ELECTION' ? (
                <View style={{ gap: theme.spacing.md }}>
                  <VadInput label="Country" value={electionCountry} onChangeText={(value) => { setElectionCountry(value); setError(null); }} placeholder="Nigeria" />
                  <VadInput label="Office" value={electionOffice} onChangeText={(value) => { setElectionOffice(value); setError(null); }} placeholder="President" />
                  <VadInput label="Candidate" value={candidate} onChangeText={(value) => { setCandidate(value); setError(null); }} placeholder="Candidate name" />
                  <VadInput label="Election name · optional" value={electionLabel} onChangeText={(value) => { setElectionLabel(value); setTitleEdited(false); }} placeholder="2027 presidential election" />
                  <VadCard variant="muted" style={{ gap: 3 }}>
                    <VadText variant="bodyStrong">Verified official result</VadText>
                    <VadText variant="caption" tone="secondary">VAD records the source you select and verifies the declared result from that source. This avoids pretending an election is automatically settled when no approved live election feed is connected.</VadText>
                  </VadCard>
                  <SourceFields sourceName={sourceName} sourceUrl={sourceUrl} setSourceName={setSourceName} setSourceUrl={setSourceUrl} sourceLabel="Official election result source" />
                </View>
              ) : (
                <View style={{ gap: theme.spacing.md }}>
                  <VadInput label="What makes YES true? · optional" value={resultCondition} onChangeText={setResultCondition} multiline placeholder="State the objective condition VAD should verify." />
                  <SourceFields sourceName={sourceName} sourceUrl={sourceUrl} setSourceName={setSourceName} setSourceUrl={setSourceUrl} />
                </View>
              )}
            </View>
          ) : null}

          {creationStyle === 'GUIDED' && category === 'Crypto' ? (
            <VadCard variant="muted" style={{ gap: 3 }}>
              <VadText variant="bodyStrong" tone="yes">Existing crypto automation preserved</VadText>
              <VadText variant="caption" tone="secondary">Crypto keeps the current question-based setup and automatic price-result logic. Nothing in this upgrade replaces that flow.</VadText>
            </VadCard>
          ) : null}

          {creationStyle === 'GUIDED' && !['Sports', 'Politics', 'Crypto'].includes(category) ? (
            <View style={{ gap: theme.spacing.md }}>
              <VadInput label="What makes YES true? · optional" value={resultCondition} onChangeText={setResultCondition} multiline placeholder="State the objective result condition, or leave this blank and VAD will use the market question." />
              <SourceFields sourceName={sourceName} sourceUrl={sourceUrl} setSourceName={setSourceName} setSourceUrl={setSourceUrl} />
            </View>
          ) : null}

          <VadInput
            label="Market question"
            value={title}
            onChangeText={(value) => { setTitle(value); setTitleEdited(true); setError(null); }}
            multiline
            placeholder="Will … happen before …?"
            hint={creationStyle === 'GUIDED' ? 'VAD suggests a clear YES/NO question from the details above. You can still edit it.' : 'Write one clear YES/NO question.'}
          />
          <VadInput
            label="Short context · optional"
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="Add useful context for traders."
          />

          {error ? <VadErrorState title="Check this step" message={error} /> : null}
          <VadButton label="Continue to setup" onPress={continueFromDetails} />
        </VadCard>
      ) : null}

      {!created && step === 2 ? (
        <VadCard variant="raised" style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: 3 }}>
            <VadText variant="caption" tone="brand">STEP 2 · TRADING SETUP</VadText>
            <VadText variant="heading">Choose currency and timing.</VadText>
            <VadText variant="caption" tone="secondary">Use TNGN while validating the full market lifecycle. It is isolated from real NGN.</VadText>
          </View>

          {options && options.jurisdictions.length > 1 ? (
            <View style={{ gap: 8 }}>
              <VadText variant="label">Jurisdiction</VadText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {options.jurisdictions.map((item) => (
                  <VadChip key={item.countryCode} label={item.name} selected={resolvedCountryCode === item.countryCode} onPress={() => { setCountryCode(item.countryCode); setAssetCode(''); }} />
                ))}
              </View>
            </View>
          ) : null}

          {jurisdiction ? (
            <View style={{ gap: 8 }}>
              <VadText variant="label">Market currency</VadText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {jurisdiction.assets.map((asset) => (
                  <VadChip
                    key={asset}
                    label={asset === 'TNGN' ? 'Test NGN · Sandbox' : asset}
                    selected={resolvedAssetCode === asset}
                    tone={resolvedAssetCode === asset && asset === 'TNGN' ? 'brand' : 'neutral'}
                    onPress={() => { setAssetCode(asset); setError(null); }}
                  />
                ))}
              </View>
              <VadCard variant={sandbox ? 'brand' : 'muted'} style={{ gap: 3 }}>
                <VadText variant="bodyStrong" tone={sandbox ? 'brand' : 'warning'}>{sandbox ? 'Recommended for testnet' : 'Real-money currency selected'}</VadText>
                <VadText variant="caption" tone="secondary">
                  {sandbox
                    ? 'TNGN uses synthetic balances and cannot be deposited or withdrawn.'
                    : 'Use TNGN until matching, result checking and settlement have passed your sandbox tests.'}
                </VadText>
              </VadCard>
            </View>
          ) : null}

          {isAutomaticFootball ? (
            <VadCard variant={automaticFootballAvailable ? 'muted' : 'raised'} style={{ gap: 3 }}>
              <VadText variant="bodyStrong" tone={automaticFootballAvailable ? 'yes' : 'warning'}>
                {automaticFootballAvailable ? 'Automatic football results available' : 'Automatic football results are not enabled for this currency'}
              </VadText>
              <VadText variant="caption" tone="secondary">
                {automaticFootballAvailable
                  ? `${options?.guided.football.automaticSourceName ?? 'Football-Data.org'} will be used after the match result is due.`
                  : 'Go back and choose Verified result, or use a currency where automatic football result checking is enabled.'}
              </VadText>
            </VadCard>
          ) : null}

          <VadDateTimeField label="Opens" value={opensAt} onChange={setOpensAt} hint="When users can begin trading." />
          <VadDateTimeField label="Closes" value={closesAt} onChange={setClosesAt} minDate={opensAt || undefined} hint="Trading stops at this time." />
          <VadDateTimeField label="Check result after" value={resolvesAfter} onChange={setResolvesAfter} minDate={closesAt || opensAt || undefined} hint="VAD begins automatic checking or verified-result review from this time." />

          {error ? <VadErrorState title="Check this step" message={error} /> : null}
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <VadButton label="Back" variant="secondary" onPress={() => { setError(null); setStep(1); }} style={{ flex: 1 }} />
            <VadButton label="Review market" onPress={continueFromSetup} style={{ flex: 1.4 }} />
          </View>
        </VadCard>
      ) : null}

      {!created && step === 3 ? (
        <VadCard variant="brand" style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: 3 }}>
            <VadText variant="caption" tone="brand">STEP 3 · REVIEW</VadText>
            <VadText variant="heading">Review and finish.</VadText>
            <VadText variant="caption" tone="secondary">Choose whether to keep this as a draft or publish it immediately. All result instructions are saved automatically.</VadText>
          </View>

          <ReviewRow label="Question" value={title.trim()} />
          <ReviewRow label="Category" value={category} />
          <ReviewRow label="Currency" value={sandbox ? 'TNGN · Sandbox' : resolvedAssetCode} />
          <ReviewRow label="Result checking" value={reviewResultLabel} />
          <ReviewRow label="Opens" value={new Date(opensAt).toLocaleString()} />
          <ReviewRow label="Closes" value={new Date(closesAt).toLocaleString()} />
          <ReviewRow label="Check result after" value={new Date(resolvesAfter).toLocaleString()} />

          <View style={{ gap: 8 }}>
            <VadText variant="label">After creation</VadText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              <VadChip label="Save as draft" selected={publicationChoice === 'DRAFT'} tone={publicationChoice === 'DRAFT' ? 'brand' : 'neutral'} onPress={() => { setPublicationChoice('DRAFT'); setError(null); }} />
              <VadChip label="Publish now" selected={publicationChoice === 'NOW'} tone={publicationChoice === 'NOW' ? 'brand' : 'neutral'} onPress={() => { setPublicationChoice('NOW'); setError(null); }} />
            </View>
          </View>

          {publicationChoice === 'NOW' && !canPublishNow ? (
            <VadCard variant="muted" style={{ gap: 3 }}>
              <VadText variant="bodyStrong" tone="warning">Publish now needs a live opening window</VadText>
              <VadText variant="caption" tone="secondary">Set the opening time to now or earlier while keeping the closing time in the future, or choose Save as draft.</VadText>
            </VadCard>
          ) : null}

          <VadCard variant="muted" style={{ gap: 4 }}>
            <VadText variant="bodyStrong" tone="yes">{reviewResultLabel}</VadText>
            <VadText variant="caption" tone="secondary">
              {usesGuidedBackend
                ? isAutomaticFootball
                  ? 'VAD will use the saved match reference to check the final result automatically after the result time.'
                  : 'VAD will use the authoritative source saved with this market when the result is due.'
                : 'The existing custom market logic remains active and will select the configured result path from the market question and platform rules.'}
            </VadText>
          </VadCard>

          {error ? <VadErrorState title="Market not created" message={error} /> : null}
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <VadButton label="Back" variant="secondary" disabled={working} onPress={() => { setError(null); setStep(2); }} style={{ flex: 1 }} />
            <VadButton
              label={publicationChoice === 'NOW' ? 'Create & publish' : 'Create market draft'}
              loading={working}
              disabled={!scheduleValid || working || (publicationChoice === 'NOW' && !canPublishNow)}
              onPress={() => void createMarket()}
              style={{ flex: 1.5 }}
            />
          </View>
        </VadCard>
      ) : null}
    </View>
  );
}

function SourceFields({
  sourceName,
  sourceUrl,
  setSourceName,
  setSourceUrl,
  sourceLabel = 'Official result source',
}: {
  sourceName: string;
  sourceUrl: string;
  setSourceName: (value: string) => void;
  setSourceUrl: (value: string) => void;
  sourceLabel?: string;
}) {
  return (
    <View style={{ gap: 12 }}>
      <VadInput label={sourceLabel} value={sourceName} onChangeText={setSourceName} placeholder="Official league, club, authority or trusted source" />
      <VadInput label="Source website · optional" value={sourceUrl} onChangeText={setSourceUrl} placeholder="https://…" hint="Use the official or authoritative website when available." />
    </View>
  );
}

function CreateStepRail({ step }: { step: CreateStep }) {
  const theme = useVadTheme();
  const labels = ['Market', 'Setup', 'Review'];
  return (
    <VadCard variant="muted" style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {labels.map((label, index) => {
          const number = (index + 1) as CreateStep;
          const complete = number < step;
          const active = number === step;
          return (
            <View key={label} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: active ? 26 : 20, height: active ? 26 : 20, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: complete ? theme.colors.yesSoft : active ? theme.colors.brandSoft : theme.colors.surface, borderWidth: 1, borderColor: complete ? theme.colors.yes : active ? theme.colors.brandPrimary : theme.colors.border }}>
                <VadText variant="caption" tone={complete ? 'yes' : active ? 'brand' : 'tertiary'}>{number}</VadText>
              </View>
              {index < labels.length - 1 ? <View style={{ height: 1, flex: 1, backgroundColor: number < step ? theme.colors.yes : theme.colors.border, marginHorizontal: 6 }} /> : null}
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {labels.map((label, index) => (
          <VadText key={label} variant="caption" tone={index + 1 === step ? 'brand' : index + 1 < step ? 'yes' : 'tertiary'} style={{ flex: 1 }}>{label}</VadText>
        ))}
      </View>
    </VadCard>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingBottom: theme.spacing.sm }}>
      <VadText variant="caption" tone="tertiary" style={{ flex: 0.65 }}>{label}</VadText>
      <VadText variant="bodyStrong" style={{ flex: 1.35, textAlign: 'right' }}>{value}</VadText>
    </View>
  );
}
