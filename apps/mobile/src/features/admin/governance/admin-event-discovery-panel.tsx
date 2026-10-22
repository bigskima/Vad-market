import { useCallback, useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { getMarketCategoryExperiences, type MarketCategoryExperience } from '@/services/crypto-market-data-api';
import {
  getAdminEventDiscoverySources,
  listAdminDiscoveredEventCandidates,
  runAdminEventDiscovery,
  setAdminEventDiscoverySourceStatus,
  setDiscoveredEventCandidateStatus,
  upsertAdminEventDiscoverySource,
  type AdminEventDiscoverySource,
  type DiscoveredEventCandidate,
} from '@/services/admin-event-discovery-api';

export function AdminEventDiscoveryPanel() {
  const theme = useVadTheme();
  const [sources, setSources] = useState<AdminEventDiscoverySource[]>([]);
  const [categories, setCategories] = useState<MarketCategoryExperience[]>([]);
  const [candidates, setCandidates] = useState<DiscoveredEventCandidate[]>([]);
  const [categoryCode, setCategoryCode] = useState('');
  const [query, setQuery] = useState('');
  const [regionCode, setRegionCode] = useState('GLOBAL');
  const [sourceCode, setSourceCode] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [sourceEndpoint, setSourceEndpoint] = useState('');
  const [sourceAdapter, setSourceAdapter] = useState<'GDELT_DOC_V2' | 'RSS_ATOM'>('RSS_ATOM');
  const [sourceCategoryCodes, setSourceCategoryCodes] = useState<string[]>(['*']);
  const [sourceRegionCodes, setSourceRegionCodes] = useState<string[]>(['*']);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [savingSource, setSavingSource] = useState(false);
  const [busyCandidate, setBusyCandidate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sourceSummary, setSourceSummary] = useState<{ name: string; status: string; count: number; cached?: boolean; stale?: boolean; message?: string }[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextSources, nextCategories, nextCandidates] = await Promise.all([
        getAdminEventDiscoverySources(),
        getMarketCategoryExperiences(),
        listAdminDiscoveredEventCandidates({ limit: 60 }),
      ]);
      setSources(nextSources);
      setCategories(nextCategories);
      setCandidates(nextCandidates);
      setCategoryCode((current) => current || nextCategories[0]?.code || '');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Event discovery controls could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const refreshCandidates = useCallback(async (nextCategory: string) => {
    try {
      setCandidates(await listAdminDiscoveredEventCandidates({ categoryCode: nextCategory || null, limit: 60 }));
    } catch (value) {
      setError(value instanceof Error ? value.message : 'The event review queue could not be refreshed.');
    }
  }, []);

  const discover = useCallback(async () => {
    if (!categoryCode) {
      setError('Choose a category before discovering events.');
      return;
    }
    setDiscovering(true);
    setError(null);
    setNotice(null);
    try {
      const result = await runAdminEventDiscovery({ categoryCode, query, regionCode });
      setSourceSummary(result.sources ?? []);
      await refreshCandidates(categoryCode);
      const total = (result.sources ?? []).reduce((sum, item) => sum + item.count, 0);
      setNotice(total
        ? 'Discovery finished. ' + total + ' source result(s) were returned or refreshed; duplicates are consolidated in the review queue.'
        : result.message || 'The source scan completed without returning matching results.');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Event discovery failed.');
    } finally {
      setDiscovering(false);
    }
  }, [categoryCode, query, regionCode, refreshCandidates]);

  const saveSource = useCallback(async () => {
    setSavingSource(true);
    setError(null);
    setNotice(null);
    try {
      await upsertAdminEventDiscoverySource({
        code: sourceCode,
        name: sourceName,
        adapterCode: sourceAdapter,
        endpoint: sourceEndpoint,
        categoryCodes: sourceCategoryCodes,
        regionCodes: sourceRegionCodes,
        status: 'DISABLED',
      });
      setSourceCode('');
      setSourceName('');
      setSourceEndpoint('');
      setSourceCategoryCodes(['*']);
      setSourceRegionCodes(['*']);
      setNotice('Source saved disabled. Review its details before enabling it.');
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'The source could not be saved.');
    } finally {
      setSavingSource(false);
    }
  }, [sourceCode, sourceName, sourceAdapter, sourceEndpoint, sourceCategoryCodes, sourceRegionCodes, load]);

  const toggleSource = useCallback(async (source: AdminEventDiscoverySource) => {
    const status = source.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      await setAdminEventDiscoverySourceStatus({ code: source.code, status });
      setNotice(source.name + ' is now ' + status.toLowerCase() + '.');
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'The source status could not be changed.');
    }
  }, [load]);

  const updateCandidate = useCallback(async (candidate: DiscoveredEventCandidate, status: 'REVIEWED' | 'IGNORED') => {
    setBusyCandidate(candidate.candidate_public_id);
    setError(null);
    try {
      await setDiscoveredEventCandidateStatus({ candidatePublicId: candidate.candidate_public_id, status });
      setNotice(status === 'REVIEWED' ? 'Candidate marked as reviewed.' : 'Candidate dismissed from review.');
      await refreshCandidates(categoryCode);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'The candidate could not be updated.');
    } finally {
      setBusyCandidate(null);
    }
  }, [categoryCode, refreshCandidates]);

  if (loading) {
    return <View style={{ gap: theme.spacing.md }}><VadSkeleton width="52%" height={28} /><VadSkeleton height={210} radius={theme.radius.lg} /><VadSkeleton height={270} radius={theme.radius.lg} /></View>;
  }

  if (error && !categories.length) {
    return <VadErrorState title="Event discovery unavailable" message={error} onRetry={() => void load()} />;
  }

  const activeSources = sources.filter((source) => source.status === 'ACTIVE').length;
  const newCandidates = candidates.filter((candidate) => candidate.status === 'DISCOVERED').length;

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: 4 }}>
        <VadText variant="label" tone="brand">MULTI-CATEGORY DISCOVERY</VadText>
        <VadText variant="title">Discover real-world events</VadText>
        <VadText variant="caption" tone="secondary">
          Search configured sources across VAD categories. Retrieved articles are evidence candidates, not published markets or resolution outcomes.
        </VadText>
      </View>

      {error ? <VadErrorState title="Some discovery actions failed" message={error} onRetry={() => void load()} /> : null}
      {notice ? (
        <VadCard variant="surface" style={{ gap: 3, borderLeftWidth: 3, borderLeftColor: theme.colors.brandPrimary }}>
          <VadText variant="bodyStrong">Update</VadText>
          <VadText variant="caption" tone="secondary">{notice}</VadText>
        </VadCard>
      ) : null}

      <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
        <View style={{ gap: 3 }}>
          <VadText variant="heading">Run discovery</VadText>
          <VadText variant="caption" tone="secondary">The category is database-driven. An empty search uses the selected category name; more precise terms usually return better results.</VadText>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {categories.map((category) => (
            <VadChip
              key={category.code}
              label={category.name}
              selected={category.code === categoryCode}
              tone={category.code === categoryCode ? 'brand' : 'neutral'}
              onPress={() => {
                setCategoryCode(category.code);
                void refreshCandidates(category.code);
              }}
            />
          ))}
        </View>
        <VadInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search terms, names, policy, release, company…"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Event discovery query"
          accessibilityHint="Search the selected category across active event-discovery sources"
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {['GLOBAL', 'NG', 'AFRICA', 'US', 'EU'].map((region) => (
            <VadChip key={region} label={region === 'GLOBAL' ? 'Global' : region} selected={regionCode === region} tone={regionCode === region ? 'brand' : 'neutral'} onPress={() => setRegionCode(region)} />
          ))}
        </View>
        <VadButton label={discovering ? 'Discovering events…' : 'Discover events'} loading={discovering} onPress={() => void discover()} leading={<VadText variant="label" tone="inverse">↻</VadText>} />
        {sourceSummary.length ? (
          <View style={{ gap: 6 }}>
            <VadText variant="label">Source results</VadText>
            {sourceSummary.map((source) => (
              <View key={source.name + source.status} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 }}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <VadText variant="bodyStrong">{source.name}</VadText>
                  {source.message ? <VadText variant="caption" tone="secondary">{source.message}</VadText> : null}
                </View>
                <VadChip label={source.status + ' · ' + source.count} tone={source.status === 'FAILED' || source.status === 'SKIPPED' ? 'warning' : 'yes'} />
              </View>
            ))}
          </View>
        ) : null}
      </VadCard>

      <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
        <View style={{ gap: 3 }}>
          <VadText variant="heading">Configured sources</VadText>
          <VadText variant="caption" tone="secondary">{activeSources} active source(s). New sources start disabled and are only used after an administrator enables them.</VadText>
        </View>
        {sources.map((source) => (
          <View key={source.code} style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.sm, gap: 7 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 180, gap: 2 }}>
                <VadText variant="bodyStrong">{source.name}</VadText>
                <VadText variant="caption" tone="secondary">{source.code} · {source.adapter_code} · {source.cache_seconds}s cache</VadText>
                <VadText variant="caption" tone="tertiary" numberOfLines={2}>{source.endpoint}</VadText>
              </View>
              <VadChip label={source.status} tone={source.status === 'ACTIVE' ? 'yes' : 'neutral'} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <VadChip
                label={source.category_codes.includes('*') ? 'All categories' : source.category_codes.map((code) => categories.find((item) => item.code === code)?.name ?? code).join(', ')}
                tone="neutral"
              />
              <VadChip label={source.region_codes.includes('*') ? 'All regions' : source.region_codes.join(', ')} tone="neutral" />
              <VadButton
                label={source.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                variant={source.status === 'ACTIVE' ? 'secondary' : 'primary'}
                size="small"
                fullWidth={false}
                onPress={() => void toggleSource(source)}
              />
            </View>
          </View>
        ))}

        <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.md, gap: theme.spacing.sm }}>
          <VadText variant="bodyStrong">Add an RSS / Atom source</VadText>
          <VadText variant="caption" tone="secondary">Use a known, trusted HTTPS feed. The URL is validated again server-side and new sources remain disabled until reviewed.</VadText>
          <VadInput value={sourceCode} onChangeText={setSourceCode} placeholder="Source code, e.g. CBN_NEWS" autoCapitalize="characters" autoCorrect={false} accessibilityLabel="Event source code" />
          <VadInput value={sourceName} onChangeText={setSourceName} placeholder="Source name" accessibilityLabel="Event source name" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <VadChip label="RSS / Atom" selected={sourceAdapter === 'RSS_ATOM'} onPress={() => setSourceAdapter('RSS_ATOM')} tone={sourceAdapter === 'RSS_ATOM' ? 'brand' : 'neutral'} />
            <VadChip label="GDELT API" selected={sourceAdapter === 'GDELT_DOC_V2'} onPress={() => { setSourceAdapter('GDELT_DOC_V2'); setSourceEndpoint('https://api.gdeltproject.org/api/v2/doc/doc'); }} tone={sourceAdapter === 'GDELT_DOC_V2' ? 'brand' : 'neutral'} />
          </View>
          <VadInput
            value={sourceEndpoint}
            onChangeText={setSourceEndpoint}
            placeholder={sourceAdapter === 'RSS_ATOM' ? 'https://example.org/feed.xml' : 'https://api.gdeltproject.org/api/v2/doc/doc'}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Event source HTTPS endpoint"
          />
          <View style={{ gap: 7 }}>
            <VadText variant="label">Category coverage</VadText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <VadChip label="All categories" selected={sourceCategoryCodes.includes('*')} tone={sourceCategoryCodes.includes('*') ? 'brand' : 'neutral'} onPress={() => setSourceCategoryCodes(['*'])} />
              {categories.map((category) => (
                <VadChip
                  key={category.code}
                  label={category.name}
                  selected={sourceCategoryCodes.includes(category.code)}
                  tone={sourceCategoryCodes.includes(category.code) ? 'brand' : 'neutral'}
                  onPress={() => setSourceCategoryCodes((current) => current.includes('*')
                    ? [category.code]
                    : current.includes(category.code)
                      ? (current.filter((code) => code !== category.code).length ? current.filter((code) => code !== category.code) : ['*'])
                      : [...current, category.code])}
                />
              ))}
            </View>
          </View>
          <View style={{ gap: 7 }}>
            <VadText variant="label">Region coverage</VadText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <VadChip label="All regions" selected={sourceRegionCodes.includes('*')} tone={sourceRegionCodes.includes('*') ? 'brand' : 'neutral'} onPress={() => setSourceRegionCodes(['*'])} />
              {['NG', 'AFRICA', 'US', 'EU'].map((region) => (
                <VadChip
                  key={region}
                  label={region}
                  selected={sourceRegionCodes.includes(region)}
                  tone={sourceRegionCodes.includes(region) ? 'brand' : 'neutral'}
                  onPress={() => setSourceRegionCodes((current) => current.includes('*')
                    ? [region]
                    : current.includes(region)
                      ? (current.filter((code) => code !== region).length ? current.filter((code) => code !== region) : ['*'])
                      : [...current, region])}
                />
              ))}
            </View>
            <VadText variant="caption" tone="tertiary">A global source may return global candidates even when the scan is filtered by region. Include country or region terms in the query to narrow results.</VadText>
          </View>
          <VadButton label="Save source disabled" variant="secondary" loading={savingSource} disabled={!sourceCode.trim() || !sourceName.trim() || !sourceEndpoint.trim()} onPress={() => void saveSource()} />
        </View>
      </VadCard>

      <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 180, gap: 2 }}>
            <VadText variant="heading">Discovered events</VadText>
            <VadText variant="caption" tone="secondary">{newCandidates} new candidate(s). These are not live prediction markets until they pass VAD&apos;s market template, evidence, review and publication flow.</VadText>
          </View>
          <VadButton label="Refresh" variant="secondary" size="small" fullWidth={false} onPress={() => void refreshCandidates(categoryCode)} />
        </View>
        {!candidates.length ? (
          <View style={{ paddingVertical: theme.spacing.md, gap: 4 }}>
            <VadText variant="bodyStrong">No candidates in this view</VadText>
            <VadText variant="caption" tone="secondary">Run discovery above, or select another category. News feeds only produce candidate evidence; they do not decide market outcomes.</VadText>
          </View>
        ) : candidates.map((candidate) => (
          <View key={candidate.candidate_public_id} style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.md, gap: 7 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 200, gap: 4 }}>
                <VadText variant="bodyStrong">{candidate.title}</VadText>
                <VadText variant="caption" tone="secondary">{candidate.category_name} · {candidate.source_name} · {candidate.region_code}</VadText>
                {candidate.summary ? <VadText variant="caption" tone="secondary">{candidate.summary}</VadText> : null}
                <VadText variant="caption" tone="tertiary">Last seen {new Date(candidate.last_seen_at).toLocaleString()}</VadText>
              </View>
              <VadChip label={candidate.status} tone={candidate.status === 'DISCOVERED' ? 'brand' : candidate.status === 'IGNORED' ? 'neutral' : 'yes'} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <VadButton
                label="Open source"
                variant="secondary"
                size="small"
                fullWidth={false}
                onPress={() => {
                  if (!candidate.source_url.startsWith('https://')) return;
                  void Linking.openURL(candidate.source_url).catch(() => setError('The source link could not be opened on this device.'));
                }}
              />
              <VadButton
                label="Mark reviewed"
                variant="secondary"
                size="small"
                fullWidth={false}
                loading={busyCandidate === candidate.candidate_public_id}
                disabled={candidate.status === 'REVIEWED' || candidate.status === 'IGNORED'}
                onPress={() => void updateCandidate(candidate, 'REVIEWED')}
              />
              <VadButton
                label="Ignore"
                variant="ghost"
                size="small"
                fullWidth={false}
                loading={busyCandidate === candidate.candidate_public_id}
                disabled={candidate.status === 'REVIEWED' || candidate.status === 'IGNORED'}
                onPress={() => void updateCandidate(candidate, 'IGNORED')}
              />
            </View>
          </View>
        ))}
        <VadText variant="caption" tone="tertiary">
          Next stage: reviewed candidates will be converted into template-backed market drafts with explicit source evidence and resolution rules. No candidate is auto-published or used as settlement evidence.
        </VadText>
      </VadCard>
    </View>
  );
}
