import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadDateTimeField } from '@/components/ui/vad-date-time-field';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { AdminSportsFixturePicker } from './admin-sports-fixture-picker';
import { useVadTheme } from '@/providers/theme-provider';
import {
  createAdminCatalogMarket,
  getAdminGuidedMarketCatalog,
  type AdminGuidedCatalogCategory,
  type AdminGuidedCatalogMarketType,
  getSportsMarketTaxonomy,
  type SportsMarketTaxonomy,
} from '@/services/admin-guided-market-catalog-api';
import {
  checkCryptoOracleAsset,
  getCryptoMarketPrices,
  type CryptoMarketQuote,
  type CryptoOracleAssetCheck,
  type CryptoOraclePolicyReadiness,
} from '@/services/crypto-market-data-api';
import {
  createAdminSportsMarketDraft,
  type AdminSportsFixture,
} from '@/services/admin-sports-fixture-api';
import {
  createAdminCustomMarket,
  createAdminGuidedMarket,
  getAdminMarketAutoOptions,
  type AdminMarketAutoOptions,
} from '@/services/admin-market-approval-api';

type Step = 1 | 2 | 3;
type CreationStyle = 'GUIDED' | 'CUSTOM';
type ResultChecking = 'AUTOMATIC' | 'VERIFIED';
type Prediction = 'HOME_WIN' | 'DRAW' | 'AWAY_WIN';
type PublicationChoice = 'DRAFT' | 'NOW';
type LiquidityModel = 'POOL' | 'ORDER_BOOK';

function suggestedFromTemplate(template: string, details: Record<string, string>) {
  if (!template.trim()) return '';
  const tokens = [...template.matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)].map((match) => match[1]);
  if (tokens.some((key) => !details[key]?.trim())) return '';
  return template
    .replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_, key: string) => details[key]?.trim() ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cryptoThresholdReadinessError(readiness: CryptoOraclePolicyReadiness | undefined, sandbox: boolean) {
  if (!readiness?.available) {
    return readiness?.error
      ?? 'Oracle settlement readiness could not be verified. Refresh the source check before creating this automatic market.';
  }
  if (!readiness.providersRuntimeReady) {
    const unavailable = [
      readiness.coinbaseHealth === 'UNAVAILABLE' ? 'Coinbase' : null,
      readiness.krakenHealth === 'UNAVAILABLE' ? 'Kraken' : null,
    ].filter(Boolean).join(' and ');
    return readiness.providerReason
      ?? `${unavailable || 'A required Oracle source'} is marked unavailable. Open Admin → Providers, run “Check oracle providers”, then refresh the asset readiness check.`;
  }
  const policyReady = sandbox ? readiness.sandboxPolicyReady : readiness.productionPolicyReady;
  if (!policyReady) {
    const version = sandbox ? readiness.sandboxPolicyVersion : readiness.productionPolicyVersion;
    const environment = sandbox ? 'TNGN sandbox' : 'production';
    return `Automatic crypto markets in ${environment} are blocked until an authorized, independent Oracle reviewer approves the Coinbase + Kraken two-source policy${version ? ` (draft version ${version})` : ''}. Approve it in the Oracle policy controls; this app will not bypass settlement-policy approval.`;
  }
  return null;
}


