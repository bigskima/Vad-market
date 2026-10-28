import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { hasAdminPermission } from '@/services/admin-control-api';
import { AdminPlayOperationsPanel } from './admin-play-operations-panel';
import {
  draftPlayGame,
  generatePlayArtwork,
  pickAndUploadPlayMedia,
  type PlayMediaKind,
} from '@/services/vad-play-media-api';
import {
  getAdminPlayDashboard,
  saveAdminPlayAdPlacement,
  saveAdminPlayCampaign,
  saveAdminPlayExperience,
  setAdminPlayDirectSponsorEnabled,
  type PlayAdminDashboard,
} from '@/services/admin-play-api';

type Section = 'overview' | 'builder' | 'ads' | 'operations';

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
  const [draftIdea, setDraftIdea] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [mediaWorking, setMediaWorking] = useState(false);
  const [campaignImagePath, setCampaignImagePath] = useState('');
  const [campaignImageUrl, setCampaignImageUrl] = useState('');
  const [campaignImagePrompt, setCampaignImagePrompt] = useState('');
  const [draftRiskNotes, setDraftRiskNotes] = useState('');
  const [builderExperienceId, setBuilderExperienceId] = useState('NEW');

  const [experienceSlug, setExperienceSlug] = useState('');
  const [experienceTitle, setExperienceTitle] = useState('');
  const [experienceType, setExperienceType] = useState('');
  const [experienceEngine, setExperienceEngine] = useState('');
  const [experienceDescription, setExperienceDescription] = useState('');
  const [experienceImageUrl, setExperienceImageUrl] = useState('');

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
  const [sponsorImage, setSponsorImage] = useState('');
  const [sponsorClick, setSponsorClick] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['WEB', 'ANDROID', 'IOS']);
  const [placementStatus, setPlacementStatus] = useState<'DRAFT' | 'ACTIVE'>('DRAFT');

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await getAdminPlayDashboard();
      setDashboard(result);
      setExperienceEngine((current) => current || result.engines.find((engine) => engine.engine_key === 'PRIZE_DRAW')?.engine_key || result.engines[0]?.engine_key || 'PRIZE_DRAW');
      setCampaignExperience((current) => current || result.experiences.find((experience) => experience.engine_key === 'PRIZE_DRAW')?.id || '');
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

  async function draftGameWithAI() {
    if (draftIdea.trim().length < 8) {
      setError('Describe the game in one sentence before asking AI for a draft.');
      return;
    }
    setDrafting(true);
    setError(null);
    setMessage(null);
    try {
      const draft = await draftPlayGame({ idea: draftIdea, title: experienceTitle });
      setBuilderExperienceId('NEW');
      setExperienceEngine(draft.engineKey);
      setExperienceTitle(draft.experienceTitle);
      setExperienceSlug(draft.experienceSlug);
      setExperienceType(draft.experienceType);
      setExperienceDescription(draft.experienceDescription);
      setCampaignTitle(draft.campaignTitle);
      setCampaignSlug(draft.campaignSlug);
      setPrizeTitle(draft.prizeTitle);
      setCampaignTerms(draft.terms);
      setCampaignRefundPolicy(draft.refundPolicy);
      setCampaignImagePrompt(draft.imagePrompt);
      setDraftRiskNotes(draft.riskNotes);
      setSection('builder');
      setMessage('AI draft prepared. Confirm the details, then enter this campaign’s own economics.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'AI could not prepare this game draft.');
    } finally {
      setDrafting(false);
    }
  }

  async function chooseArtwork(kind: PlayMediaKind) {
    setMediaWorking(true);
    setError(null);
    try {
      const uploaded = await pickAndUploadPlayMedia(kind);
      if (!uploaded) return;
      if (kind === 'campaign') {
        setCampaignImagePath(uploaded.storagePath);
        setCampaignImageUrl(uploaded.publicUrl);
      } else if (kind === 'experience') {
        setExperienceImageUrl(uploaded.publicUrl);
      } else {
        setSponsorImage(uploaded.publicUrl);
      }
      setMessage('Artwork uploaded to VAD Play storage.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Artwork upload failed.');
    } finally {
      setMediaWorking(false);
    }
  }

  async function generateArtwork(kind: PlayMediaKind) {
    const title = kind === 'campaign' ? campaignTitle : kind === 'experience' ? experienceTitle : sponsorTitle;
    const description = kind === 'experience' ? experienceDescription : kind === 'campaign' ? prizeTitle : sponsorBody;
    setMediaWorking(true);
    setError(null);
    setMessage(null);
    try {
      const result = await generatePlayArtwork({
        title,
        description,
        visualPrompt: kind === 'campaign' ? campaignImagePrompt : undefined,
        imageType: kind,
      });
      if (kind === 'campaign') {
        setCampaignImagePath(result.storagePath);
        setCampaignImageUrl(result.publicUrl);
      } else if (kind === 'experience') {
        setExperienceImageUrl(result.publicUrl);
      } else {
        setSponsorImage(result.publicUrl);
      }
      setMessage('AI artwork generated and saved to VAD Play storage.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'AI artwork generation failed.');
    } finally {
      setMediaWorking(false);
    }
  }

  async function createGameDraft() {
    const existingExperience = builderExperienceId !== 'NEW'
      ? dashboard.experiences.find((item) => item.id === builderExperienceId && item.engine_key === 'PRIZE_DRAW')
      : null;
    if (builderExperienceId !== 'NEW' && !existingExperience) {
      setError('Choose a valid Prize Draw experience or select New game.');
      return;
    }
    if (builderExperienceId === 'NEW' && (!experienceSlug.trim() || !experienceTitle.trim() || !experienceType.trim())) {
      setError('Enter a game name, URL slug and type, or use AI draft help.');
      return;
    }
    if (!campaignSlug.trim() || !campaignTitle.trim() || !prizeTitle.trim() || !currency.trim()
      || !prizeCost.trim() || !profitMode || !profitValue.trim() || !campaignCosts.trim() || !entryPrice.trim()
      || !maxEntries.trim() || !maxTicketsPerPurchase.trim()
      || campaignTerms.trim().length < 20 || campaignRefundPolicy.trim().length < 10) {
      setError('Complete the campaign economics, finite entry caps, terms and refund policy before saving.');
      return;
    }
    const numeric = [prizeCost, profitValue, campaignCosts, entryPrice].map(Number);
    const entriesCap = Number(maxEntries);
    const purchaseCap = Number(maxTicketsPerPurchase);
    const perUserCap = userEntryLimit.trim() ? Number(userEntryLimit) : null;
    if (numeric.some((value) => !Number.isFinite(value)) || numeric[0] <= 0 || numeric[1] < 0 || numeric[2] < 0 || numeric[3] <= 0) {
      setError('Prize cost and entry price must be positive. Profit target and cost budget cannot be negative.');
      return;
    }
    if (!Number.isInteger(entriesCap) || entriesCap <= 0 || !Number.isInteger(purchaseCap) || purchaseCap <= 0 || purchaseCap > entriesCap
      || (perUserCap !== null && (!Number.isInteger(perUserCap) || perUserCap <= 0 || perUserCap > entriesCap))) {
      setError('Entry caps must be positive whole numbers; per-purchase and per-user limits cannot exceed the campaign cap.');
      return;
    }

    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      let experienceId = existingExperience?.id ?? '';
      if (!experienceId) {
        experienceId = await saveAdminPlayExperience({
          slug: experienceSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
          title: experienceTitle.trim(),
          description: experienceDescription.trim() || null,
          experience_type: experienceType.trim().toUpperCase().replace(/[\\s-]+/g, '_'),
          engine_key: 'PRIZE_DRAW',
          status: 'DRAFT',
          hero_asset_url: experienceImageUrl.trim() || null,
          card_asset_url: experienceImageUrl.trim() || null,
          image_alt: experienceTitle.trim() || null,
          public_config: {},
          engine_config: {},
        });
        setBuilderExperienceId(experienceId);
        setCampaignExperience(experienceId);
      }
      await saveAdminPlayCampaign({
        experience_id: experienceId,
        slug: campaignSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
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
        image_path: campaignImagePath.trim() || null,
        rules_public: { terms: campaignTerms.trim(), refund_policy: campaignRefundPolicy.trim() },
        engine_config: {},
      });
      setMessage('Game and campaign drafts saved. Review the terms, economics and artwork before approval.');
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
      setCampaignImagePath('');
      setCampaignImageUrl('');
      setDraftRiskNotes('');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The game draft could not be saved.');
    } finally {
      setWorking(false);
    }
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
        image_url: sponsorImage.trim(),
        click_url: sponsorClick.trim(),
        image_alt: sponsorTitle.trim(),
        cta_label: 'Learn more',
      } },
    }), placementStatus === 'ACTIVE' ? 'Sponsor placement activated for the selected platforms.' : 'Sponsor placement draft saved.');
    setPlacementCode('');
    setSponsorName('');
    setSponsorTitle('');
    setSponsorBody('');
    setSponsorImage('');
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
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadText variant="title">VAD Play & Ads</VadText>
        <VadText tone="secondary">Loading registered engines, campaign drafts and ad placements…</VadText>
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: 5 }}>
        <VadText variant="caption" tone="brand" style={{ letterSpacing: 1.5 }}>VAD OPERATIONS</VadText>
        <VadText variant="title">VAD Play & Ads</VadText>
        <VadText tone="secondary">Configure experiences, campaign economics and sponsor placements. Publishing and live game activation remain separately gated.</VadText>
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
          ['builder', 'Create a game'],
          ['overview', 'Overview'],
          ['ads', 'Sponsorships'],
          ['operations', 'Operations'],
        ] as [Section, string][]).map(([key, label]) => (
          <SectionTab key={key} active={section === key} label={label} onPress={() => { setSection(key); setError(null); setMessage(null); }} />
        ))}
      </View>

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

      {section === 'builder' ? (
        <View style={{ gap: theme.spacing.md }}>
          <VadCard>
            <View style={{ padding: theme.spacing.md, gap: theme.spacing.sm }}>
              <VadText variant="heading">Build a game</VadText>
              <VadText variant="caption" tone="secondary">Describe the idea, let AI prepare the copy, then confirm every campaign amount yourself.</VadText>
              <VadInput label="Game idea" value={draftIdea} onChangeText={setDraftIdea} multiline placeholder="What game or prize experience are you planning?" />
              <VadButton label="Draft with AI" variant="secondary" loading={drafting} disabled={drafting || working || draftIdea.trim().length < 8} onPress={() => void draftGameWithAI()} />
              {draftRiskNotes ? (
                <View style={{ borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.sm, gap: 3 }}>
                  <VadText variant="label">Review notes</VadText>
                  <VadText variant="caption" tone="secondary">{draftRiskNotes}</VadText>
                </View>
              ) : null}
            </View>
          </VadCard>

          <VadCard>
            <View style={{ padding: theme.spacing.md, gap: theme.spacing.md }}>
              <VadText variant="heading">1. Game details</VadText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <ChoiceChip label="New game" selected={builderExperienceId === 'NEW'} onPress={() => setBuilderExperienceId('NEW')} />
                {dashboard.experiences.filter((item) => item.engine_key === 'PRIZE_DRAW').map((item) => (
                  <ChoiceChip key={item.id} label={'Add campaign: ' + item.title} selected={builderExperienceId === item.id} onPress={() => { setBuilderExperienceId(item.id); setExperienceTitle(item.title); setExperienceSlug(item.slug); setExperienceType(item.experience_type); setExperienceDescription(item.description ?? ''); setExperienceImageUrl(item.hero_asset_url ?? item.card_asset_url ?? ''); }} />
                ))}
              </View>
              {builderExperienceId === 'NEW' ? (
                <>
                  <VadInput label="Game name" value={experienceTitle} onChangeText={setExperienceTitle} placeholder="Prize draws" />
                  <VadInput label="URL slug" value={experienceSlug} onChangeText={setExperienceSlug} autoCapitalize="none" placeholder="prize-draws" />
                  <VadInput label="Game type" value={experienceType} onChangeText={setExperienceType} autoCapitalize="characters" placeholder="PRIZE_DRAWS" />
                  <VadInput label="Short description" value={experienceDescription} onChangeText={setExperienceDescription} multiline placeholder="Briefly describe the experience" />
                  <View style={{ gap: 7 }}>
                    <VadText variant="label">Game artwork</VadText>
                    {experienceImageUrl ? <Image source={{ uri: experienceImageUrl }} accessibilityLabel="Selected game artwork" resizeMode="cover" style={{ width: '100%', height: 130, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surfaceMuted }} /> : null}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      <VadButton label="Upload image" variant="secondary" size="small" fullWidth={false} loading={mediaWorking} disabled={mediaWorking || working} onPress={() => void chooseArtwork('experience')} />
                      <VadButton label="Generate with AI" variant="secondary" size="small" fullWidth={false} loading={mediaWorking} disabled={mediaWorking || working || experienceTitle.trim().length < 2} onPress={() => void generateArtwork('experience')} />
                    </View>
                  </View>
                </>
              ) : (
                <VadText variant="caption" tone="secondary">A campaign will be attached to the selected draft experience.</VadText>
              )}
            </View>
          </VadCard>

          <VadCard>
            <View style={{ padding: theme.spacing.md, gap: theme.spacing.md }}>
              <VadText variant="heading">2. Campaign details</VadText>
              <VadInput label="Campaign name" value={campaignTitle} onChangeText={setCampaignTitle} placeholder="Campaign title" />
              <VadInput label="URL slug" value={campaignSlug} onChangeText={setCampaignSlug} autoCapitalize="none" placeholder="campaign-slug" />
              <VadInput label="Prize" value={prizeTitle} onChangeText={setPrizeTitle} placeholder="Prize to be awarded" />

              <View style={{ gap: 7 }}>
                <VadText variant="label">Campaign artwork</VadText>
                {campaignImageUrl ? <Image source={{ uri: campaignImageUrl }} accessibilityLabel="Selected campaign artwork" resizeMode="cover" style={{ width: '100%', height: 150, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surfaceMuted }} /> : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <VadButton label="Upload image" variant="secondary" size="small" fullWidth={false} loading={mediaWorking} disabled={mediaWorking || working} onPress={() => void chooseArtwork('campaign')} />
                  <VadButton label="Generate with AI" variant="secondary" size="small" fullWidth={false} loading={mediaWorking} disabled={mediaWorking || working || campaignTitle.trim().length < 2} onPress={() => void generateArtwork('campaign')} />
                </View>
                <VadInput label="Image style (optional)" value={campaignImagePrompt} onChangeText={setCampaignImagePrompt} multiline placeholder="Art direction for AI-generated artwork" />
              </View>

              <View style={{ gap: 7 }}>
                <VadText variant="label">Currency — select one</VadText>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {['NGN', 'USDC'].map((item) => <ChoiceChip key={item} label={item} selected={currency === item} onPress={() => setCurrency(item)} />)}
                </View>
              </View>
              <VadInput label="Prize cost" value={prizeCost} onChangeText={setPrizeCost} keyboardType="decimal-pad" placeholder="Enter this campaign’s prize cost" />
              <View style={{ gap: 7 }}>
                <VadText variant="label">Profit target — select method</VadText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <ChoiceChip label="% of prize cost" selected={profitMode === 'PERCENT_OF_PRIZE'} onPress={() => setProfitMode('PERCENT_OF_PRIZE')} />
                  <ChoiceChip label="Fixed amount" selected={profitMode === 'FIXED_AMOUNT'} onPress={() => setProfitMode('FIXED_AMOUNT')} />
                </View>
              </View>
              <VadInput label={profitMode === 'PERCENT_OF_PRIZE' ? 'Profit target (%)' : profitMode === 'FIXED_AMOUNT' ? 'Profit target amount' : 'Profit target value'} value={profitValue} onChangeText={setProfitValue} keyboardType="decimal-pad" placeholder="Required for this campaign" />
              <VadInput label="Campaign cost budget" value={campaignCosts} onChangeText={setCampaignCosts} keyboardType="decimal-pad" placeholder="Budget paid from receipts" />
              <VadInput label="Entry price" value={entryPrice} onChangeText={setEntryPrice} keyboardType="decimal-pad" placeholder="Price per entry" />
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <View style={{ flex: 1 }}><VadInput label="Total entry cap" value={maxEntries} onChangeText={setMaxEntries} keyboardType="number-pad" placeholder="Required" /></View>
                <View style={{ flex: 1 }}><VadInput label="Per purchase cap" value={maxTicketsPerPurchase} onChangeText={setMaxTicketsPerPurchase} keyboardType="number-pad" placeholder="Required" /></View>
              </View>
              <VadInput label="Per-user cap (optional)" value={userEntryLimit} onChangeText={setUserEntryLimit} keyboardType="number-pad" placeholder="Only if needed" />
              <VadInput label="Terms" value={campaignTerms} onChangeText={setCampaignTerms} multiline placeholder="Eligibility, timing and selection rules" hint="At least 20 characters. Review before publication." />
              <VadInput label="Refund policy" value={campaignRefundPolicy} onChangeText={setCampaignRefundPolicy} multiline placeholder="When and how customers are refunded" hint="At least 10 characters." />

              {campaignEstimate !== null ? (
                <View style={{ padding: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, gap: 4 }}>
                  <VadText variant="caption" tone="secondary">Estimated funding threshold</VadText>
                  <VadText variant="title">{moneyLabel(campaignEstimate, currency)}</VadText>
                  <VadText variant="caption" tone="tertiary">Database value is authoritative. No target, price or currency is assumed.</VadText>
                </View>
              ) : null}
              <VadButton label="Save game and campaign drafts" loading={working} disabled={working || mediaWorking || drafting} onPress={() => void createGameDraft()} />
            </View>
          </VadCard>
        </View>
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
              <View style={{ gap: 7 }}>
                <VadText variant="label">Sponsor artwork</VadText>
                {sponsorImage ? <Image source={{ uri: sponsorImage }} accessibilityLabel="Sponsor artwork preview" resizeMode="cover" style={{ width: '100%', height: 120, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surfaceMuted }} /> : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <VadButton label="Upload image" variant="secondary" size="small" fullWidth={false} loading={mediaWorking} disabled={mediaWorking || working} onPress={() => void chooseArtwork('sponsor')} />
                  <VadButton label="Generate with AI" variant="secondary" size="small" fullWidth={false} loading={mediaWorking} disabled={mediaWorking || working || sponsorTitle.trim().length < 2} onPress={() => void generateArtwork('sponsor')} />
                </View>
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
