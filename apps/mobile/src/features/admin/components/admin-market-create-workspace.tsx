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
import { useVadTheme } from '@/providers/theme-provider';
import {
  createAdminCustomMarket,
  createAdminGuidedMarket,
  getAdminMarketAutoOptions,
  type AdminGuidedMarketSetup,
  type AdminMarketAutoOptions,
} from '@/services/admin-market-approval-api';

const CATEGORIES = ['Politics', 'Sports', 'Crypto', 'Business', 'Economy', 'Technology', 'Entertainment', 'Science', 'World', 'Other'] as const;
type Category = (typeof CATEGORIES)[number];
type Step = 1 | 2 | 3;
type CreationStyle = 'GUIDED' | 'CUSTOM';
type SportsType = 'MATCH' | 'TRANSFER' | 'OTHER';
type PoliticsType = 'ELECTION' | 'OTHER';
type ResultChecking = 'AUTOMATIC' | 'VERIFIED';
type Prediction = 'HOME_WIN' | 'DRAW' | 'AWAY_WIN';
type PublicationChoice = 'DRAFT' | 'NOW';

export function AdminMarketCreateWorkspace() {
  const theme = useVadTheme();
  const [options, setOptions] = useState<AdminMarketAutoOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Record<string, unknown> | null>(null);

  const [step, setStep] = useState<Step>(1);
  const [creationStyle, setCreationStyle] = useState<CreationStyle>('GUIDED');
  const [publicationChoice, setPublicationChoice] = useState<PublicationChoice>('DRAFT');
  const [category, setCategory] = useState<Category>('Sports');
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [description, setDescription] = useState('');

  const [sportsType, setSportsType] = useState<SportsType>('MATCH');
  const [competition, setCompetition] = useState('');
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [prediction, setPrediction] = useState<Prediction>('HOME_WIN');
  const [matchStartsAt, setMatchStartsAt] = useState('');
  const [resultChecking, setResultChecking] = useState<ResultChecking>('AUTOMATIC');
  const [player, setPlayer] = useState('');
  const [destinationClub, setDestinationClub] = useState('');

  const [politicsType, setPoliticsType] = useState<PoliticsType>('ELECTION');
  const [electionCountry, setElectionCountry] = useState('');
  const [electionOffice, setElectionOffice] = useState('');
  const [candidate, setCandidate] = useState('');
  const [electionLabel, setElectionLabel] = useState('');

  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [resultCondition, setResultCondition] = useState('');
  const [evidencePhrase, setEvidencePhrase] = useState('');

  const [countryCode, setCountryCode] = useState('');
  const [assetCode, setAssetCode] = useState('');
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [resolvesAfter, setResolvesAfter] = useState('');

  useEffect(() => {
    let ignore = false;
    void getAdminMarketAutoOptions()
      .then((next) => { if (!ignore) setOptions(next); })
      .catch((value) => { if (!ignore) setError(value instanceof Error ? value.message : 'Market options could not be loaded.'); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, []);

  const resolvedCountryCode = countryCode || (options?.jurisdictions.length === 1 ? options.jurisdictions[0].countryCode : '');
  const jurisdiction = useMemo(
    () => options?.jurisdictions.find((item) => item.countryCode === resolvedCountryCode) ?? null,
    [options, resolvedCountryCode],
  );
  const resolvedAssetCode = assetCode || (jurisdiction?.assets.includes('TNGN') ? 'TNGN' : jurisdiction?.assets[0] ?? '');
  const sandbox = resolvedAssetCode === 'TNGN';
  const guided = creationStyle === 'GUIDED' && category !== 'Crypto';
  const automaticFootball = guided && category === 'Sports' && sportsType === 'MATCH' && resultChecking === 'AUTOMATIC';\n  const automaticEvidence = guided && category !== 'Crypto' && !automaticFootball && resultChecking === 'AUTOMATIC';
  const automaticFootballAvailable = sandbox
    ? options?.guided.football.automaticSandboxAvailable === true
    : options?.guided.football.automaticProductionAvailable === true;
  const footballCompetitions = options?.guided.football.competitions ?? [];

  const scheduleValid = [opensAt, closesAt, resolvesAfter].every((value) => value && Number.isFinite(Date.parse(value)))
    && Date.parse(closesAt) > Date.parse(opensAt)
    && Date.parse(resolvesAfter) >= Date.parse(closesAt);
  const footballScheduleValid = !automaticFootball || (
    Boolean(matchStartsAt)
    && Number.isFinite(Date.parse(matchStartsAt))
    && Date.parse(closesAt) <= Date.parse(matchStartsAt)
    && Date.parse(resolvesAfter) >= Date.parse(matchStartsAt) + (2 * 60 * 60 * 1000)
  );
  const canPublishNow = scheduleValid && Date.parse(opensAt) <= Date.now() && Date.parse(closesAt) > Date.now();

  const suggestedTitle = useMemo(() => {
    if (!guided) return '';
    if (category === 'Sports' && sportsType === 'MATCH' && homeTeam.trim() && awayTeam.trim()) {
      const where = competition.trim() ? ` in ${competition.trim()}` : '';
      if (prediction === 'DRAW') return `Will ${homeTeam.trim()} vs ${awayTeam.trim()} end in a draw${where}?`;
      if (prediction === 'AWAY_WIN') return `Will ${awayTeam.trim()} beat ${homeTeam.trim()}${where}?`;
      return `Will ${homeTeam.trim()} beat ${awayTeam.trim()}${where}?`;
    }
    if (category === 'Sports' && sportsType === 'TRANSFER' && player.trim() && destinationClub.trim()) {
      return `Will ${player.trim()} join ${destinationClub.trim()}?`;
    }
    if (category === 'Politics' && politicsType === 'ELECTION' && candidate.trim() && electionCountry.trim()) {
      const election = electionLabel.trim() || electionOffice.trim() || 'election';
      return `Will ${candidate.trim()} win the ${election} in ${electionCountry.trim()}?`;
    }
    return '';
  }, [awayTeam, candidate, category, competition, destinationClub, electionCountry, electionLabel, electionOffice, guided, homeTeam, player, politicsType, prediction, sportsType]);

  useEffect(() => {
    if (!titleEdited && suggestedTitle) setTitle(suggestedTitle);
  }, [suggestedTitle, titleEdited]);

  function clearGuidedDetails() {
    setTitle('');
    setTitleEdited(false);
    setSourceName('');
    setSourceUrl('');
    setResultCondition('');
    setEvidencePhrase('');
  }

  function selectCategory(next: Category) {
    setCategory(next);
    setError(null);
    if (creationStyle === 'GUIDED') clearGuidedDetails();
    if (next === 'Sports' && sportsType === 'MATCH') setResultChecking('AUTOMATIC');
    else setResultChecking(next === 'Crypto' ? 'VERIFIED' : 'AUTOMATIC');
  }

  function updateMatchStart(value: string) {
    setMatchStartsAt(value);
    setError(null);
    const start = Date.parse(value);
    if (!Number.isFinite(start)) return;
    if (!closesAt) setClosesAt(new Date(start).toISOString());
    if (!resolvesAfter) setResolvesAfter(new Date(start + (2 * 60 + 15) * 60 * 1000).toISOString());
  }

  function buildGuidedSetup(): AdminGuidedMarketSetup {
    if (category === 'Sports' && sportsType === 'MATCH') {
      return {
        kind: 'FOOTBALL_MATCH',
        resultChecking,
        competition,
        homeTeam,
        awayTeam,
        prediction,
        matchStartsAt,
        sourceName: resultChecking === 'VERIFIED' ? sourceName : undefined,
        sourceUrl: resultChecking === 'VERIFIED' ? sourceUrl : undefined,
      };
    }
    if (category === 'Sports' && sportsType === 'TRANSFER') {
      return { kind: 'PLAYER_TRANSFER', resultChecking, evidencePhrase, player, destinationClub, sourceName: sourceName || 'VAD Evidence Gateway', sourceUrl };
    }
    if (category === 'Sports') {
      return { kind: 'SPORTS_EVENT', resultChecking, evidencePhrase, condition: resultCondition, sourceName: sourceName || 'VAD Evidence Gateway', sourceUrl };
    }
    if (category === 'Politics' && politicsType === 'ELECTION') {
      return { kind: 'ELECTION_WINNER', resultChecking, evidencePhrase, country: electionCountry, office: electionOffice, candidate, electionLabel, sourceName: sourceName || 'VAD Evidence Gateway', sourceUrl };
    }
    if (category === 'Politics') {
      return { kind: 'POLITICAL_EVENT', resultChecking, evidencePhrase, condition: resultCondition, sourceName: sourceName || 'VAD Evidence Gateway', sourceUrl };
    }
    return { kind: 'OBJECTIVE_EVENT', resultChecking, evidencePhrase, condition: resultCondition, sourceName: sourceName || 'VAD Evidence Gateway', sourceUrl };
  }

  function continueFromMarket() {
    setError(null);
    if (!title.trim()) return setError('Enter the market question before continuing.');
    if (!guided) return setStep(2);

    if (category === 'Sports' && sportsType === 'MATCH') {
      if (!competition.trim() || !homeTeam.trim() || !awayTeam.trim()) return setError('Add the competition, home team and away team.');
      if (!matchStartsAt || !Number.isFinite(Date.parse(matchStartsAt))) return setError('Choose when the match starts.');
      if (resultChecking === 'VERIFIED' && !sourceName.trim()) return setError('Add the official result source VAD should use.');
    } else if (category === 'Sports' && sportsType === 'TRANSFER') {
      if (!player.trim() || !destinationClub.trim()) return setError('Add the player and destination club.');
      if (resultChecking === 'AUTOMATIC' && evidencePhrase.trim().length < 4) return setError('Add a short evidence phrase that objectively confirms YES.');
      if (resultChecking === 'VERIFIED' && !sourceName.trim()) return setError('Add the official result source.');
    } else if (category === 'Politics' && politicsType === 'ELECTION') {
      if (!electionCountry.trim() || !electionOffice.trim() || !candidate.trim()) return setError('Add the country, office and candidate.');
      if (resultChecking === 'AUTOMATIC' && evidencePhrase.trim().length < 4) return setError('Add a short evidence phrase that objectively confirms YES.');
      if (resultChecking === 'VERIFIED' && !sourceName.trim()) return setError('Add the official election result source.');
    } else if (!sourceName.trim()) {
      return setError('Add the authoritative result source VAD should use.');
    }
    setStep(2);
  }

  function continueFromSetup() {
    setError(null);
    if (!resolvedCountryCode || !resolvedAssetCode) return setError('Choose a market currency before continuing.');
    if (!scheduleValid) return setError('Choose valid opening, closing and result-checking times.');
    if (automaticFootball && !automaticFootballAvailable) return setError('Automatic football results are not enabled for this currency. Choose Verified result or a supported test currency.');
    if (automaticFootball && Date.parse(closesAt) > Date.parse(matchStartsAt)) return setError('For this match-result market, trading must close no later than kickoff.');
    if (automaticFootball && Date.parse(resolvesAfter) < Date.parse(matchStartsAt) + (2 * 60 * 60 * 1000)) return setError('Set result checking to at least two hours after kickoff so VAD waits for the final result.');
    setStep(3);
  }

  async function createMarket() {
    if (working || !scheduleValid || !footballScheduleValid) return;
    if (publicationChoice === 'NOW' && !canPublishNow) return setError('Publish now needs an opening time that has already started and a closing time still in the future.');
    setWorking(true);
    setError(null);
    try {
      const common = {
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
      const result = guided
        ? await createAdminGuidedMarket({ ...common, setup: buildGuidedSetup() })
        : await createAdminCustomMarket(common);
      setCreated(result);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'VAD market could not be created.');
    } finally {
      setWorking(false);
    }
  }

  function reset() {
    setCreated(null);
    setStep(1);
    setCreationStyle('GUIDED');
    setPublicationChoice('DRAFT');
    setCategory('Sports');
    setTitle('');
    setTitleEdited(false);
    setDescription('');
    setSportsType('MATCH');
    setCompetition('');
    setHomeTeam('');
    setAwayTeam('');
    setPrediction('HOME_WIN');
    setMatchStartsAt('');
    setResultChecking('AUTOMATIC');
    setPlayer('');
    setDestinationClub('');
    setPoliticsType('ELECTION');
    setElectionCountry('');
    setElectionOffice('');
    setCandidate('');
    setElectionLabel('');
    setSourceName('');
    setSourceUrl('');
    setResultCondition('');
    setCountryCode('');
    setAssetCode('');
    setOpensAt('');
    setClosesAt('');
    setResolvesAfter('');
    setError(null);
  }

  if (loading) return <View style={{ gap: theme.spacing.md }}><VadSkeleton width="50%" height={32} /><VadSkeleton height={120} /><VadSkeleton height={280} /></View>;

  const publicationStatus = String(created?.publication_status ?? 'DRAFT').toUpperCase();
  const resultLabel = guided
    ? automaticFootball
      ? `Automatic · ${options?.guided.football.automaticSourceName ?? 'Football-Data.org'}`
      : resultChecking === 'AUTOMATIC' ? `Automatic · ${options?.guided.evidence.automaticSourceName ?? 'VAD Evidence Gateway'}` : `Verified result${sourceName.trim() ? ` · ${sourceName.trim()}` : ''}`
    : 'VAD configured result checking';

  if (created) {
    return (
      <View style={{ gap: theme.spacing.xl }}>
        <VadCard variant="raised" style={{ gap: theme.spacing.md, borderColor: theme.colors.yes }}>
          <VadChip label={publicationStatus === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT CREATED'} tone="yes" />
          <VadText variant="title" tone="yes">Market created successfully.</VadText>
          <VadText tone="secondary">
            {publicationStatus === 'PUBLISHED'
              ? 'The market is live and its result-checking instructions are saved.'
              : 'The market is saved as a draft with its result-checking instructions.'}
          </VadText>
          {publicationStatus !== 'PUBLISHED' ? <VadButton label="Open Market Publishing" onPress={() => router.push('/admin/market-publishing')} /> : null}
          <VadButton label="Create another market" variant="secondary" onPress={reset} />
        </VadCard>
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: 4 }}>
        <VadText variant="label" tone="brand">VAD MARKETS</VadText>
        <VadText variant="title">Create a VAD market.</VadText>
        <VadText tone="secondary">Use guided setup for common markets, or Custom question for the existing flexible creation flow.</VadText>
      </View>

      <StepRail step={step} />

      {step === 1 ? (
        <VadCard variant="raised" style={{ gap: theme.spacing.lg }}>
          <SectionTitle eyebrow="STEP 1 · MARKET" title="Define the market." text="Use normal real-world details. VAD handles the technical configuration behind the scenes." />

          <FieldGroup label="Creation style">
            <VadChip label="Guided setup" selected={creationStyle === 'GUIDED'} tone={creationStyle === 'GUIDED' ? 'brand' : 'neutral'} onPress={() => { setCreationStyle('GUIDED'); setTitleEdited(false); setError(null); }} />
            <VadChip label="Custom question" selected={creationStyle === 'CUSTOM'} tone={creationStyle === 'CUSTOM' ? 'brand' : 'neutral'} onPress={() => { setCreationStyle('CUSTOM'); setError(null); }} />
          </FieldGroup>

          <FieldGroup label="Category">
            {CATEGORIES.map((item) => <VadChip key={item} label={item} selected={category === item} tone={category === item ? 'brand' : 'neutral'} onPress={() => selectCategory(item)} />)}
          </FieldGroup>

          {guided && category === 'Sports' ? (
            <View style={{ gap: theme.spacing.lg }}>
              <FieldGroup label="Sports market">
                <VadChip label="Match result" selected={sportsType === 'MATCH'} onPress={() => { setSportsType('MATCH'); setResultChecking('AUTOMATIC'); clearGuidedDetails(); }} />
                <VadChip label="Player transfer" selected={sportsType === 'TRANSFER'} onPress={() => { setSportsType('TRANSFER'); setResultChecking('VERIFIED'); clearGuidedDetails(); }} />
                <VadChip label="Other sports event" selected={sportsType === 'OTHER'} onPress={() => { setSportsType('OTHER'); setResultChecking('VERIFIED'); clearGuidedDetails(); }} />
              </FieldGroup>

              {sportsType === 'MATCH' ? (
                <View style={{ gap: theme.spacing.md }}>
                  <FieldGroup label="Sport"><VadChip label="Football" selected /></FieldGroup>
                  <VadInput label="Competition" value={competition} onChangeText={(value) => { setCompetition(value); setError(null); }} placeholder="La Liga" />
                  {footballCompetitions.length ? (
                    <View style={{ gap: 7 }}>
                      <VadText variant="caption" tone="secondary">Automatic-result competitions on your current football plan</VadText>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                        {footballCompetitions.map((item) => <VadChip key={item} label={item} selected={competition === item} onPress={() => setCompetition(item)} />)}
                      </View>
                    </View>
                  ) : null}
                  <VadInput label="Home team" value={homeTeam} onChangeText={setHomeTeam} placeholder="Real Betis" />
                  <VadInput label="Away team" value={awayTeam} onChangeText={setAwayTeam} placeholder="Getafe" />
                  <FieldGroup label="Prediction">
                    <VadChip label="Home team wins" selected={prediction === 'HOME_WIN'} onPress={() => { setPrediction('HOME_WIN'); setTitleEdited(false); }} />
                    <VadChip label="Draw" selected={prediction === 'DRAW'} onPress={() => { setPrediction('DRAW'); setTitleEdited(false); }} />
                    <VadChip label="Away team wins" selected={prediction === 'AWAY_WIN'} onPress={() => { setPrediction('AWAY_WIN'); setTitleEdited(false); }} />
                  </FieldGroup>
                  <VadDateTimeField label="Match starts" value={matchStartsAt} onChange={updateMatchStart} hint="VAD uses the competition, teams and match time to identify the fixture automatically." />
                  <FieldGroup label="Result checking">
                    <VadChip label={`Automatic · ${options?.guided.football.automaticSourceName ?? 'Football-Data.org'}`} selected={resultChecking === 'AUTOMATIC'} tone={resultChecking === 'AUTOMATIC' ? 'brand' : 'neutral'} onPress={() => setResultChecking('AUTOMATIC')} />
                    <VadChip label="Verified result" selected={resultChecking === 'VERIFIED'} tone={resultChecking === 'VERIFIED' ? 'brand' : 'neutral'} onPress={() => setResultChecking('VERIFIED')} />
                  </FieldGroup>
                  {resultChecking === 'AUTOMATIC' ? (
                    <VadCard variant="muted" style={{ gap: 4 }}>
                      <VadText variant="bodyStrong" tone="yes">No match IDs or developer setup</VadText>
                      <VadText variant="caption" tone="secondary">Creating the market does not call the football provider. When the result is due, VAD makes one fixture-result request and matches the competition, teams and kickoff time.</VadText>
                    </VadCard>
                  ) : <SourceFields sourceName={sourceName} sourceUrl={sourceUrl} setSourceName={setSourceName} setSourceUrl={setSourceUrl} />}
                </View>
              ) : null}

              {sportsType === 'TRANSFER' ? (
                <View style={{ gap: theme.spacing.md }}>
                  <VadInput label="Player" value={player} onChangeText={setPlayer} placeholder="Player name" />
                  <VadInput label="Destination club" value={destinationClub} onChangeText={setDestinationClub} placeholder="Club name" />
                  <GenericEvidenceControls resultChecking={resultChecking} setResultChecking={setResultChecking} evidencePhrase={evidencePhrase} setEvidencePhrase={setEvidencePhrase} sourceName={sourceName} sourceUrl={sourceUrl} setSourceName={setSourceName} setSourceUrl={setSourceUrl} automaticAvailable={options?.guided.evidence.automaticAvailable === true} />
                </View>
              ) : null}

              {sportsType === 'OTHER' ? <ObjectiveSourceFields condition={resultCondition} setCondition={setResultCondition} sourceName={sourceName} sourceUrl={sourceUrl} setSourceName={setSourceName} setSourceUrl={setSourceUrl} resultChecking={resultChecking} setResultChecking={setResultChecking} evidencePhrase={evidencePhrase} setEvidencePhrase={setEvidencePhrase} automaticAvailable={options?.guided.evidence.automaticAvailable === true} /> : null}
            </View>
          ) : null}

          {guided && category === 'Politics' ? (
            <View style={{ gap: theme.spacing.lg }}>
              <FieldGroup label="Political market">
                <VadChip label="Election winner" selected={politicsType === 'ELECTION'} onPress={() => { setPoliticsType('ELECTION'); clearGuidedDetails(); }} />
                <VadChip label="Other political event" selected={politicsType === 'OTHER'} onPress={() => { setPoliticsType('OTHER'); clearGuidedDetails(); }} />
              </FieldGroup>
              {politicsType === 'ELECTION' ? (
                <View style={{ gap: theme.spacing.md }}>
                  <VadInput label="Country" value={electionCountry} onChangeText={setElectionCountry} placeholder="Nigeria" />
                  <VadInput label="Office" value={electionOffice} onChangeText={setElectionOffice} placeholder="President" />
                  <VadInput label="Candidate" value={candidate} onChangeText={setCandidate} placeholder="Candidate name" />
                  <VadInput label="Election name · optional" value={electionLabel} onChangeText={(value) => { setElectionLabel(value); setTitleEdited(false); }} placeholder="2027 presidential election" />
                  <GenericEvidenceControls resultChecking={resultChecking} setResultChecking={setResultChecking} evidencePhrase={evidencePhrase} setEvidencePhrase={setEvidencePhrase} sourceName={sourceName} sourceUrl={sourceUrl} setSourceName={setSourceName} setSourceUrl={setSourceUrl} automaticAvailable={options?.guided.evidence.automaticAvailable === true} />
                </View>
              ) : <ObjectiveSourceFields condition={resultCondition} setCondition={setResultCondition} sourceName={sourceName} sourceUrl={sourceUrl} setSourceName={setSourceName} setSourceUrl={setSourceUrl} resultChecking={resultChecking} setResultChecking={setResultChecking} evidencePhrase={evidencePhrase} setEvidencePhrase={setEvidencePhrase} automaticAvailable={options?.guided.evidence.automaticAvailable === true} />}
            </View>
          ) : null}

          {guided && category === 'Crypto' ? <VadCard variant="muted"><VadText tone="secondary">Existing crypto question-based automation is preserved. Nothing in this guided upgrade replaces it.</VadText></VadCard> : null}
          {guided && !['Sports', 'Politics', 'Crypto'].includes(category) ? <ObjectiveSourceFields condition={resultCondition} setCondition={setResultCondition} sourceName={sourceName} sourceUrl={sourceUrl} setSourceName={setSourceName} setSourceUrl={setSourceUrl} resultChecking={resultChecking} setResultChecking={setResultChecking} evidencePhrase={evidencePhrase} setEvidencePhrase={setEvidencePhrase} automaticAvailable={options?.guided.evidence.automaticAvailable === true} /> : null}

          <VadInput label="Market question" value={title} onChangeText={(value) => { setTitle(value); setTitleEdited(true); setError(null); }} multiline placeholder="Will … happen before …?" hint={guided ? 'VAD suggests a clear YES/NO question from the details above. You can edit it.' : 'Write one clear YES/NO question.'} />
          <VadInput label="Short context · optional" value={description} onChangeText={setDescription} multiline placeholder="Add useful context for traders." />
          {error ? <VadErrorState title="Check this step" message={error} /> : null}
          <VadButton label="Continue to setup" onPress={continueFromMarket} />
        </VadCard>
      ) : null}

      {step === 2 ? (
        <VadCard variant="raised" style={{ gap: theme.spacing.lg }}>
          <SectionTitle eyebrow="STEP 2 · TRADING SETUP" title="Choose currency and timing." text="Use TNGN while validating the full market lifecycle." />

          {options && options.jurisdictions.length > 1 ? (
            <FieldGroup label="Jurisdiction">
              {options.jurisdictions.map((item) => <VadChip key={item.countryCode} label={item.name} selected={resolvedCountryCode === item.countryCode} onPress={() => { setCountryCode(item.countryCode); setAssetCode(''); }} />)}
            </FieldGroup>
          ) : null}

          {jurisdiction ? (
            <View style={{ gap: 8 }}>
              <FieldGroup label="Market currency">
                {jurisdiction.assets.map((asset) => <VadChip key={asset} label={asset === 'TNGN' ? 'Test NGN · Sandbox' : asset} selected={resolvedAssetCode === asset} tone={resolvedAssetCode === asset && asset === 'TNGN' ? 'brand' : 'neutral'} onPress={() => setAssetCode(asset)} />)}
              </FieldGroup>
              <VadCard variant={sandbox ? 'brand' : 'muted'} style={{ gap: 3 }}>
                <VadText variant="bodyStrong" tone={sandbox ? 'brand' : 'warning'}>{sandbox ? 'Recommended for testnet' : 'Real-money currency selected'}</VadText>
                <VadText variant="caption" tone="secondary">{sandbox ? 'TNGN uses synthetic balances and cannot be deposited or withdrawn.' : 'Use TNGN until matching, result checking and settlement pass your sandbox tests.'}</VadText>
              </VadCard>
            </View>
          ) : null}

          {automaticFootball ? (
            <VadCard variant="muted" style={{ gap: 4 }}>
              <VadText variant="bodyStrong" tone={automaticFootballAvailable ? 'yes' : 'warning'}>{automaticFootballAvailable ? 'Automatic football results available' : 'Automatic football results are not enabled for this currency'}</VadText>
              <VadText variant="caption" tone="secondary">{automaticFootballAvailable ? 'The provider is called only when the result is due.' : 'Choose Verified result or a supported test currency.'}</VadText>
            </VadCard>
          ) : null}

          {automaticEvidence ? <VadCard variant="muted" style={{ gap: 4 }}><VadText variant="bodyStrong" tone={options?.guided.evidence.automaticAvailable ? 'yes' : 'warning'}>{options?.guided.evidence.automaticAvailable ? 'Automatic evidence route available' : 'Automatic evidence route needs configuration'}</VadText><VadText variant="caption" tone="secondary">{options?.guided.evidence.broadSearchAvailable ? 'Broad evidence discovery is registered. Add TAVILY_API_KEY in Supabase Edge Function secrets for live search; an authoritative HTTPS source can also be used when supplied.' : 'Direct public records remain available when an authoritative HTTPS source is supplied. Add TAVILY_API_KEY to enable broad evidence discovery.'}</VadText></VadCard> : null}

          <VadDateTimeField label="Opens" value={opensAt} onChange={setOpensAt} hint="When users can begin trading." />
          <VadDateTimeField label="Closes" value={closesAt} onChange={setClosesAt} minDate={opensAt || undefined} hint={automaticFootball ? 'For match-result markets, close no later than kickoff.' : 'Trading stops at this time.'} />
          <VadDateTimeField label="Check result after" value={resolvesAfter} onChange={setResolvesAfter} minDate={closesAt || opensAt || undefined} hint={automaticFootball ? 'At least two hours after kickoff so VAD waits for a final result.' : 'VAD begins result verification from this time.'} />

          {error ? <VadErrorState title="Check this step" message={error} /> : null}
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <VadButton label="Back" variant="secondary" onPress={() => { setError(null); setStep(1); }} style={{ flex: 1 }} />
            <VadButton label="Review market" onPress={continueFromSetup} style={{ flex: 1.4 }} />
          </View>
        </VadCard>
      ) : null}

      {step === 3 ? (
        <VadCard variant="brand" style={{ gap: theme.spacing.lg }}>
          <SectionTitle eyebrow="STEP 3 · REVIEW" title="Review and finish." text="Save it as a draft or publish immediately. VAD stores the result rules automatically." />
          <ReviewRow label="Question" value={title.trim()} />
          <ReviewRow label="Category" value={category} />
          {automaticFootball ? <ReviewRow label="Match" value={`${homeTeam} vs ${awayTeam} · ${competition}`} /> : null}
          {automaticFootball ? <ReviewRow label="Kickoff" value={new Date(matchStartsAt).toLocaleString()} /> : null}
          <ReviewRow label="Currency" value={sandbox ? 'TNGN · Sandbox' : resolvedAssetCode} />
          <ReviewRow label="Result checking" value={resultLabel} />
          <ReviewRow label="Opens" value={new Date(opensAt).toLocaleString()} />
          <ReviewRow label="Closes" value={new Date(closesAt).toLocaleString()} />
          <ReviewRow label="Check result after" value={new Date(resolvesAfter).toLocaleString()} />

          <FieldGroup label="After creation">
            <VadChip label="Save as draft" selected={publicationChoice === 'DRAFT'} tone={publicationChoice === 'DRAFT' ? 'brand' : 'neutral'} onPress={() => setPublicationChoice('DRAFT')} />
            <VadChip label="Publish now" selected={publicationChoice === 'NOW'} tone={publicationChoice === 'NOW' ? 'brand' : 'neutral'} onPress={() => setPublicationChoice('NOW')} />
          </FieldGroup>
          {publicationChoice === 'NOW' && !canPublishNow ? <VadCard variant="muted"><VadText variant="caption" tone="warning">Publish now needs an opening time that has started and a closing time still in the future.</VadText></VadCard> : null}
          <VadCard variant="muted" style={{ gap: 4 }}><VadText variant="bodyStrong" tone="yes">{resultLabel}</VadText><VadText variant="caption" tone="secondary">{automaticFootball ? 'VAD will identify the fixture from the configured competition, teams and kickoff, then make one result request when due.' : guided ? 'VAD will use the authoritative result source saved with this market.' : 'The existing custom market logic remains active.'}</VadText></VadCard>
          {error ? <VadErrorState title="Market not created" message={error} /> : null}
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <VadButton label="Back" variant="secondary" disabled={working} onPress={() => { setError(null); setStep(2); }} style={{ flex: 1 }} />
            <VadButton label={publicationChoice === 'NOW' ? 'Create & publish' : 'Create market draft'} loading={working} disabled={!scheduleValid || !footballScheduleValid || working || (publicationChoice === 'NOW' && !canPublishNow)} onPress={() => void createMarket()} style={{ flex: 1.5 }} />
          </View>
        </VadCard>
      ) : null}
    </View>
  );
}

function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <View style={{ gap: 3 }}><VadText variant="caption" tone="brand">{eyebrow}</VadText><VadText variant="heading">{title}</VadText><VadText variant="caption" tone="secondary">{text}</VadText></View>;
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={{ gap: 8 }}><VadText variant="label">{label}</VadText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{children}</View></View>;
}

function SourceFields({ sourceName, sourceUrl, setSourceName, setSourceUrl, sourceLabel = 'Official result source' }: { sourceName: string; sourceUrl: string; setSourceName: (value: string) => void; setSourceUrl: (value: string) => void; sourceLabel?: string }) {
  return <View style={{ gap: 12 }}><VadInput label={sourceLabel} value={sourceName} onChangeText={setSourceName} placeholder="Official league, club, authority or trusted source" /><VadInput label="Source website · optional" value={sourceUrl} onChangeText={setSourceUrl} placeholder="https://…" hint="Use the official or authoritative website when available." /></View>;
}

function GenericEvidenceControls({ resultChecking, setResultChecking, evidencePhrase, setEvidencePhrase, sourceName, sourceUrl, setSourceName, setSourceUrl, automaticAvailable }: { resultChecking: ResultChecking; setResultChecking: (value: ResultChecking) => void; evidencePhrase: string; setEvidencePhrase: (value: string) => void; sourceName: string; sourceUrl: string; setSourceName: (value: string) => void; setSourceUrl: (value: string) => void; automaticAvailable: boolean }) {
  return <View style={{ gap: 12 }}><FieldGroup label="Result checking"><VadChip label="Automatic evidence" selected={resultChecking === 'AUTOMATIC'} tone={resultChecking === 'AUTOMATIC' ? 'brand' : 'neutral'} onPress={() => setResultChecking('AUTOMATIC')} /><VadChip label="Verified result" selected={resultChecking === 'VERIFIED'} tone={resultChecking === 'VERIFIED' ? 'brand' : 'neutral'} onPress={() => setResultChecking('VERIFIED')} /></FieldGroup>{resultChecking === 'AUTOMATIC' ? <><VadCard variant="muted" style={{ gap: 4 }}><VadText variant="bodyStrong" tone={automaticAvailable ? 'yes' : 'warning'}>{automaticAvailable ? 'VAD Evidence Gateway ready' : 'Automatic evidence route needs attention'}</VadText><VadText variant="caption" tone="secondary">VAD checks an authoritative URL when supplied and can use the broad evidence provider as fallback. Settlement still passes through the existing oracle consensus and dispute workflow.</VadText></VadCard><VadInput label="Evidence phrase that confirms YES" value={evidencePhrase} onChangeText={setEvidencePhrase} placeholder="e.g. officially declared winner" hint="Use a short objective phrase expected in the final evidence." /><SourceFields sourceName={sourceName} sourceUrl={sourceUrl} setSourceName={setSourceName} setSourceUrl={setSourceUrl} sourceLabel="Preferred authoritative source · optional" /></> : <SourceFields sourceName={sourceName} sourceUrl={sourceUrl} setSourceName={setSourceName} setSourceUrl={setSourceUrl} />}</View>;
}

function ObjectiveSourceFields({ condition, setCondition, sourceName, sourceUrl, setSourceName, setSourceUrl }: { condition: string; setCondition: (value: string) => void; sourceName: string; sourceUrl: string; setSourceName: (value: string) => void; setSourceUrl: (value: string) => void }) {
  return <View style={{ gap: 12 }}><VadInput label="What makes YES true? · optional" value={condition} onChangeText={setCondition} multiline placeholder="State the objective result condition, or leave blank to use the market question." /><SourceFields sourceName={sourceName} sourceUrl={sourceUrl} setSourceName={setSourceName} setSourceUrl={setSourceUrl} /></View>;
}

function StepRail({ step }: { step: Step }) {
  const theme = useVadTheme();
  const labels = ['Market', 'Setup', 'Review'];
  return <VadCard variant="muted" style={{ gap: 8 }}><View style={{ flexDirection: 'row', alignItems: 'center' }}>{labels.map((label, index) => { const number = (index + 1) as Step; const complete = number < step; const active = number === step; return <View key={label} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}><View style={{ width: active ? 26 : 20, height: active ? 26 : 20, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: complete ? theme.colors.yesSoft : active ? theme.colors.brandSoft : theme.colors.surface, borderWidth: 1, borderColor: complete ? theme.colors.yes : active ? theme.colors.brandPrimary : theme.colors.border }}><VadText variant="caption" tone={complete ? 'yes' : active ? 'brand' : 'tertiary'}>{number}</VadText></View>{index < labels.length - 1 ? <View style={{ height: 1, flex: 1, backgroundColor: complete ? theme.colors.yes : theme.colors.border, marginHorizontal: 6 }} /> : null}</View>; })}</View><View style={{ flexDirection: 'row' }}>{labels.map((label, index) => <VadText key={label} variant="caption" tone={index + 1 === step ? 'brand' : index + 1 < step ? 'yes' : 'tertiary'} style={{ flex: 1 }}>{label}</VadText>)}</View></VadCard>;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingBottom: theme.spacing.sm }}><VadText variant="caption" tone="tertiary" style={{ flex: 0.65 }}>{label}</VadText><VadText variant="bodyStrong" style={{ flex: 1.35, textAlign: 'right' }}>{value}</VadText></View>;
}