export function AdminMarketCreateWorkspaceCatalog() {
  const theme = useVadTheme();
  const [options, setOptions] = useState<AdminMarketAutoOptions | null>(null);
  const [categories, setCategories] = useState<AdminGuidedCatalogCategory[]>([]);
  const [sportsTaxonomy, setSportsTaxonomy] = useState<SportsMarketTaxonomy>({ sports: [], competitions: [] });
  const [cryptoSearch, setCryptoSearch] = useState('');
  const [cryptoOptions, setCryptoOptions] = useState<CryptoMarketQuote[]>([]);
  const [selectedCryptoAsset, setSelectedCryptoAsset] = useState<CryptoMarketQuote | null>(null);
  const [cryptoAssetCheck, setCryptoAssetCheck] = useState<CryptoOracleAssetCheck | null>(null);
  const [cryptoAssetCheckLoading, setCryptoAssetCheckLoading] = useState(false);
  const cryptoAssetCheckRequest = useRef(0);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Record<string, unknown> | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());

  const [step, setStep] = useState<Step>(1);
  const [creationStyle, setCreationStyle] = useState<CreationStyle>('GUIDED');
  const [publicationChoice, setPublicationChoice] = useState<PublicationChoice>('DRAFT');
  const [categoryCode, setCategoryCode] = useState('');
  const [marketTypeCode, setMarketTypeCode] = useState('');
  const [details, setDetails] = useState<Record<string, string>>({});
  const [selectedFixture, setSelectedFixture] = useState<{ fixture: AdminSportsFixture; cacheKey: string } | null>(null);
  const [sportsDraftLoading, setSportsDraftLoading] = useState(false);
  const [sportsDraftNotice, setSportsDraftNotice] = useState<string | null>(null);
  const sportsDraftRequest = useRef(0);
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [resultCondition, setResultCondition] = useState('');

  const [competition, setCompetition] = useState('');
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [prediction, setPrediction] = useState<Prediction>('HOME_WIN');
  const [matchStartsAt, setMatchStartsAt] = useState('');
  const [resultChecking, setResultChecking] = useState<ResultChecking>('AUTOMATIC');

  const [countryCode, setCountryCode] = useState('');
  const [assetCode, setAssetCode] = useState('');
  const [liquidityModel, setLiquidityModel] = useState<LiquidityModel>('POOL');
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [resolvesAfter, setResolvesAfter] = useState('');

  useEffect(() => {
    let ignore = false;
    void Promise.all([getAdminMarketAutoOptions(), getAdminGuidedMarketCatalog(), getSportsMarketTaxonomy()])
      .then(([nextOptions, catalog, taxonomy]) => {
        if (ignore) return;
        setOptions(nextOptions);
        setCategories(catalog.categories);
        setSportsTaxonomy(taxonomy);
        const firstCategory = catalog.categories[0];
        if (firstCategory) {
          setCategoryCode(firstCategory.code);
          setMarketTypeCode(firstCategory.marketTypes[0]?.code ?? '');
        }
      })
      .catch((value) => {
        if (!ignore) setError(value instanceof Error ? value.message : 'Market setup could not be loaded.');
      })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setClockNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!(creationStyle === 'GUIDED' && marketTypeCode === 'CRYPTO_PRICE_THRESHOLD') || cryptoSearch.trim().length < 2) {
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      void getCryptoMarketPrices({ page: 1, perPage: 8, query: cryptoSearch.trim() })
        .then((result) => { if (active) setCryptoOptions(result.coins.slice(0, 8)); })
        .catch(() => { if (active) setCryptoOptions([]); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [cryptoSearch, creationStyle, marketTypeCode]);

  async function chooseCryptoAsset(coin: CryptoMarketQuote) {
    const requestId = ++cryptoAssetCheckRequest.current;
    setSelectedCryptoAsset(coin);
    setCryptoAssetCheck(null);
    setCryptoAssetCheckLoading(true);
    setDetails((current) => ({
      ...current,
      asset_symbol: coin.symbol.toUpperCase(),
      coingecko_id: coin.id,
      quote: 'USD',
      operator: current.operator || 'GTE',
    }));
    setTitleEdited(false);
    setSourceName('Coinbase + Kraken public historical prices');
    setSourceUrl('');
    setError(null);
    try {
      const check = await checkCryptoOracleAsset(coin.symbol, coin.id);
      if (requestId !== cryptoAssetCheckRequest.current) return;
      setCryptoAssetCheck(check);
      if (!check.supported) setError(check.reason ?? 'This asset does not have active Coinbase + Kraken historical mappings. Choose another supported asset.');
    } catch (reason) {
      if (requestId !== cryptoAssetCheckRequest.current) return;
      setCryptoAssetCheck({ supported: false, symbol: coin.symbol.toUpperCase(), quote: 'USD', provider: 'COINBASE+KRAKEN', reason: reason instanceof Error ? reason.message : 'Free-source Oracle coverage could not be verified.' });
      setError(reason instanceof Error ? reason.message : 'Free-source Oracle coverage could not be verified.');
    } finally {
      if (requestId === cryptoAssetCheckRequest.current) setCryptoAssetCheckLoading(false);
    }
  }

  async function refreshCryptoAssetReadiness() {
    const coin = selectedCryptoAsset;
    if (!coin) return;
    const requestId = ++cryptoAssetCheckRequest.current;
    setCryptoAssetCheckLoading(true);
    setError(null);
    try {
      const check = await checkCryptoOracleAsset(coin.symbol, coin.id);
      if (requestId !== cryptoAssetCheckRequest.current) return;
      setCryptoAssetCheck(check);
      if (!check.supported) setError(check.reason ?? 'This asset does not have active Coinbase + Kraken historical mappings.');
    } catch (reason) {
      if (requestId !== cryptoAssetCheckRequest.current) return;
      const message = reason instanceof Error ? reason.message : 'Oracle readiness could not be refreshed.';
      setError(message);
      setCryptoAssetCheck((current) => current ? {
        ...current,
        readiness: current.readiness ? { ...current.readiness, available: false, error: message } : undefined,
      } : current);
    } finally {
      if (requestId === cryptoAssetCheckRequest.current) setCryptoAssetCheckLoading(false);
    }
  }

  const category = useMemo(
    () => categories.find((item) => item.code === categoryCode) ?? categories[0] ?? null,
    [categories, categoryCode],
  );
  const marketType = useMemo(
    () => category?.marketTypes.find((item) => item.code === marketTypeCode) ?? category?.marketTypes[0] ?? null,
    [category, marketTypeCode],
  );

  const resolvedCountryCode = countryCode || (options?.jurisdictions.length === 1 ? options.jurisdictions[0].countryCode : '');
  const jurisdiction = useMemo(
    () => options?.jurisdictions.find((item) => item.countryCode === resolvedCountryCode) ?? null,
    [options, resolvedCountryCode],
  );
  const resolvedAssetCode = assetCode || (jurisdiction?.assets.includes('TNGN') ? 'TNGN' : jurisdiction?.assets[0] ?? '');
  const sandbox = resolvedAssetCode === 'TNGN';
  const guided = creationStyle === 'GUIDED';
  const football = guided && marketType?.handler === 'FOOTBALL_MATCH';
  const cryptoThreshold = guided && marketType?.handler === 'CRYPTO_THRESHOLD';
  const automaticFootball = football && resultChecking === 'AUTOMATIC';
  const automaticFootballAvailable = sandbox
    ? options?.guided.football.automaticSandboxAvailable === true
    : options?.guided.football.automaticProductionAvailable === true;
  const footballCompetitions = options?.guided.football.competitions ?? [];

  const selectedFootballCompetition = useMemo(() => {
    const value = competition.trim().toLocaleLowerCase();
    if (!value) return null;
    return sportsTaxonomy.competitions.find((item) =>
      item.status === 'ACTIVE'
      && item.sportCode === 'FOOTBALL'
      && [item.name, ...(item.aliases ?? [])].some((alias) => alias.trim().toLocaleLowerCase() === value),
    ) ?? null;
  }, [competition, sportsTaxonomy.competitions]);
  const selectedGeneralSport = useMemo(
    () => sportsTaxonomy.sports.find((item) => item.status === 'ACTIVE' && item.name === details.sport) ?? null,
    [details.sport, sportsTaxonomy.sports],
  );
  const selectedGeneralCompetition = useMemo(
    () => sportsTaxonomy.competitions.find((item) =>
      item.status === 'ACTIVE'
      && item.sportCode === selectedGeneralSport?.code
      && item.name === details.competition,
    ) ?? null,
    [details.competition, selectedGeneralSport?.code, sportsTaxonomy.competitions],
  );

  const scheduleFieldsValid = [opensAt, closesAt, resolvesAfter].every((value) => value && Number.isFinite(Date.parse(value)))
    && Date.parse(closesAt) > Date.parse(opensAt)
    && Date.parse(resolvesAfter) >= Date.parse(closesAt);
  // Do not create drafts which can never be published because they expire before
  // the Admin gets to the Publishing queue.
  const scheduleValid = scheduleFieldsValid && Date.parse(closesAt) > clockNow;
  const footballScheduleValid = !automaticFootball || (
    Boolean(matchStartsAt)
    && Number.isFinite(Date.parse(matchStartsAt))
    && Date.parse(closesAt) <= Date.parse(matchStartsAt)
    && Date.parse(resolvesAfter) >= Date.parse(matchStartsAt) + (2 * 60 * 60 * 1000)
  );
  const canPublishNow = scheduleValid && Date.parse(opensAt) <= clockNow && Date.parse(closesAt) > clockNow;

  const suggestedTitle = useMemo(() => {
    if (!guided || !marketType) return '';
    if (football && homeTeam.trim() && awayTeam.trim()) {
      const where = competition.trim() ? ` in ${competition.trim()}` : '';
      if (prediction === 'DRAW') return `Will ${homeTeam.trim()} vs ${awayTeam.trim()} end in a draw${where}?`;
      if (prediction === 'AWAY_WIN') return `Will ${awayTeam.trim()} beat ${homeTeam.trim()}${where}?`;
      return `Will ${homeTeam.trim()} beat ${awayTeam.trim()}${where}?`;
    }
    if (cryptoThreshold && selectedCryptoAsset && details.threshold?.trim()) {
      const comparison = ({ GT: 'above', GTE: 'at or above', LT: 'below', LTE: 'at or below' } as Record<string, string>)[details.operator ?? 'GTE'] ?? 'at or above';
      return `Will ${selectedCryptoAsset.symbol.toUpperCase()} be ${comparison} $${details.threshold.trim()} USD at the scheduled observation time?`;
    }
    return suggestedFromTemplate(marketType.questionTemplate, details);
  }, [awayTeam, competition, cryptoThreshold, details, football, guided, homeTeam, marketType, prediction, selectedCryptoAsset]);

  const effectiveTitle = !titleEdited && suggestedTitle ? suggestedTitle : title;

  function clearMarketDetails() {
    sportsDraftRequest.current += 1;
    setSelectedFixture(null);
    setSportsDraftLoading(false);
    setSportsDraftNotice(null);
    setDetails({});
    setTitle('');
    setTitleEdited(false);
    setDescription('');
    setSourceName('');
    setSourceUrl('');
    setResultCondition('');
    setCryptoSearch('');
    setCryptoOptions([]);
    setSelectedCryptoAsset(null);
    setCryptoAssetCheck(null);
    setCryptoAssetCheckLoading(false);
    setCompetition('');
    setHomeTeam('');
    setAwayTeam('');
    setPrediction('HOME_WIN');
    setMatchStartsAt('');
    setResultChecking('VERIFIED');
  }

  function chooseCategory(next: AdminGuidedCatalogCategory) {
    setCategoryCode(next.code);
    setMarketTypeCode(next.marketTypes[0]?.code ?? '');
    clearMarketDetails();
    if (next.marketTypes[0]?.handler === 'FOOTBALL_MATCH') setResultChecking('AUTOMATIC');
    setError(null);
  }

  function chooseMarketType(next: AdminGuidedCatalogMarketType) {
    setMarketTypeCode(next.code);
    clearMarketDetails();
    if (next.handler === 'FOOTBALL_MATCH') setResultChecking('AUTOMATIC');
    setError(null);
  }

  function invalidateSportsDraft(clearSelectedFixture = false) {
    sportsDraftRequest.current += 1;
    setSportsDraftLoading(false);
    setSportsDraftNotice(null);
    setTitleEdited(false);
    if (clearSelectedFixture) setSelectedFixture(null);
  }

  function setDetail(key: string, value: string) {
    invalidateSportsDraft(key === 'sport' || key === 'competition' || key === 'competitor_a' || key === 'competitor_b');
    setDetails((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function updateMatchStart(value: string) {
    invalidateSportsDraft(true);
    setMatchStartsAt(value);
    setError(null);
    const start = Date.parse(value);
    if (!Number.isFinite(start)) return;
    if (!closesAt) setClosesAt(new Date(start).toISOString());
    if (!resolvesAfter) setResolvesAfter(new Date(start + (2 * 60 + 15) * 60 * 1000).toISOString());
  }

  function chooseSportsFixture(fixture: AdminSportsFixture, cacheKey: string) {
    sportsDraftRequest.current += 1;
    setSportsDraftLoading(false);
    setSelectedFixture({ fixture, cacheKey });
    setSportsDraftNotice(null);
    setTitle('');
    setTitleEdited(false);
    setDescription('');
    setResultCondition('');
    setSourceName(fixture.sourceName);
    setSourceUrl(fixture.sourceUrl);
    setError(null);

    const kickoff = Date.parse(fixture.startsAt);
    if (Number.isFinite(kickoff)) {
      setOpensAt(new Date().toISOString());
      setClosesAt(new Date(kickoff).toISOString());
      setResolvesAfter(new Date(kickoff + (2 * 60 + 15) * 60 * 1000).toISOString());
    }

    if (football) {
      setCompetition(fixture.competitionName);
      setHomeTeam(fixture.homeTeam);
      setAwayTeam(fixture.awayTeam);
      setMatchStartsAt(fixture.startsAt);
    } else {
      const sportName = sportsTaxonomy.sports.find((item) => item.code === fixture.sportCode)?.name ?? fixture.sportCode;
      setDetails((current) => ({
        ...current,
        sport: sportName,
        competition: fixture.competitionName,
        competitor_a: fixture.homeTeam,
        competitor_b: fixture.awayTeam,
      }));
    }
  }

  async function generateSportsMarketDraft() {
    if (!selectedFixture || !marketType) return;
    const requestId = ++sportsDraftRequest.current;
    setSportsDraftLoading(true);
    setSportsDraftNotice(null);
    setError(null);
    try {
      const draft = await createAdminSportsMarketDraft({
        cacheKey: selectedFixture.cacheKey,
        fixtureId: selectedFixture.fixture.fixtureId,
        marketTypeCode: marketType.code,
        selectedResult: football ? prediction : 'YES',
      });
      if (requestId !== sportsDraftRequest.current) return;
      setTitle(draft.title);
      setTitleEdited(true);
      setDescription(draft.description);
      if (!football) setResultCondition(draft.resolutionRules);
      setSportsDraftNotice(
        'Prepared by ' + draft.providerName + ' (' + draft.modelCode + '). Human review required before market creation. '
        + (draft.riskNotes ? 'Review note: ' + draft.riskNotes + ' ' : '')
        + 'Suggested resolution rules: ' + draft.resolutionRules,
      );
    } catch (value) {
      if (requestId !== sportsDraftRequest.current) return;
      setError(value instanceof Error ? value.message : 'The AI market draft could not be prepared.');
    } finally {
      if (requestId === sportsDraftRequest.current) setSportsDraftLoading(false);
    }
  }

  function renderSportsDraftControls() {
    if (!selectedFixture) return null;
    return (
      <View style={{ gap: theme.spacing.sm }}>
        <VadCard variant="muted" style={{ gap: 4 }}>
          <VadText variant="bodyStrong">Fixture selected</VadText>
          <VadText>{selectedFixture.fixture.homeTeam} vs {selectedFixture.fixture.awayTeam}</VadText>
          <VadText variant="caption" tone="secondary">
            {selectedFixture.fixture.competitionName} · {new Date(selectedFixture.fixture.startsAt).toLocaleString()} · Source: {selectedFixture.fixture.sourceName}
          </VadText>
        </VadCard>
        <VadButton
          label={sportsDraftLoading ? 'Preparing AI draft…' : 'Draft market with AI'}
          onPress={() => void generateSportsMarketDraft()}
          disabled={sportsDraftLoading || working || !marketType}
          loading={sportsDraftLoading}
        />
        {sportsDraftNotice ? (
          <VadCard variant="outlined" style={{ gap: 4 }}>
            <VadText variant="bodyStrong">AI draft — review required</VadText>
            <VadText variant="caption" tone="secondary">{sportsDraftNotice}</VadText>
          </VadCard>
        ) : null}
      </View>
    );
  }

  function continueFromMarket() {
    setError(null);
    if (!category) return setError('Choose a market category.');
    if (!effectiveTitle.trim()) return setError('Enter a clear YES/NO market question before continuing.');
    if (!guided) return setStep(2);
    if (!marketType) return setError('Choose the kind of event you are creating.');

    if (cryptoThreshold) {
      if (!selectedCryptoAsset) return setError('Search for and select a crypto asset from the live CoinGecko catalogue.');
      if (cryptoAssetCheckLoading) return setError('Wait for the approved Oracle feed check to finish.');
      if (!cryptoAssetCheck?.supported || cryptoAssetCheck.coinGeckoId !== selectedCryptoAsset?.id) return setError(cryptoAssetCheck?.reason ?? 'This asset does not have matching free historical-price mappings and cannot be created as an automatic threshold market.');
      if (!details.threshold?.trim() || !Number.isFinite(Number(details.threshold)) || Number(details.threshold) <= 0) return setError('Enter a price target greater than zero.');
    } else if (football) {
      if (!competition.trim() || !homeTeam.trim() || !awayTeam.trim()) return setError('Add the competition, home team and away team.');
      if (!matchStartsAt || !Number.isFinite(Date.parse(matchStartsAt))) return setError('Choose when the match starts.');
      if (resultChecking === 'VERIFIED' && !sourceName.trim()) return setError('Add the official result source VAD should use.');
    } else {
      const missing = marketType.fields.find((field) => field.required && !details[field.key]?.trim());
      if (missing) return setError(`Add ${missing.label} before continuing.`);
      if (!marketType.conditionTemplate.trim() && !resultCondition.trim()) return setError('Explain in plain language what must happen for YES to win.');
      if (marketType.sourceRequired && !sourceName.trim()) return setError('Add the authoritative result source VAD should use.');
    }
    setStep(2);
  }

  function continueFromSetup() {
    setError(null);
    if (!resolvedCountryCode || !resolvedAssetCode) return setError('Choose a market currency before continuing.');
    if (!scheduleValid) return setError(scheduleFieldsValid && Date.parse(closesAt) <= clockNow
      ? 'The closing time has already passed. Choose a future closing time; expired markets cannot be published.'
      : 'Choose valid opening, closing and result-checking times.');
    if (automaticFootball && !automaticFootballAvailable) return setError('Automatic football results are not enabled for this currency. Choose Verified result or a supported test currency.');
    if (automaticFootball && Date.parse(closesAt) > Date.parse(matchStartsAt)) return setError('For this match-result market, trading must close no later than kickoff.');
    if (automaticFootball && Date.parse(resolvesAfter) < Date.parse(matchStartsAt) + (2 * 60 * 60 * 1000)) return setError('Set result checking to at least two hours after kickoff so VAD waits for the final result.');
    if (cryptoThreshold) {
      if (!cryptoAssetCheck?.supported || !selectedCryptoAsset || cryptoAssetCheck.coinGeckoId !== selectedCryptoAsset.id) {
        setStep(1);
        return setError(cryptoAssetCheck?.reason ?? 'Recheck the selected crypto asset before continuing.');
      }
      const readinessError = cryptoThresholdReadinessError(cryptoAssetCheck.readiness, sandbox);
      if (readinessError) return setError(readinessError);
    }
    setStep(3);
  }

  async function createMarket() {
    if (working) return;
    if (!scheduleValid) {
      setError(scheduleFieldsValid && Date.parse(closesAt) <= clockNow
        ? 'The closing time has already passed. Choose a future closing time before creating the market.'
        : 'Choose valid opening, closing and result-checking times.');
      setStep(2);
      return;
    }
    if (!footballScheduleValid) {
      setError('For automatic football markets, trading must close by kickoff and result checking must be at least two hours after kickoff.');
      setStep(2);
      return;
    }
    if (!category) {
      setError('Choose a market category before creating it.');
      setStep(1);
      return;
    }
    if (cryptoThreshold && (!selectedCryptoAsset || !cryptoAssetCheck?.supported || cryptoAssetCheck.coinGeckoId !== selectedCryptoAsset.id || cryptoAssetCheckLoading)) {
      setStep(1);
      setError(cryptoAssetCheck?.reason ?? 'Select a crypto asset supported by both keyless historical-price sources before creating the market.');
      return;
    }
    if (publicationChoice === 'NOW' && !canPublishNow) return setError('Publish now needs an opening time that has already started and a closing time still in the future.');
    setWorking(true);
    setError(null);
    try {
      // Re-fetch readiness at the final mutation boundary; the policy or
      // provider health may have changed while the admin completed the form.
      if (cryptoThreshold && selectedCryptoAsset) {
        const latestCheck = await checkCryptoOracleAsset(selectedCryptoAsset.symbol, selectedCryptoAsset.id);
        setCryptoAssetCheck(latestCheck);
        if (!latestCheck.supported || latestCheck.coinGeckoId !== selectedCryptoAsset.id) {
          setStep(1);
          throw new Error(latestCheck.reason ?? 'The selected crypto asset no longer has verified settlement mappings.');
        }
        const readinessError = cryptoThresholdReadinessError(latestCheck.readiness, sandbox);
        if (readinessError) {
          setStep(2);
          throw new Error(readinessError);
        }
      }
      const common = {
        title: effectiveTitle,
        description,
        opensAt: new Date(opensAt).toISOString(),
        closesAt: new Date(closesAt).toISOString(),
        resolvesAfter: new Date(resolvesAfter).toISOString(),
        countryCode: resolvedCountryCode,
        assetCode: resolvedAssetCode,
        liquidityModel,
        publishNow: publicationChoice === 'NOW',
      };
      let result: Record<string, unknown>;
      if (!guided) {
        result = await createAdminCustomMarket({ ...common, category: category.name });
      } else if (football) {
        result = await createAdminGuidedMarket({
          ...common,
          category: 'Sports',
          setup: {
            kind: 'FOOTBALL_MATCH',
            resultChecking,
            competition,
            homeTeam,
            awayTeam,
            prediction,
            matchStartsAt,
            sourceName: resultChecking === 'VERIFIED' ? sourceName : undefined,
            sourceUrl: resultChecking === 'VERIFIED' ? sourceUrl : undefined,
          },
        });
      } else if (marketType) {
        if (cryptoThreshold) {
          if (!selectedCryptoAsset || !cryptoAssetCheck?.supported || cryptoAssetCheck.coinGeckoId !== selectedCryptoAsset.id) {
            throw new Error('Select an asset with matching, active Coinbase and Kraken historical mappings before creating this market.');
          }
        }
        result = await createAdminCatalogMarket({
          ...common,
          marketTypeCode: marketType.code,
          details,
          condition: resultCondition,
          sourceName,
          sourceUrl,
        });
      } else {
        throw new Error('Choose a market type before creating the market.');
      }
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
    const firstCategory = categories[0];
    setCategoryCode(firstCategory?.code ?? '');
    setMarketTypeCode(firstCategory?.marketTypes[0]?.code ?? '');
    clearMarketDetails();
    if (firstCategory?.marketTypes[0]?.handler === 'FOOTBALL_MATCH') setResultChecking('AUTOMATIC');
    setCountryCode('');
    setAssetCode('');
    setLiquidityModel('POOL');
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
      : `Verified result${sourceName.trim() ? ` · ${sourceName.trim()}` : ''}`
    : 'VAD configured result checking';

  if (created) {
    return (
      <View style={{ gap: theme.spacing.xl }}>
        <VadCard variant="raised" style={{ gap: theme.spacing.md, borderColor: theme.colors.yes }}>
          <VadChip label={publicationStatus === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT CREATED'} tone="yes" />
          <VadText variant="title" tone="yes">Market created successfully.</VadText>
          <VadText tone="secondary">{publicationStatus === 'PUBLISHED' ? 'The market is live and its result instructions are saved.' : 'The market is saved as a draft with its result instructions.'}</VadText>
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
        <VadText tone="secondary">Choose what kind of real-world event this is. VAD keeps the resolver and database details behind the interface.</VadText>
      </View>

      <StepRail step={step} />

      {step === 1 ? (
        <VadCard variant="raised" style={{ gap: theme.spacing.lg }}>
          <SectionTitle eyebrow="STEP 1 · MARKET" title="What is this market about?" text="Choose a category and event type, then enter normal real-world details." />

          <FieldGroup label="Creation style">
            <VadChip label="Guided setup" selected={creationStyle === 'GUIDED'} tone={creationStyle === 'GUIDED' ? 'brand' : 'neutral'} onPress={() => { setCreationStyle('GUIDED'); setTitleEdited(false); setError(null); }} />
            <VadChip label="Custom question" selected={creationStyle === 'CUSTOM'} tone={creationStyle === 'CUSTOM' ? 'brand' : 'neutral'} onPress={() => { setCreationStyle('CUSTOM'); setError(null); }} />
          </FieldGroup>

          <FieldGroup label="Category">
            {categories.map((item) => <VadChip key={item.code} label={item.name} selected={category?.code === item.code} tone={category?.code === item.code ? 'brand' : 'neutral'} onPress={() => chooseCategory(item)} />)}
          </FieldGroup>

          {category?.description ? <VadCard variant="muted"><VadText variant="caption" tone="secondary">{category.description}</VadText></VadCard> : null}

          {guided && category ? (
            <View style={{ gap: theme.spacing.lg }}>
              <FieldGroup label="Market type">
                {category.marketTypes.map((item) => <VadChip key={item.code} label={item.name} selected={marketType?.code === item.code} tone={marketType?.code === item.code ? 'brand' : 'neutral'} onPress={() => chooseMarketType(item)} />)}
              </FieldGroup>

              {marketType?.description ? <VadCard variant="muted"><VadText variant="caption" tone="secondary">{marketType.description}</VadText></VadCard> : null}

              {football ? (
                <View style={{ gap: theme.spacing.md }}>
                  <VadInput label="Competition" value={competition} onChangeText={(value) => { sportsDraftRequest.current += 1; setSportsDraftLoading(false); setSelectedFixture(null); setSportsDraftNotice(null); setCompetition(value); setTitleEdited(false); }} placeholder="La Liga" />
                  {footballCompetitions.length ? (
                    <View style={{ gap: 7 }}>
                      <VadText variant="caption" tone="secondary">Competitions available for automatic checking</VadText>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                        {footballCompetitions.map((item) => <VadChip key={item} label={item} selected={competition === item} onPress={() => { sportsDraftRequest.current += 1; setSportsDraftLoading(false); setSelectedFixture(null); setSportsDraftNotice(null); setCompetition(item); setTitleEdited(false); }} />)}
                      </View>
                    </View>
                  ) : null}
                  <AdminSportsFixturePicker
                    sportCode="FOOTBALL"
                    competitionCode={selectedFootballCompetition?.code ?? ''}
                    competitionName={selectedFootballCompetition?.name ?? competition.trim()}
                    providerCode={selectedFootballCompetition?.providerCode}
                    providerCompetitionCode={selectedFootballCompetition?.providerCompetitionCode}
                    selectedFixtureId={selectedFixture?.fixture.fixtureId}
                    onSelect={chooseSportsFixture}
                  />
                  <VadInput label="Home team" value={homeTeam} onChangeText={(value) => { sportsDraftRequest.current += 1; setSportsDraftLoading(false); setSelectedFixture(null); setSportsDraftNotice(null); setHomeTeam(value); setTitleEdited(false); }} placeholder="Real Betis" />
                  <VadInput label="Away team" value={awayTeam} onChangeText={(value) => { sportsDraftRequest.current += 1; setSportsDraftLoading(false); setSelectedFixture(null); setSportsDraftNotice(null); setAwayTeam(value); setTitleEdited(false); }} placeholder="Getafe" />
                  <FieldGroup label="Prediction">
                    <VadChip label="Home team wins" selected={prediction === 'HOME_WIN'} onPress={() => { invalidateSportsDraft(); setPrediction('HOME_WIN'); }} />
                    <VadChip label="Draw" selected={prediction === 'DRAW'} onPress={() => { invalidateSportsDraft(); setPrediction('DRAW'); }} />
                    <VadChip label="Away team wins" selected={prediction === 'AWAY_WIN'} onPress={() => { invalidateSportsDraft(); setPrediction('AWAY_WIN'); }} />
                  </FieldGroup>
                  <VadDateTimeField label="Match starts" value={matchStartsAt} onChange={updateMatchStart} hint="VAD identifies the fixture from the competition, teams and kickoff time." />
                  <FieldGroup label="Result checking">
                    <VadChip label={`Automatic · ${options?.guided.football.automaticSourceName ?? 'Football-Data.org'}`} selected={resultChecking === 'AUTOMATIC'} tone={resultChecking === 'AUTOMATIC' ? 'brand' : 'neutral'} onPress={() => { invalidateSportsDraft(); setResultChecking('AUTOMATIC'); }} />
                    <VadChip label="Verified result" selected={resultChecking === 'VERIFIED'} tone={resultChecking === 'VERIFIED' ? 'brand' : 'neutral'} onPress={() => { invalidateSportsDraft(); setResultChecking('VERIFIED'); }} />
                  </FieldGroup>
                  {resultChecking === 'VERIFIED' ? <SourceFields label="Official result source" sourceName={sourceName} sourceUrl={sourceUrl} setSourceName={setSourceName} setSourceUrl={setSourceUrl} /> : null}
                </View>
              ) : null}

              {!football && marketType ? (
                <View style={{ gap: theme.spacing.md }}>
                  {marketType.fields.filter((field) => !cryptoThreshold || !['asset_symbol', 'coingecko_id', 'quote', 'operator', 'threshold'].includes(field.key)).map((field) => (
                    field.key === 'sport' ? (
                      <FieldGroup key={field.key} label="Sport">
                        {sportsTaxonomy.sports.filter((sport) => sport.status === 'ACTIVE').map((sport) => <VadChip key={sport.code} label={sport.name} selected={details.sport === sport.name} tone={details.sport === sport.name ? 'brand' : 'neutral'} onPress={() => { setDetail('sport', sport.name); setDetail('competition', ''); }} />)}
                      </FieldGroup>
                    ) : field.key === 'competition' && category?.code === 'SPORTS' ? (
                      <View key={field.key} style={{ gap: 7 }}>
                        <FieldGroup label="Competition / league">
                          {sportsTaxonomy.competitions.filter((item) => item.status === 'ACTIVE' && (!details.sport || item.sportCode === sportsTaxonomy.sports.find((sport) => sport.name === details.sport)?.code)).map((item) => <VadChip key={`${item.sportCode}:${item.code}`} label={item.name} selected={details.competition === item.name} tone={details.competition === item.name ? 'brand' : 'neutral'} onPress={() => setDetail('competition', item.name)} />)}
                        </FieldGroup>
                        <VadText variant="caption" tone="secondary">Sport and competition choices come from the VAD database. Result handling stays with the configured VAD template and source.</VadText>
                        <AdminSportsFixturePicker
                          sportCode={selectedGeneralSport?.code ?? ''}
                          competitionCode={selectedGeneralCompetition?.code ?? ''}
                          competitionName={selectedGeneralCompetition?.name ?? details.competition ?? ''}
                          providerCode={selectedGeneralCompetition?.providerCode}
                          providerCompetitionCode={selectedGeneralCompetition?.providerCompetitionCode}
                          selectedFixtureId={selectedFixture?.fixture.fixtureId}
                          onSelect={chooseSportsFixture}
                        />
                      </View>
                    ) : (
                    <VadInput
                      key={field.key}
                      label={`${field.label}${field.required ? '' : ' · optional'}`}
                      value={details[field.key] ?? ''}
                      onChangeText={(value) => setDetail(field.key, value)}
                      placeholder={field.placeholder}
                    />
                    )
                  ))}
                  {cryptoThreshold ? (
                    <View style={{ gap: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: theme.spacing.md }}>
                      <VadText variant="bodyStrong">Select a resolvable crypto asset</VadText>
                      <VadText variant="caption" tone="secondary">Searches the live CoinGecko asset catalogue. VAD then checks Coinbase and Kraken historical mappings; the search provider is not used for settlement.</VadText>
                      <VadInput label="Search coin name or ticker" value={cryptoSearch} onChangeText={(value) => { setCryptoSearch(value); setCryptoOptions([]); setSelectedCryptoAsset(null); setCryptoAssetCheck(null); setCryptoAssetCheckLoading(false); cryptoAssetCheckRequest.current += 1; }} placeholder="Solana, SOL, Cardano, ADA…" />
                      {cryptoOptions.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                        {cryptoOptions.map((coin) => <VadChip key={coin.id} label={`${coin.name} (${coin.symbol.toUpperCase()})`} selected={selectedCryptoAsset?.id === coin.id} tone={selectedCryptoAsset?.id === coin.id ? 'brand' : 'neutral'} onPress={() => void chooseCryptoAsset(coin)} />)}
                      </View> : cryptoSearch.trim().length >= 2 ? <VadText variant="caption" tone="secondary">No matching assets returned yet. Try a different name or ticker.</VadText> : null}
                      {selectedCryptoAsset ? <VadCard variant="muted" style={{ gap: 4 }}>
                        <VadText variant="bodyStrong">{selectedCryptoAsset.name} ({selectedCryptoAsset.symbol.toUpperCase()})</VadText>
                        <VadText variant="caption" tone="secondary">CoinGecko ID: {selectedCryptoAsset.id} · Public spot: {selectedCryptoAsset.currentPrice.toLocaleString(undefined, { maximumFractionDigits: 8 })} USD</VadText>
                        {cryptoAssetCheckLoading ? <VadText variant="caption" tone="secondary">Checking Coinbase + Kraken historical support…</VadText> : cryptoAssetCheck?.supported ? <VadText variant="caption" tone="yes">Keyless settlement sources verified: Coinbase + Kraken ( {cryptoAssetCheck.coinGeckoId}). This asset can use the two-source threshold policy.</VadText> : <VadText variant="caption" tone="warning">{cryptoAssetCheck?.reason ?? 'Select an asset to check its Oracle feed.'}</VadText>}
                      </VadCard> : null}
                      <FieldGroup label="Price condition">
                        {([['GT', 'Above'], ['GTE', 'At or above'], ['LT', 'Below'], ['LTE', 'At or below']] as const).map(([value, label]) => <VadChip key={value} label={label} selected={(details.operator ?? 'GTE') === value} tone={(details.operator ?? 'GTE') === value ? 'brand' : 'neutral'} onPress={() => setDetail('operator', value)} />)}
                      </FieldGroup>
                      <VadInput label="USD price target" value={details.threshold ?? ''} onChangeText={(value) => setDetail('threshold', value.replace(/[^0-9.]/g, ''))} placeholder="e.g. 250" />
                      <VadText variant="caption" tone="secondary">The observation time is the “Check result after” time in the next step. Oracle resolution uses historical observations at that time—not the current live chart.</VadText>
                    </View>
                  ) : null}
                  {(!marketType.conditionTemplate.trim() || (category?.code === 'SPORTS' && !football)) ? (
                    <VadInput label="What must happen for YES to win?" value={resultCondition} onChangeText={setResultCondition} multiline placeholder="Describe the objective outcome in plain language." />
                  ) : null}
                  <VadCard variant="muted" style={{ gap: 4 }}>
                    <VadText variant="bodyStrong">{cryptoThreshold ? 'Automated historical-price resolution' : 'Verified result'}</VadText>
                    <VadText variant="caption" tone="secondary">{cryptoThreshold ? 'The Oracle compares Coinbase and Kraken public historical candles around the scheduled observation time. Neither source requires an API key. If either source is unavailable or the timestamps do not meet policy, the market remains pending; the live chart is display-only.' : 'VAD will verify the outcome from the source below. You do not need to configure oracle IDs, resolver types or internal event records.'}</VadText>
                  </VadCard>
                  <SourceFields label={marketType.sourceLabel} sourceName={sourceName} sourceUrl={sourceUrl} setSourceName={setSourceName} setSourceUrl={setSourceUrl} />
                </View>
              ) : null}
            </View>
          ) : null}

          {category?.code === 'SPORTS' ? renderSportsDraftControls() : null}

          <VadInput label="Market question" value={effectiveTitle} onChangeText={(value) => { setTitle(value); setTitleEdited(true); setError(null); }} multiline placeholder="Will … happen before …?" hint={guided ? 'VAD suggests a question for structured market types. You can edit it.' : 'Write one clear YES/NO question.'} />
          <VadInput label="Short context · optional" value={description} onChangeText={setDescription} multiline placeholder="Add useful context for traders." />
          {error ? <VadErrorState title="Check this step" message={error} /> : null}
          <VadButton label="Continue to setup" onPress={continueFromMarket} />
        </VadCard>
      ) : null}

      {step === 2 ? (
        <VadCard variant="raised" style={{ gap: theme.spacing.lg }}>
          <SectionTitle eyebrow="STEP 2 · TRADING SETUP" title="Choose how this market trades." text="Choose the currency, trading method and timing. Peer Pool and Order Book are available independently of the market currency." />
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
                <VadText variant="caption" tone="secondary">{sandbox ? 'TNGN uses synthetic balances and cannot be deposited or withdrawn.' : 'Use TNGN until market creation, resolution and settlement pass your sandbox tests.'}</VadText>
              </VadCard>
            </View>
          ) : null}
          {automaticFootball ? (
            <VadCard variant="muted" style={{ gap: 4 }}>
              <VadText variant="bodyStrong" tone={automaticFootballAvailable ? 'yes' : 'warning'}>{automaticFootballAvailable ? 'Automatic football results available' : 'Automatic football results are not enabled for this currency'}</VadText>
              <VadText variant="caption" tone="secondary">{automaticFootballAvailable ? 'The provider is called only when the result is due.' : 'Choose Verified result or a supported test currency.'}</VadText>
            </VadCard>
          ) : null}
          <View style={{ gap: 8 }}>
            <FieldGroup label="Trading method">
              {(options?.tradingMethods ?? [
                { code: 'POOL' as const, name: 'Peer Pool', description: '' },
                { code: 'ORDER_BOOK' as const, name: 'Order Book', description: '' },
              ]).map((method) => (
                <VadChip
                  key={method.code}
                  label={method.name}
                  selected={liquidityModel === method.code}
                  tone={liquidityModel === method.code ? 'brand' : 'neutral'}
                  onPress={() => { setLiquidityModel(method.code); setError(null); }}
                />
              ))}
            </FieldGroup>
            <VadCard variant="muted" style={{ gap: 4 }}>
              <VadText variant="bodyStrong">{liquidityModel === 'POOL' ? 'Peer Pool' : 'Order Book'}</VadText>
              <VadText variant="caption" tone="secondary">
                {liquidityModel === 'POOL'
                  ? 'Users choose YES or NO and commit stakes into a participant-funded pool. Their stake is committed immediately and the estimated payout moves as the pool changes.'
                  : 'Users trade YES or NO outcome shares by price and quantity. Orders may remain unmatched, fill partly, or fill completely depending on other traders.'}
              </VadText>
            </VadCard>
          </View>
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
          <SectionTitle eyebrow="STEP 3 · REVIEW" title="Review and finish." text="Save it as a draft or publish immediately. VAD stores the technical result rules behind the scenes." />
          <ReviewRow label="Question" value={effectiveTitle.trim()} />
          <ReviewRow label="Category" value={category?.name ?? ''} />
          {guided ? <ReviewRow label="Market type" value={marketType?.name ?? 'Guided event'} /> : null}
          {football ? <ReviewRow label="Match" value={`${homeTeam} vs ${awayTeam} · ${competition}`} /> : null}
          {football && matchStartsAt ? <ReviewRow label="Kickoff" value={new Date(matchStartsAt).toLocaleString()} /> : null}
          <ReviewRow label="Currency" value={sandbox ? 'TNGN · Sandbox' : resolvedAssetCode} />
          <ReviewRow label="Market format" value="Yes / No" />
          <ReviewRow label="Trading method" value={liquidityModel === 'POOL' ? 'Peer Pool' : 'Order Book'} />
          <ReviewRow label="Result checking" value={resultLabel} />
          <ReviewRow label="Opens" value={new Date(opensAt).toLocaleString()} />
          <ReviewRow label="Closes" value={new Date(closesAt).toLocaleString()} />
          <ReviewRow label="Check result after" value={new Date(resolvesAfter).toLocaleString()} />
          <FieldGroup label="After creation">
            <VadChip label="Save as draft" selected={publicationChoice === 'DRAFT'} tone={publicationChoice === 'DRAFT' ? 'brand' : 'neutral'} onPress={() => setPublicationChoice('DRAFT')} />
            <VadChip label="Publish now" selected={publicationChoice === 'NOW'} tone={publicationChoice === 'NOW' ? 'brand' : 'neutral'} onPress={() => setPublicationChoice('NOW')} />
          </FieldGroup>
          {publicationChoice === 'NOW' && !canPublishNow ? <VadCard variant="muted"><VadText variant="caption" tone="warning">Publish now is available only after the opening time has started and before the market closes. Choose Save as draft for future markets.</VadText></VadCard> : null}
          {error ? <VadErrorState title="Could not create market" message={error} /> : null}
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <VadButton label="Back" variant="secondary" onPress={() => { setError(null); setStep(2); }} style={{ flex: 1 }} />
            <VadButton label={working ? 'Creating…' : publicationChoice === 'NOW' ? 'Create & publish' : 'Create draft'} disabled={working || (publicationChoice === 'NOW' && !canPublishNow)} onPress={() => void createMarket()} style={{ flex: 1.4 }} />
          </View>
        </VadCard>
      ) : null}
    </View>
  );
}

function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <View style={{ gap: 3 }}><VadText variant="caption" tone="brand">{eyebrow}</VadText><VadText variant="heading">{title}</VadText><VadText tone="secondary">{text}</VadText></View>;
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={{ gap: 8 }}><VadText variant="bodyStrong">{label}</VadText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View></View>;
}

function SourceFields({ label, sourceName, sourceUrl, setSourceName, setSourceUrl }: {
  label: string;
  sourceName: string;
  sourceUrl: string;
  setSourceName: (value: string) => void;
  setSourceUrl: (value: string) => void;
}) {
  return <View style={{ gap: 10 }}><VadInput label={label} value={sourceName} onChangeText={setSourceName} placeholder="e.g. Recording Academy, official league, regulator" /><VadInput label="Source website · optional" value={sourceUrl} onChangeText={setSourceUrl} autoCapitalize="none" placeholder="https://…" /></View>;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <View style={{ gap: 2 }}><VadText variant="caption" tone="secondary">{label}</VadText><VadText variant="bodyStrong">{value || '—'}</VadText></View>;
}

function StepRail({ step }: { step: Step }) {
  return <View style={{ flexDirection: 'row', gap: 8 }}>{([1, 2, 3] as const).map((value) => <View key={value} style={{ flex: 1 }}><VadChip label={`${value}`} selected={step === value} tone={step >= value ? 'brand' : 'neutral'} /></View>)}</View>;
}
