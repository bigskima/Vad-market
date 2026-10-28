import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { hasAdminPermission } from '@/services/admin-control-api';
import { playMediaPublicUrl, uploadPlayMedia } from '@/services/play-media-api';
import { AdminPlayOperationsPanel } from './admin-play-operations-panel';
import { AdminPlayGameBuilder } from './admin-play-game-builder';
import { AdminPlaySkeleton } from '@/components/ui/screen-skeletons';
import {
  getAdminPlayDashboard,
  saveAdminPlayAdPlacement,
  saveAdminPlayCampaign,
  saveAdminPlayExperience,
  setAdminPlayDirectSponsorEnabled,
  type PlayAdminDashboard,
} from '@/services/admin-play-api';

type Section = 'builder' | 'overview' | 'experience' | 'campaign' | 'ads' | 'operations';

const emptyDashboard: PlayAdminDashboard = {
  engines: [], releases: [], experiences: [], campaigns: [], adProviders: [], adPlacements: [], rewards: [],
};
const supportedPlatforms = ['WEB', 'ANDROID', 'IOS'] as const;

function moneyLabel(value: number | string | null | undefined, currency: string) {
  if (value == null || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 2 }).format(number);
  } catch {
    return currency + ' ' + number.toLocaleString('en-NG');
  }
}

function StatusPill({ value }: { value: string }) {
  const theme = useVadTheme();
  const label = value.replaceAll('_', ' ').toLowerCase();
  const tone = value === 'ENABLED' || value === 'ACTIVE' || value === 'SETTLED'
    ? theme.colors.yes
    : value === 'PAUSED' || value === 'REVIEW_REQUIRED' || value === 'COMPLIANCE_REVIEW'
      ? theme.colors.warning
      : theme.colors.textSecondary;
  return (
    <View style={{ alignSelf: 'flex-start', borderRadius: theme.radius.pill, borderWidth: 1, borderColor: tone, paddingHorizontal: 9, paddingVertical: 5 }}>
      <VadText variant="caption" style={{ color: tone, textTransform: 'capitalize' }}>{label}</VadText>
    </View>
  );
}

function SectionTab({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: theme.radius.pill,
        paddingVertical: 9,
        paddingHorizontal: 13,
        borderWidth: 1,
        borderColor: active ? theme.colors.brandPrimary : theme.colors.border,
        backgroundColor: active ? theme.colors.brandSoft : theme.colors.surface,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <VadText variant="caption" tone={active ? 'brand' : 'secondary'}>{label}</VadText>
    </Pressable>
  );
}

function ChoiceChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
        backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
        paddingHorizontal: 12,
        paddingVertical: 10,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <VadText variant="caption" tone={selected ? 'brand' : 'secondary'}>{label}</VadText>
    </Pressable>
  );
}

export function AdminPlayScreen() {
  const theme = useVadTheme();
  const admin = useAdminData();
  const canManage = hasAdminPermission(admin.access, 'play.manage');
  const isSuperAdmin = admin.access.isSuperAdmin;

  const [dashboard, setDashboard] = useState<PlayAdminDashboard>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('builder');

  const [experienceSlug, setExperienceSlug] = useState('');
  const [experienceTitle, setExperienceTitle] = useState('');
  const [experienceType, setExperienceType] = useState('');
  const [experienceEngine, setExperienceEngine] = useState('');
  const [experienceDescription, setExperienceDescription] = useState('');
  const [experienceImagePath, setExperienceImagePath] = useState('');

  const [campaignExperience, setCampaignExperience] = useState('');
  const [campaignSlug, setCampaignSlug] = useState('');
  const [campaignTitle, setCampaignTitle] = useState('');
  const [prizeTitle, setPrizeTitle] = useState('');
  const [currency, setCurrency] = useState('');
  const [prizeCost, setPrizeCost] = useState('');
  const [profitMode, setProfitMode] = useState<'PERCENT_OF_PRIZE' | 'FIXED_AMOUNT' | ''>('');
  const [profitValue, setProfitValue] = useState('');
  const [campaignCosts, setCampaignCosts] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [maxEntries, setMaxEntries] = useState('');
  const [maxTicketsPerPurchase, setMaxTicketsPerPurchase] = useState('');
  const [userEntryLimit, setUserEntryLimit] = useState('');
  const [campaignTerms, setCampaignTerms] = useState('');
  const [campaignRefundPolicy, setCampaignRefundPolicy] = useState('');

  const [placementCode, setPlacementCode] = useState('');
  const [sponsorName, setSponsorName] = useState('');
  const [sponsorTitle, setSponsorTitle] = useState('');
  const [sponsorBody, setSponsorBody] = useState('');
  const [sponsorImagePath, setSponsorImagePath] = useState('');
  const [sponsorClick, setSponsorClick] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['WEB', 'ANDROID', 'IOS']);
  const [placementStatus, setPlacementStatus] = useState<'DRAFT' | 'ACTIVE'>('DRAFT');

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await getAdminPlayDashboard();
      setDashboard(result);
      setExperienceEngine((current) => current || result.engines[0]?.engine_key || '');
      setCampaignExperience((current) => current || result.experiences[0]?.id || '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'VAD Play admin data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => { active = false; };
  }, [load]);

  const directSponsor = dashboard.adProviders.find((provider) => provider.provider_key === 'direct-sponsor');
  const placementsCount = dashboard.adPlacements.length;
  const openCampaigns = dashboard.campaigns.filter((campaign) => ['OPEN','FUNDING_TARGET_MET','ENTRY_CLOSED','DRAW_ELIGIBLE'].includes(campaign.status)).length;
  const enginesReady = dashboard.engines.filter((engine) => engine.rollout_status === 'ENABLED' && engine.runtime_ready).length;

  const campaignEstimate = useMemo(() => {
    const prize = Number(prizeCost);
    const target = Number(profitValue);
    const costs = Number(campaignCosts);
    if (!currency || !prizeCost.trim() || !profitValue.trim() || !campaignCosts.trim() || !profitMode || !Number.isFinite(prize) || !Number.isFinite(target) || !Number.isFinite(costs) || prize <= 0 || target < 0 || costs < 0) return null;
    return prize + (profitMode === 'PERCENT_OF_PRIZE' ? prize * target / 100 : target) + costs;
  }, [campaignCosts, prizeCost, profitMode, profitValue]);

  async function runAction(action: () => Promise<unknown>, success: string) {
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The VAD Play action could not be completed.');
    } finally {
      setWorking(false);
    }
  }

  async function uploadArtworkFor(target: 'experience' | 'sponsor') {
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      const path = await uploadPlayMedia();
      if (!path) return;
      if (target === 'experience') setExperienceImagePath(path);
      else setSponsorImagePath(path);
      setMessage('Artwork uploaded to VAD Play storage.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Artwork could not be uploaded.');
    } finally {
      setWorking(false);
    }
  }

  async function createExperience() {
    if (!experienceSlug.trim() || !experienceTitle.trim() || !experienceType.trim() || !experienceEngine) {
      setError('Complete the experience slug, title, type and engine.');
      return;
    }
    await runAction(() => saveAdminPlayExperience({
      slug: experienceSlug.trim().toLowerCase().replace(/\s+/g, '-'),
      title: experienceTitle.trim(),
      description: experienceDescription.trim() || null,
      experience_type: experienceType.trim().toUpperCase().replace(/[\s-]+/g, '_'),
      engine_key: experienceEngine,
      status: 'DRAFT',
      hero_asset_url: experienceImagePath.trim() || null,
      card_asset_url: experienceImagePath.trim() || null,
      public_config: {},
      engine_config: {},
    }), 'Experience draft saved.');
    setExperienceSlug('');
    setExperienceTitle('');
    setExperienceType('');
    setExperienceDescription('');
    setExperienceImagePath('');
  }

  async function createCampaign() {
    if (!campaignExperience || !campaignSlug.trim() || !campaignTitle.trim() || !prizeTitle.trim() || !currency.trim()
      || !prizeCost.trim() || !profitMode || !profitValue.trim() || !campaignCosts.trim() || !entryPrice.trim()
      || !maxEntries.trim() || !maxTicketsPerPurchase.trim()
      || campaignTerms.trim().length < 20 || campaignRefundPolicy.trim().length < 10) {
      setError('Complete all campaign fields, including a finite entry cap, per-purchase cap, published terms and refund policy.');
      return;
    }
    const numeric = [prizeCost, profitValue, campaignCosts, entryPrice].map(Number);
    const entriesCap = Number(maxEntries);
    const purchaseCap = Number(maxTicketsPerPurchase);
    const perUserCap = userEntryLimit.trim() ? Number(userEntryLimit) : null;
    if (numeric.some((value) => !Number.isFinite(value)) || numeric[0] <= 0 || numeric[1] < 0 || numeric[2] < 0 || numeric[3] <= 0) {
      setError('Check the campaign amounts. Prize cost and entry price must be positive; target and cost budget cannot be negative.');
      return;
    }
    if (!Number.isInteger(entriesCap) || entriesCap <= 0 || !Number.isInteger(purchaseCap) || purchaseCap <= 0 || purchaseCap > entriesCap
      || (perUserCap !== null && (!Number.isInteger(perUserCap) || perUserCap <= 0 || perUserCap > entriesCap))) {
      setError('Entry caps must be positive whole numbers. Per-purchase and per-user caps cannot exceed the campaign-wide cap.');
      return;
    }
    await runAction(() => saveAdminPlayCampaign({
      experience_id: campaignExperience,
      slug: campaignSlug.trim().toLowerCase().replace(/\s+/g, '-'),
      title: campaignTitle.trim(),
      prize_title: prizeTitle.trim(),
      currency_code: currency,
      prize_cost_amount: numeric[0],
      profit_target_mode: profitMode,
      profit_target_value: numeric[1],
      campaign_cost_budget_amount: numeric[2],
      entry_price_amount: numeric[3],
      max_entries: entriesCap,
      max_tickets_per_purchase: purchaseCap,
      entry_limit_per_user: perUserCap,
      rules_public: { terms: campaignTerms.trim(), refund_policy: campaignRefundPolicy.trim() },
      engine_config: {},
    }), 'Campaign draft saved. Its threshold is calculated from this campaign’s configuration.');
    setCampaignSlug('');
    setCampaignTitle('');
    setPrizeTitle('');
    setPrizeCost('');
    setProfitMode('');
    setProfitValue('');
    setCampaignCosts('');
    setEntryPrice('');
    setMaxEntries('');
    setMaxTicketsPerPurchase('');
    setUserEntryLimit('');
    setCampaignTerms('');
    setCampaignRefundPolicy('');
  }

  async function createSponsorPlacement() {
    if (!placementCode.trim() || !sponsorTitle.trim() || platforms.length === 0) {
      setError('Enter a placement code and title, and select at least one platform.');
      return;
    }
    await runAction(() => saveAdminPlayAdPlacement({
      placement_code: placementCode.trim().toLowerCase().replace(/\s+/g, '-'),
      provider_key: 'direct-sponsor',
      status: placementStatus,
      platforms,
      starts_at: null,
      ends_at: null,
      placement_config: { creative: {
        sponsor_name: sponsorName.trim(),
        title: sponsorTitle.trim(),
        body: sponsorBody.trim(),
        image_url: sponsorImagePath.trim(),
        click_url: sponsorClick.trim(),
        image_alt: sponsorTitle.trim(),
        cta_label: 'Learn more',
      } },
    }), placementStatus === 'ACTIVE' ? 'Sponsor placement activated for the selected platforms.' : 'Sponsor placement draft saved.');
    setPlacementCode('');
    setSponsorName('');
    setSponsorTitle('');
    setSponsorBody('');
    setSponsorImagePath('');
    setSponsorClick('');
    setPlacementStatus('DRAFT');
  }

  function togglePlatform(platform: string) {
    setPlatforms((current) => current.includes(platform)
      ? current.filter((item) => item !== platform)
      : [...current, platform]);
  }

  if (!canManage) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadText variant="title">VAD Play & Ads</VadText>
        <VadText tone="secondary">This area requires the play.manage permission. Ask a Super Admin to grant access.</VadText>
      </View>
    );
  }

  if (loading) {
    return <AdminPlaySkeleton />;
  }

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: 5 }}>
        <VadText variant="caption" tone="brand" style={{ letterSpacing: 1.5 }}>VAD OPERATIONS</VadText>
        <VadText variant="title">VAD Play & Ads</VadText>
        <VadText tone="secondary">Create a game draft, configure campaign economics and review operations.</VadText>
      </View>

      {error ? (
        <VadCard>
          <View style={{ padding: theme.spacing.md, gap: 8 }}>
            <VadText variant="label" style={{ color: theme.colors.danger }}>Action needs attention</VadText>
            <VadText tone="secondary">{error}</VadText>
            <VadButton label="Retry / refresh" variant="secondary" onPress={() => void load()} />
          </View>
        </VadCard>
      ) : null}
      {message ? (
        <VadCard>
          <View style={{ padding: theme.spacing.md }}>
            <VadText tone="yes">{message}</VadText>
          </View>
        </VadCard>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {([
          ['builder', 'Create game'],
          ['overview', 'Overview'],
          ['experience', 'Experience drafts'],
          ['campaign', 'Campaign drafts'],
          ['ads', 'Ads & placements'],
          ['operations', 'Operations audit'],
        ] as [Section, string][]).map(([key, label]) => (
          <SectionTab key={key} active={section === key} label={label} onPress={() => { setSection(key); setError(null); setMessage(null); }} />
        ))}
      </View>

      {section === 'builder' ? <AdminPlayGameBuilder dashboard={dashboard} onSaved={load} /> : null}

      {section === 'overview' ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {[
              ['Engines ready', String(enginesReady)],
              ['Experience drafts', String(dashboard.experiences.filter((item) => item.status !== 'PUBLISHED').length)],
              ['Open campaigns', String(openCampaigns)],
              ['Ad placements', String(placementsCount)],
            ].map(([label, value]) => (
              <View key={label} style={{ minWidth: 135, flexGrow: 1, padding: theme.spacing.md, gap: 4, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}>
                <VadText variant="caption" tone="secondary">{label}</VadText>
                <VadText variant="title">{value}</VadText>
              </View>
            ))}
          </View>
          <VadText variant="heading">Registered game engines</VadText>
          {dashboard.engines.map((engine) => (
            <VadCard key={engine.engine_key}>
              <View style={{ padding: theme.spacing.md, gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <VadText variant="heading">{engine.display_name}</VadText>
                  <StatusPill value={engine.rollout_status} />
                </View>
                <VadText tone="secondary">{engine.description || engine.engine_key}</VadText>
                <VadText variant="caption" tone="secondary">Engine key: {engine.engine_key}</VadText>
                <VadText variant="caption" tone={engine.runtime_ready ? 'yes' : 'warning'}>
                  {engine.runtime_ready ? 'Server runtime marked ready' : 'Server runtime not ready — cannot publish or accept play'}
                </VadText>
                <VadText variant="caption" tone="tertiary">
                  Platforms declared: {engine.supported_platforms.join(', ')} · Legal review {engine.requires_legal_review ? 'required' : 'not flagged'}
                </VadText>
              </View>
            </VadCard>
          ))}
          <VadText variant="heading">Current campaigns</VadText>
          {dashboard.campaigns.length ? dashboard.campaigns.slice(0, 6).map((campaign) => (
            <VadCard key={campaign.id}>
              <View style={{ padding: theme.spacing.md, gap: 7 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
                  <VadText variant="label">{campaign.title}</VadText>
                  <StatusPill value={campaign.status} />
                </View>
                <VadText tone="secondary">{campaign.prize_title} · {campaign.currency_code}</VadText>
                <VadText variant="caption" tone="secondary">Entry price: {moneyLabel(campaign.entry_price_amount, campaign.currency_code)}</VadText>
                <VadText variant="caption" tone="secondary">Entry caps: {campaign.max_entries ?? 'Not set'} total · {campaign.max_tickets_per_purchase} per purchase</VadText>
                <VadText variant="caption" tone="secondary">Threshold: {moneyLabel(campaign.funding_threshold_amount, campaign.currency_code)}</VadText>
                <VadText variant="caption" tone="secondary">Qualifying funds: {moneyLabel(campaign.qualifying_funds_amount, campaign.currency_code)}</VadText>
              </View>
            </VadCard>
          )) : <VadText tone="secondary">No campaign drafts are recorded yet.</VadText>}
        </>
      ) : null}

      {section === 'experience' ? (
        <VadCard>
          <View style={{ padding: theme.spacing.md, gap: theme.spacing.md }}>
            <VadText variant="heading">Create an experience draft</VadText>
            <VadText tone="secondary">This creates an unpublished database record. It does not publish the experience or enable its game engine.</VadText>
            <VadInput label="URL slug" value={experienceSlug} onChangeText={setExperienceSlug} autoCapitalize="none" placeholder="e.g. prize-draws" />
            <VadInput label="Display title" value={experienceTitle} onChangeText={setExperienceTitle} placeholder="Experience name" />
            <VadInput label="Experience type key" value={experienceType} onChangeText={setExperienceType} autoCapitalize="characters" placeholder="e.g. PRIZE_DRAWS" hint="Database type key, not hardcoded into the catalogue UI." />
            <View style={{ gap: 8 }}>
              <VadText variant="label">Registered engine</VadText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {dashboard.engines.map((engine) => (
                  <ChoiceChip key={engine.engine_key} label={engine.display_name} selected={experienceEngine === engine.engine_key} onPress={() => setExperienceEngine(engine.engine_key)} />
                ))}
              </View>
            </View>
            <VadInput label="Description (optional)" value={experienceDescription} onChangeText={setExperienceDescription} multiline placeholder="Describe the experience" />
            <View style={{ gap: 8 }}>
              <VadButton
                label={experienceImagePath ? 'Replace uploaded artwork' : 'Upload artwork'}
                variant="secondary"
                onPress={() => void uploadArtworkFor('experience')}
                loading={working}
                disabled={working}
              />
              {experienceImagePath ? (
                <>
                  <Image source={{ uri: playMediaPublicUrl(experienceImagePath) ?? undefined }} accessibilityLabel="Experience artwork preview" resizeMode="cover" style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surfaceMuted }} />
                  <VadText variant="caption" tone="tertiary">Saved in VAD Play storage.</VadText>
                </>
              ) : null}
            </View>
            <VadButton label="Save experience draft" loading={working} disabled={working} onPress={() => void createExperience()} />
          </View>
        </VadCard>
      ) : null}

      {section === 'campaign' ? (
        <VadCard>
          <View style={{ padding: theme.spacing.md, gap: theme.spacing.md }}>
            <VadText variant="heading">Create a prize campaign draft</VadText>
            <VadText tone="secondary">Every campaign must define its own economics. No prize price, profit percentage, cost budget or collection threshold is assumed by this form.</VadText>
            <View style={{ gap: 8 }}>
              <VadText variant="label">Experience</VadText>
              {dashboard.experiences.filter((item) => item.engine_key === 'PRIZE_DRAW').map((experience) => (
                <ChoiceChip key={experience.id} label={experience.title} selected={campaignExperience === experience.id} onPress={() => setCampaignExperience(experience.id)} />
              ))}
              {dashboard.experiences.filter((item) => item.engine_key === 'PRIZE_DRAW').length === 0 ? (
                <VadText variant="caption" tone="warning">Save a Prize Draw experience draft first.</VadText>
              ) : null}
            </View>
            <VadInput label="Campaign slug" value={campaignSlug} onChangeText={setCampaignSlug} autoCapitalize="none" placeholder="Campaign URL slug" />
            <VadInput label="Campaign title" value={campaignTitle} onChangeText={setCampaignTitle} placeholder="Campaign name" />
            <VadInput label="Prize description" value={prizeTitle} onChangeText={setPrizeTitle} placeholder="Prize to be awarded" />
            <View style={{ gap: 8 }}>
              <VadText variant="label">Currency (required)</VadText>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['NGN', 'USDC'].map((item) => <ChoiceChip key={item} label={item} selected={currency === item} onPress={() => setCurrency(item)} />)}
              </View>
            </View>
            <VadInput label="Prize cost (required)" value={prizeCost} onChangeText={setPrizeCost} keyboardType="decimal-pad" placeholder="Enter this campaign’s prize cost" />
            <View style={{ gap: 8 }}>
              <VadText variant="label">Profit target method (required)</VadText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <ChoiceChip label="% of this prize cost" selected={profitMode === 'PERCENT_OF_PRIZE'} onPress={() => setProfitMode('PERCENT_OF_PRIZE')} />
                <ChoiceChip label="Fixed amount" selected={profitMode === 'FIXED_AMOUNT'} onPress={() => setProfitMode('FIXED_AMOUNT')} />
              </View>
            </View>
            <VadInput label={profitMode === 'PERCENT_OF_PRIZE' ? 'Profit target percentage (required)' : profitMode === 'FIXED_AMOUNT' ? 'Profit target amount (required)' : 'Profit target value (choose method first)'} value={profitValue} onChangeText={setProfitValue} keyboardType="decimal-pad" placeholder="Enter target for this campaign" />
            <VadInput label="Campaign cost budget (required)" value={campaignCosts} onChangeText={setCampaignCosts} keyboardType="decimal-pad" placeholder="Campaign costs paid from receipts" />
            <VadInput label="Entry price (required)" value={entryPrice} onChangeText={setEntryPrice} keyboardType="decimal-pad" placeholder="Price per entry" />
            <VadInput label="Campaign-wide maximum entries (required)" value={maxEntries} onChangeText={setMaxEntries} keyboardType="number-pad" placeholder="Set a finite total entry cap" />
            <VadInput label="Maximum tickets per purchase (required)" value={maxTicketsPerPurchase} onChangeText={setMaxTicketsPerPurchase} keyboardType="number-pad" placeholder="Set the purchase cap for this campaign" />
            <VadInput label="Entry limit per user (optional)" value={userEntryLimit} onChangeText={setUserEntryLimit} keyboardType="number-pad" placeholder="Leave blank for no separate per-user cap" />
            <VadInput label="Published campaign terms (required)" value={campaignTerms} onChangeText={setCampaignTerms} multiline placeholder="Explain eligibility, draw timing, prize details and selection rules" hint="At least 20 characters. These terms are saved to the campaign and checked by the server before it can open." />
            <VadInput label="Refund / funding-shortfall policy (required)" value={campaignRefundPolicy} onChangeText={setCampaignRefundPolicy} multiline placeholder="Explain when and how customers are refunded if the campaign cannot proceed" hint="At least 10 characters. Required before a campaign can open." />
            {campaignEstimate !== null ? (
              <View style={{ padding: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, gap: 5 }}>
                <VadText variant="caption" tone="secondary">Calculated funding threshold preview</VadText>
                <VadText variant="title">{moneyLabel(campaignEstimate, currency)}</VadText>
                <VadText variant="caption" tone="tertiary">This is a draft estimate from these fields only. The saved database value is authoritative; additional deducted fees must be included in campaign cost/reconciliation rules.</VadText>
              </View>
            ) : null}
            <VadButton label="Save campaign draft" loading={working} disabled={working || dashboard.experiences.filter((item) => item.engine_key === 'PRIZE_DRAW').length === 0} onPress={() => void createCampaign()} />
          </View>
        </VadCard>
      ) : null}

      {section === 'operations' ? <AdminPlayOperationsPanel /> : null}

      {section === 'ads' ? (
        <>
          <VadCard>
            <View style={{ padding: theme.spacing.md, gap: theme.spacing.md }}>
              <VadText variant="heading">Ad delivery by platform</VadText>
              <VadText tone="secondary">Web, Android and iOS share placement configuration. The first adapter is direct sponsorship; programmatic AdSense/AdMob integration and rewarded-ad provider verification are later provider-specific work, not claimed as active here.</VadText>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <VadText variant="label">Direct-sponsor provider</VadText>
                  <StatusPill value={directSponsor?.status ?? 'DISABLED'} />
                </View>
                <VadButton
                  label={directSponsor?.status === 'ENABLED' ? 'Disable provider' : 'Enable provider'}
                  variant="secondary"
                  fullWidth={false}
                  disabled={working || !isSuperAdmin}
                  loading={working}
                  onPress={() => void runAction(() => setAdminPlayDirectSponsorEnabled(directSponsor?.status !== 'ENABLED'), 'Direct-sponsor provider status updated.')}
                />
              </View>
              {!isSuperAdmin ? <VadText variant="caption" tone="warning">Only a Super Admin can enable the provider and activate a placement.</VadText> : null}
              <VadText variant="caption" tone="secondary">When enabled and a placement is active, sponsored creative will render in the configured Play slot on its selected platforms.</VadText>
            </View>
          </VadCard>
          <VadCard>
            <View style={{ padding: theme.spacing.md, gap: theme.spacing.md }}>
              <VadText variant="heading">Create sponsor placement draft</VadText>
              <VadInput label="Placement code" value={placementCode} onChangeText={setPlacementCode} autoCapitalize="none" placeholder="e.g. play-discover-banner" />
              <VadInput label="Sponsor name (optional)" value={sponsorName} onChangeText={setSponsorName} placeholder="Brand or partner name" />
              <VadInput label="Creative title" value={sponsorTitle} onChangeText={setSponsorTitle} placeholder="Sponsored message" />
              <VadInput label="Message (optional)" value={sponsorBody} onChangeText={setSponsorBody} multiline placeholder="Short sponsor message" />
              <View style={{ gap: 8 }}>
                <VadButton
                  label={sponsorImagePath ? 'Replace uploaded creative image' : 'Upload creative image'}
                  variant="secondary"
                  onPress={() => void uploadArtworkFor('sponsor')}
                  loading={working}
                  disabled={working}
                />
                {sponsorImagePath ? (
                  <>
                    <Image source={{ uri: playMediaPublicUrl(sponsorImagePath) ?? undefined }} accessibilityLabel="Sponsor creative preview" resizeMode="cover" style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surfaceMuted }} />
                    <VadText variant="caption" tone="tertiary">Saved in VAD Play storage.</VadText>
                  </>
                ) : null}
              </View>
              <VadInput label="Click URL (HTTPS, optional)" value={sponsorClick} onChangeText={setSponsorClick} keyboardType="url" autoCapitalize="none" placeholder="https://…" />
              <View style={{ gap: 8 }}>
                <VadText variant="label">Platforms</VadText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {supportedPlatforms.map((platform) => <ChoiceChip key={platform} label={platform} selected={platforms.includes(platform)} onPress={() => togglePlatform(platform)} />)}
                </View>
              </View>
              <View style={{ gap: 8 }}>
                <VadText variant="label">Placement status</VadText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <ChoiceChip label="Save as draft" selected={placementStatus === 'DRAFT'} onPress={() => setPlacementStatus('DRAFT')} />
                  {isSuperAdmin && directSponsor?.status === 'ENABLED' ? (
                    <ChoiceChip label="Activate after save" selected={placementStatus === 'ACTIVE'} onPress={() => setPlacementStatus('ACTIVE')} />
                  ) : null}
                </View>
                {placementStatus === 'ACTIVE' ? (
                  <VadText variant="caption" tone="warning">This will immediately make the sponsor creative visible in its active placements. Use only for approved advertising content.</VadText>
                ) : (
                  <VadText variant="caption" tone="secondary">Draft placements are not shown to users. Activation requires a Super Admin and the direct-sponsor provider to be enabled.</VadText>
                )}
              </View>
              <VadButton
                label={placementStatus === 'ACTIVE' ? 'Save and activate placement' : 'Save sponsor placement draft'}
                loading={working}
                disabled={working || platforms.length === 0 || (placementStatus === 'ACTIVE' && (!isSuperAdmin || directSponsor?.status !== 'ENABLED'))}
                onPress={() => void createSponsorPlacement()}
              />
            </View>
          </VadCard>
          <VadText variant="heading">Configured placements</VadText>
          {dashboard.adPlacements.length ? dashboard.adPlacements.map((placement) => (
            <VadCard key={placement.id}>
              <View style={{ padding: theme.spacing.md, gap: 7 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
                  <VadText variant="label">{placement.placement_code}</VadText>
                  <StatusPill value={placement.status} />
                </View>
                <VadText variant="caption" tone="secondary">{placement.platforms.join(', ')} · {placement.provider_key} · {placement.ad_format}</VadText>
              </View>
            </VadCard>
          )) : <VadText tone="secondary">No ad placements configured yet.</VadText>}
        </>
      ) : null}
    </View>
  );
}
