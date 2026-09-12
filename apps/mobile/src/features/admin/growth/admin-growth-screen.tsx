import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { AdminSectionTabs } from '@/features/admin/components/admin-section-tabs';
import { pickProfileImage } from '@/lib/profile-image-picker';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import {
  decideGrowthReward,
  getAdminGrowthOptions,
  getAdminGrowthWorkspace,
  searchGrowthAccounts,
  setGrowthCampaignStatus,
  uploadGrowthMedia,
  upsertGrowthCampaign,
  upsertGrowthContract,
  upsertGrowthLink,
  upsertGrowthPartner,
  type AdminGrowthWorkspace,
  type GrowthAccountSearchResult,
  type GrowthAdminOption,
  type GrowthAdminOptions,
  type GrowthCampaign,
  type GrowthContract,
  type GrowthLink,
  type GrowthPartner,
  type GrowthReward,
} from '@/services/growth-api';

type Tab = 'campaigns' | 'partners' | 'links' | 'contracts' | 'rewards';
type Editor =
  | { kind: 'campaign'; value: GrowthCampaign | null }
  | { kind: 'partner'; value: GrowthPartner | null }
  | { kind: 'link'; value: GrowthLink | null }
  | { kind: 'contract'; value: GrowthContract | null }
  | null;
type ReviewTarget = { reward: GrowthReward; decision: 'APPROVE' | 'HOLD' | 'DISQUALIFY' };
type ChoiceOption = { value: string; label: string };

const emptyWorkspace: AdminGrowthWorkspace = {
  summary: { activeCampaigns: 0, partners: 0, attributedUsers: 0, pendingRewards: 0, approvedLiability: 0, paidRewards: 0 },
  campaigns: [], partners: [], contracts: [], links: [], rewardQueue: [],
};
const emptyOptions: GrowthAdminOptions = { assets: [], countries: [] };

const campaignTypes: ChoiceOption[] = [
  { value: 'REFERRAL', label: 'Referral promotion' },
  { value: 'AFFILIATE', label: 'Affiliate campaign' },
  { value: 'CHALLENGE', label: 'Prediction challenge' },
  { value: 'SPONSORED', label: 'Sponsored campaign' },
  { value: 'CREATOR', label: 'Creator campaign' },
  { value: 'SEASONAL', label: 'Seasonal campaign' },
  { value: 'LAUNCH', label: 'Launch campaign' },
  { value: 'EDUCATION', label: 'Education campaign' },
];
const rewardPlans: ChoiceOption[] = [
  { value: 'NONE', label: 'No financial reward' },
  { value: 'FIXED_CPA', label: 'Fixed reward per qualified person' },
  { value: 'REVENUE_SHARE', label: 'Share of VAD fees' },
  { value: 'HYBRID', label: 'Fixed reward + fee share' },
  { value: 'PRIZE_POOL', label: 'Prize pool' },
  { value: 'PROMOTIONAL_CREDIT', label: 'Promotional credit' },
  { value: 'FEE_CREDIT', label: 'Fee credit' },
];
const fundingSources: ChoiceOption[] = [
  { value: 'VAD_MARKETING', label: 'VAD marketing budget' },
  { value: 'PARTNER_FUNDED', label: 'Partner funded' },
  { value: 'SPONSOR_FUNDED', label: 'Sponsor funded' },
  { value: 'PROMOTIONAL_RESERVE', label: 'Promotional reserve' },
  { value: 'OTHER', label: 'Other approved source' },
];
const attributionChoices: ChoiceOption[] = [
  { value: 'LAST_TOUCH_BEFORE_SIGNUP', label: 'Most recent valid link before signup' },
  { value: 'FIRST_TOUCH', label: 'First valid link used' },
];
const qualificationChoices: ChoiceOption[] = [
  { value: 'KYC_VERIFIED', label: 'Identity verification completed' },
  { value: 'WALLET_FUNDED', label: 'Wallet funded' },
  { value: 'POSITION_OPENED', label: 'First market position opened' },
  { value: 'MARKET_SETTLED', label: 'First market settled' },
];
const partnerTypes: ChoiceOption[] = [
  { value: 'CELEBRITY', label: 'Celebrity' },
  { value: 'INFLUENCER', label: 'Influencer' },
  { value: 'CREATOR', label: 'Creator' },
  { value: 'COMMUNITY', label: 'Community' },
  { value: 'MEDIA', label: 'Media' },
  { value: 'AGENCY', label: 'Agency' },
  { value: 'BRAND', label: 'Brand' },
  { value: 'CAMPUS_AMBASSADOR', label: 'Campus ambassador' },
  { value: 'STRATEGIC_PARTNER', label: 'Strategic partner' },
  { value: 'OTHER', label: 'Other' },
];
const partnerStatuses: ChoiceOption[] = [
  { value: 'DRAFT', label: 'Draft' }, { value: 'ACTIVE', label: 'Active' }, { value: 'PAUSED', label: 'Paused' },
  { value: 'SUSPENDED', label: 'Suspended' }, { value: 'ENDED', label: 'Ended' }, { value: 'ARCHIVED', label: 'Archived' },
];
const contractTypes: ChoiceOption[] = [
  { value: 'CPA', label: 'Amount per qualified customer' },
  { value: 'REVENUE_SHARE', label: 'Share of VAD fees' },
  { value: 'HYBRID', label: 'Qualified customer + fee share' },
  { value: 'FLAT', label: 'Fixed campaign fee' },
  { value: 'TIERED', label: 'Tiered partner deal' },
];
const contractStatuses: ChoiceOption[] = [
  { value: 'DRAFT', label: 'Draft' }, { value: 'ACTIVE', label: 'Active' }, { value: 'PAUSED', label: 'Paused' },
  { value: 'ENDED', label: 'Ended' }, { value: 'ARCHIVED', label: 'Archived' },
];
const linkKinds: ChoiceOption[] = [
  { value: 'REFERRAL', label: 'Referral code' }, { value: 'AFFILIATE', label: 'Affiliate code' }, { value: 'CAMPAIGN', label: 'Campaign code' },
];
const destinations: ChoiceOption[] = [
  { value: '/account/growth', label: 'Rewards & campaigns' },
  { value: '/home', label: 'Home' },
  { value: '/markets', label: 'Markets' },
];
const winnerChoices: ChoiceOption[] = [
  { value: 'EQUAL', label: 'Share equally among winners' },
  { value: 'TOP_THREE', label: 'Top 3: 50% / 30% / 20%' },
  { value: 'RANKED', label: 'Ranked prizes' },
];

export function AdminGrowthScreen() {
  const theme = useVadTheme();
  const admin = useAdminData();
  const [workspace, setWorkspace] = useState<AdminGrowthWorkspace>(emptyWorkspace);
  const [options, setOptions] = useState<GrowthAdminOptions>(emptyOptions);
  const [tab, setTab] = useState<Tab>('campaigns');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor>(null);
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);

  const canManage = admin.access.isSuperAdmin || admin.access.permissions.includes('growth.manage');
  const canReview = admin.access.isSuperAdmin || admin.access.permissions.includes('growth.review');

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    setError(null);
    try {
      const [nextWorkspace, nextOptions] = await Promise.all([
        getAdminGrowthWorkspace(),
        getAdminGrowthOptions(),
      ]);
      setWorkspace(nextWorkspace);
      setOptions(nextOptions);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Growth & Partnerships could not be loaded.');
    } finally {
      if (background) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (loading) {
    return <View style={{ gap: theme.spacing.md }}><VadSkeleton height={34} width="45%" /><VadSkeleton height={92} radius={theme.radius.xl} /><VadSkeleton height={180} radius={theme.radius.xl} /></View>;
  }

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.md, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 250, gap: 3 }}>
          <VadText variant="label" tone="brand">GROWTH & PARTNERSHIPS</VadText>
          <VadText variant="title">Campaigns, partners and rewards.</VadText>
          <VadText variant="caption" tone="secondary">
            Set up promotions, partner deals, campaign codes and reward rules from one place. No technical setup is required.
          </VadText>
        </View>
        <VadButton label="Refresh" variant="secondary" size="small" fullWidth={false} loading={refreshing} onPress={() => void load(true)} />
      </View>

      {error ? <VadErrorState title="Growth & Partnerships needs attention" message={error} onRetry={() => void load(true)} /> : null}
      {message ? <VadCard variant="muted" style={{ borderLeftWidth: 3, borderLeftColor: theme.colors.yes, gap: 2 }}><VadText variant="bodyStrong" tone="yes">Saved</VadText><VadText variant="caption" tone="secondary">{message}</VadText></VadCard> : null}

      <SummaryGrid workspace={workspace} />

      <AdminSectionTabs
        active={tab}
        onChange={(value) => setTab(value as Tab)}
        items={[
          { key: 'campaigns', label: 'Campaigns', count: workspace.campaigns.length },
          { key: 'partners', label: 'Partners', count: workspace.partners.length },
          { key: 'links', label: 'Codes & links', count: workspace.links.length },
          { key: 'contracts', label: 'Partner terms', count: workspace.contracts.length },
          { key: 'rewards', label: 'Rewards', count: workspace.rewardQueue.length },
        ]}
      />

      {tab === 'campaigns' ? <CampaignSection items={workspace.campaigns} canManage={canManage} onEdit={(value) => setEditor({ kind: 'campaign', value })} onStatus={async (campaign, status) => {
        try {
          await setGrowthCampaignStatus(campaign.publicId, status, `Campaign changed to ${status.toLowerCase()}.`);
          setMessage(`${campaign.name} is now ${friendlyStatus(status).toLowerCase()}.`);
          await load(true);
        } catch (value) {
          setError(value instanceof Error ? value.message : 'Campaign status could not be changed.');
        }
      }} /> : null}
      {tab === 'partners' ? <PartnerSection items={workspace.partners} canManage={canManage} onEdit={(value) => setEditor({ kind: 'partner', value })} /> : null}
      {tab === 'links' ? <LinkSection items={workspace.links} canManage={canManage} onEdit={(value) => setEditor({ kind: 'link', value })} /> : null}
      {tab === 'contracts' ? <ContractSection items={workspace.contracts} canManage={canManage} onEdit={(value) => setEditor({ kind: 'contract', value })} /> : null}
      {tab === 'rewards' ? <RewardSection items={workspace.rewardQueue} canReview={canReview} onReview={(reward, decision) => setReviewTarget({ reward, decision })} /> : null}

      <VadBottomSheet visible={Boolean(editor)} title={editor?.kind === 'campaign' ? 'Campaign setup' : editor?.kind === 'partner' ? 'Partner profile' : editor?.kind === 'link' ? 'Campaign code or link' : 'Partner terms'} onClose={() => setEditor(null)}>
        {editor?.kind === 'campaign' ? <CampaignEditor campaign={editor.value} options={options} onSaved={async () => { setEditor(null); setMessage('Campaign updated.'); await load(true); }} /> : null}
        {editor?.kind === 'partner' ? <PartnerEditor partner={editor.value} onSaved={async () => { setEditor(null); setMessage('Partner updated.'); await load(true); }} /> : null}
        {editor?.kind === 'link' ? <LinkEditor link={editor.value} campaigns={workspace.campaigns} partners={workspace.partners} onSaved={async () => { setEditor(null); setMessage('Code updated.'); await load(true); }} /> : null}
        {editor?.kind === 'contract' ? <ContractEditor contract={editor.value} campaigns={workspace.campaigns} partners={workspace.partners} assets={options.assets} onSaved={async () => { setEditor(null); setMessage('Partner terms updated.'); await load(true); }} /> : null}
      </VadBottomSheet>

      {reviewTarget ? (
        <ReviewSheet key={`${reviewTarget.reward.publicId}:${reviewTarget.decision}`} target={reviewTarget} onClose={() => setReviewTarget(null)} onSaved={async () => { setReviewTarget(null); setMessage('Reward review saved.'); await load(true); }} />
      ) : null}
    </View>
  );
}

function SummaryGrid({ workspace }: { workspace: AdminGrowthWorkspace }) {
  const theme = useVadTheme();
  const metrics = [
    ['Live campaigns', workspace.summary.activeCampaigns],
    ['Active partners', workspace.summary.partners],
    ['People from campaigns', workspace.summary.attributedUsers],
    ['Rewards waiting', workspace.summary.pendingRewards],
    ['Approved rewards', Number(workspace.summary.approvedLiability).toLocaleString()],
    ['Rewards paid', Number(workspace.summary.paidRewards).toLocaleString()],
  ];
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>{metrics.map(([label, value]) => <VadCard key={String(label)} variant="raised" style={{ minWidth: 150, flexGrow: 1, gap: 3 }}><VadText variant="caption" tone="secondary">{label}</VadText><VadText variant="heading">{String(value)}</VadText></VadCard>)}</View>;
}

function CampaignSection({ items, canManage, onEdit, onStatus }: { items: GrowthCampaign[]; canManage: boolean; onEdit: (item: GrowthCampaign | null) => void; onStatus: (item: GrowthCampaign, status: string) => Promise<void> }) {
  const theme = useVadTheme();
  return <View style={{ gap: theme.spacing.md }}><SectionHeader title="Campaigns" subtitle="Create referral promotions, partner campaigns, prediction challenges and sponsored offers." action={canManage ? <VadButton label="New campaign" size="small" fullWidth={false} onPress={() => onEdit(null)} /> : null} />
    {items.length ? items.map((item) => <VadCard key={item.publicId} variant="raised" style={{ padding: 0, overflow: 'hidden' }}>{item.cardImageUrl ? <Image source={{ uri: item.cardImageUrl }} style={{ width: '100%', height: 112 }} resizeMode="cover" /> : null}<View style={{ padding: theme.spacing.md, gap: theme.spacing.sm }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}><View style={{ flex: 1, gap: 2 }}><VadText variant="bodyStrong">{item.name}</VadText><VadText variant="caption" tone="secondary">{campaignTypeLabel(item.type)} · {item.code}</VadText></View><VadChip label={friendlyStatus(item.status ?? 'DRAFT')} tone={item.status === 'ACTIVE' ? 'yes' : item.status === 'PAUSED' ? 'warning' : 'neutral'} /></View><VadText variant="caption" tone="secondary">{item.description}</VadText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}><VadChip label={rewardPlanLabel(item.rewardMode)} tone="brand" />{item.sponsorName ? <VadChip label={item.sponsorName} tone="neutral" /> : null}<VadChip label={`Budget ${item.rewardAssetCode ?? ''} ${Number(item.allocatedBudget ?? 0).toLocaleString()}`} tone="neutral" /><VadChip label={`Uncommitted ${Number(item.availableAmount ?? 0).toLocaleString()}`} tone="neutral" /></View>{canManage ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}><VadButton label="Edit" variant="secondary" size="small" fullWidth={false} onPress={() => onEdit(item)} />{item.status !== 'ACTIVE' ? <VadButton label="Go live" size="small" fullWidth={false} onPress={() => void onStatus(item, 'ACTIVE')} /> : <VadButton label="Pause" variant="secondary" size="small" fullWidth={false} onPress={() => void onStatus(item, 'PAUSED')} />}</View> : null}</View></VadCard>) : <VadEmptyState title="No campaigns yet" body="Create the first campaign and keep it as a draft until the offer is ready to publish." />}
  </View>;
}

function PartnerSection({ items, canManage, onEdit }: { items: GrowthPartner[]; canManage: boolean; onEdit: (item: GrowthPartner | null) => void }) {
  const theme = useVadTheme();
  return <View style={{ gap: theme.spacing.md }}><SectionHeader title="Partners" subtitle="Manage celebrities, creators, communities, media partners, agencies and brands." action={canManage ? <VadButton label="New partner" size="small" fullWidth={false} onPress={() => onEdit(null)} /> : null} />{items.length ? items.map((item) => <Pressable key={item.publicId} disabled={!canManage} onPress={() => onEdit(item)}><VadCard variant="raised" style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>{item.avatarUrl ? <Image source={{ uri: item.avatarUrl }} style={{ width: 58, height: 58, borderRadius: 29 }} /> : <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: theme.colors.brandSoft }} />}<View style={{ flex: 1, gap: 2 }}><VadText variant="bodyStrong">{item.displayName}</VadText><VadText variant="caption" tone="secondary">{partnerTypeLabel(item.type)} · {friendlyStatus(item.status)}</VadText>{item.bio ? <VadText variant="caption" tone="tertiary" numberOfLines={2}>{item.bio}</VadText> : null}</View></VadCard></Pressable>) : <VadEmptyState title="No partners yet" body="Add a partner before creating a custom affiliate code or commercial agreement." />}</View>;
}

function LinkSection({ items, canManage, onEdit }: { items: GrowthLink[]; canManage: boolean; onEdit: (item: GrowthLink | null) => void }) {
  const theme = useVadTheme();
  return <View style={{ gap: theme.spacing.md }}><SectionHeader title="Campaign codes & links" subtitle="Create vanity codes for referral campaigns, affiliates and named promotions. Normal personal invites remain non-rewarded unless a promotion says otherwise." action={canManage ? <VadButton label="New code" size="small" fullWidth={false} onPress={() => onEdit(null)} /> : null} />{items.length ? items.map((item) => <Pressable key={item.publicId} disabled={!canManage} onPress={() => onEdit(item)}><VadCard variant="raised" style={{ gap: theme.spacing.sm }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}><View style={{ flex: 1 }}><VadText variant="heading">{item.code}</VadText><VadText variant="caption" tone="secondary">{linkKindLabel(item.kind)}</VadText></View><VadChip label={friendlyStatus(item.status)} tone={item.status === 'ACTIVE' ? 'yes' : 'warning'} /><VadChip label={item.rewardable ? 'Can earn rewards' : 'Tracking only'} tone={item.rewardable ? 'brand' : 'neutral'} /></View><VadText variant="caption" tone="tertiary">{item.partnerName || item.campaignName || 'Not assigned yet'}</VadText></VadCard></Pressable>) : <VadEmptyState title="No campaign codes yet" body="Create a custom code for a partner or promotion when you need one." />}</View>;
}

function ContractSection({ items, canManage, onEdit }: { items: GrowthContract[]; canManage: boolean; onEdit: (item: GrowthContract | null) => void }) {
  const theme = useVadTheme();
  return <View style={{ gap: theme.spacing.md }}><SectionHeader title="Partner terms" subtitle="Set what an approved partner can earn without changing the app." action={canManage ? <VadButton label="New partner terms" size="small" fullWidth={false} onPress={() => onEdit(null)} /> : null} />{items.length ? items.map((item) => <Pressable key={item.publicId} disabled={!canManage} onPress={() => onEdit(item)}><VadCard variant="raised" style={{ gap: theme.spacing.sm }}><View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}><View style={{ flex: 1 }}><VadText variant="bodyStrong">{item.partnerName}</VadText><VadText variant="caption" tone="secondary">{contractTypeLabel(item.type)} · {item.campaignName || 'All qualifying campaigns'}</VadText></View><VadChip label={friendlyStatus(item.status)} tone={item.status === 'ACTIVE' ? 'yes' : 'neutral'} /></View><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>{item.cpaAmount != null ? <VadChip label={`${item.assetCode ?? ''} ${Number(item.cpaAmount).toLocaleString()} per qualified customer`} tone="brand" /> : null}{item.revenueShareBps != null ? <VadChip label={`${item.revenueShareBps / 100}% of eligible VAD fees`} tone="brand" /> : null}{item.flatFee != null ? <VadChip label={`${item.assetCode ?? ''} ${Number(item.flatFee).toLocaleString()} fixed fee`} tone="neutral" /> : null}</View></VadCard></Pressable>) : <VadEmptyState title="No partner terms yet" body="Create a partner agreement when a campaign has negotiated earnings." />}</View>;
}

function RewardSection({ items, canReview, onReview }: { items: GrowthReward[]; canReview: boolean; onReview: (item: GrowthReward, decision: 'APPROVE' | 'HOLD' | 'DISQUALIFY') => void }) {
  const theme = useVadTheme();
  return <View style={{ gap: theme.spacing.md }}><SectionHeader title="Reward review" subtitle="Check each reward before it can move to payment. Approving a reward does not itself move money." />{items.length ? items.map((item) => <VadCard key={item.publicId} variant="raised" style={{ gap: theme.spacing.sm }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}><View style={{ flex: 1 }}><VadText variant="bodyStrong">{item.campaignName}</VadText><VadText variant="caption" tone="secondary">{item.beneficiaryPartnerName || 'VAD member'} · {rewardKindLabel(item.kind)}</VadText></View><View style={{ alignItems: 'flex-end', gap: 4 }}><VadText variant="bodyStrong">{item.assetCode} {Number(item.amount).toLocaleString()}</VadText><VadChip label={rewardStatusLabel(item.status)} tone="warning" /></View></View>{canReview ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}><VadButton label="Approve" size="small" fullWidth={false} onPress={() => onReview(item, 'APPROVE')} /><VadButton label="Review later" variant="secondary" size="small" fullWidth={false} onPress={() => onReview(item, 'HOLD')} /><VadButton label="Not eligible" variant="ghost" size="small" fullWidth={false} onPress={() => onReview(item, 'DISQUALIFY')} /></View> : null}</VadCard>) : <VadEmptyState title="No rewards waiting" body="Rewards that need a review will appear here." />}</View>;
}

function CampaignEditor({ campaign, options, onSaved }: { campaign: GrowthCampaign | null; options: GrowthAdminOptions; onSaved: () => Promise<void> }) {
  const theme = useVadTheme();
  const requiredEvents = readStringArray(campaign?.qualificationRule, 'requiredEvents');
  const [form, setForm] = useState({
    code: campaign?.code ?? '',
    campaignType: campaign?.type ?? 'REFERRAL',
    name: campaign?.name ?? '',
    shortDescription: campaign?.description ?? '',
    rewardAssetCode: campaign?.rewardAssetCode ?? options.assets[0]?.code ?? 'NGN',
    rewardMode: campaign?.rewardMode ?? 'NONE',
    allocatedBudget: String(campaign?.allocatedBudget ?? 0),
    fundingSource: campaign?.fundingSource ?? 'VAD_MARKETING',
    attributionModel: campaign?.attributionModel ?? 'LAST_TOUCH_BEFORE_SIGNUP',
    attributionWindowDays: String(campaign?.attributionWindowDays ?? 30),
    countryCodes: campaign?.countryCodes?.length ? campaign.countryCodes : options.countries.slice(0, 1).map((item) => item.code),
    perUserRewardCap: campaign?.perUserRewardCap == null ? '' : String(campaign.perUserRewardCap),
    perUserQualificationCap: campaign?.perUserQualificationCap == null ? '' : String(campaign.perUserQualificationCap),
    heroImageUrl: campaign?.heroImageUrl ?? '', cardImageUrl: campaign?.cardImageUrl ?? '', squareImageUrl: campaign?.squareImageUrl ?? '',
    badgeText: campaign?.badgeText ?? '', sponsorName: campaign?.sponsorName ?? '', termsSummary: campaign?.termsSummary ?? '',
    startsAt: campaign?.startsAt ?? '', endsAt: campaign?.endsAt ?? '',
    rewardAmount: String(readNumber(campaign?.rewardConfig, 'amount', 0) || ''),
    revenueSharePercent: String(readNumber(campaign?.rewardConfig, 'revenueSharePercent', 0) || ''),
    holdDays: String(readNumber(campaign?.rewardConfig, 'holdDays', 0)),
    requiredEvents: requiredEvents.length ? requiredEvents : ['KYC_VERIFIED', 'MARKET_SETTLED'],
    newUsersOnly: readBoolean(campaign?.eligibilityRule, 'newUsersOnly', true),
    correctPoints: String(readNumber(campaign?.scoringRule, 'correctPredictionPoints', 10)),
    bonusPoints: String(readNumber(campaign?.scoringRule, 'bonusPoints', 0)),
    winnerCount: String(readNumber(campaign?.winnerRule, 'winnerCount', 10)),
    winnerDistribution: readString(campaign?.winnerRule, 'distribution', 'EQUAL'),
  });
  const [working, setWorking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patch = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));
  async function image(slot: 'heroImageUrl' | 'cardImageUrl' | 'squareImageUrl') {
    setUploading(true); setError(null);
    try { const picked = await pickProfileImage(); if (!picked) return; patch(slot, await uploadGrowthMedia(picked.bytes, picked.mimeType, slot)); }
    catch (value) { setError(value instanceof Error ? value.message : 'Image upload failed.'); }
    finally { setUploading(false); }
  }
  async function save() {
    setWorking(true); setError(null);
    try {
      await upsertGrowthCampaign(campaign?.publicId ?? null, {
        code: form.code,
        campaignType: form.campaignType,
        name: form.name,
        shortDescription: form.shortDescription,
        status: campaign?.status && ['DRAFT', 'SCHEDULED', 'PAUSED'].includes(campaign.status) ? campaign.status : 'DRAFT',
        rewardAssetCode: form.rewardAssetCode,
        rewardMode: form.rewardMode,
        allocatedBudget: Number(form.allocatedBudget || 0),
        fundingSource: form.fundingSource,
        attributionModel: form.attributionModel,
        attributionWindowDays: Number(form.attributionWindowDays || 30),
        countryCodes: form.countryCodes,
        perUserRewardCap: form.perUserRewardCap,
        perUserQualificationCap: form.perUserQualificationCap,
        heroImageUrl: form.heroImageUrl,
        cardImageUrl: form.cardImageUrl,
        squareImageUrl: form.squareImageUrl,
        badgeText: form.badgeText,
        sponsorName: form.sponsorName,
        termsSummary: form.termsSummary,
        startsAt: form.startsAt,
        endsAt: form.endsAt,
        rewardConfig: {
          amount: Number(form.rewardAmount || 0),
          revenueSharePercent: Number(form.revenueSharePercent || 0),
          holdDays: Number(form.holdDays || 0),
        },
        qualificationRule: { requiredEvents: form.requiredEvents },
        eligibilityRule: { newUsersOnly: form.newUsersOnly },
        scoringRule: {
          correctPredictionPoints: Number(form.correctPoints || 0),
          bonusPoints: Number(form.bonusPoints || 0),
        },
        winnerRule: {
          winnerCount: Number(form.winnerCount || 0),
          distribution: form.winnerDistribution,
        },
        visualConfig: {},
      });
      await onSaved();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Campaign could not be saved.');
    } finally { setWorking(false); }
  }
  const fixedReward = ['FIXED_CPA', 'HYBRID', 'PROMOTIONAL_CREDIT', 'FEE_CREDIT'].includes(form.rewardMode);
  const feeShare = ['REVENUE_SHARE', 'HYBRID'].includes(form.rewardMode);
  const isChallenge = form.campaignType === 'CHALLENGE';
  return <EditorScroll>
    <SectionHeader title="Campaign identity" subtitle="What users will see and how this campaign is identified." />
    <VadInput label="Campaign code" value={form.code} onChangeText={(value) => patch('code', value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} autoCapitalize="characters" hint="Example: EPL_FANS_2026" />
    <ChoiceRow label="Campaign type" value={form.campaignType} options={campaignTypes} onChange={(value) => patch('campaignType', value as typeof form.campaignType)} />
    <VadInput label="Campaign name" value={form.name} onChangeText={(value) => patch('name', value)} />
    <VadInput label="Short description" value={form.shortDescription} onChangeText={(value) => patch('shortDescription', value)} multiline />
    <VadInput label="Badge text (optional)" value={form.badgeText} onChangeText={(value) => patch('badgeText', value)} hint="Example: Limited time" />
    <VadInput label="Sponsor name (optional)" value={form.sponsorName} onChangeText={(value) => patch('sponsorName', value)} />

    <SectionHeader title="Reward setup" subtitle="Choose what this campaign can award and its maximum budget." />
    <ChoiceRow label="Reward plan" value={form.rewardMode} options={rewardPlans} onChange={(value) => patch('rewardMode', value)} />
    {form.rewardMode !== 'NONE' ? <>
      <ChoiceRow label="Reward currency" value={form.rewardAssetCode} options={options.assets.map((item) => ({ value: item.code, label: `${item.name} (${item.code})` }))} onChange={(value) => patch('rewardAssetCode', value)} />
      <VadInput label="Campaign budget" value={form.allocatedBudget} onChangeText={(value) => patch('allocatedBudget', moneyInput(value))} keyboardType="decimal-pad" />
      <ChoiceRow label="Budget source" value={form.fundingSource} options={fundingSources} onChange={(value) => patch('fundingSource', value)} />
    </> : null}
    {fixedReward ? <VadInput label={form.rewardMode === 'FIXED_CPA' || form.rewardMode === 'HYBRID' ? 'Reward per qualified person' : 'Credit amount'} value={form.rewardAmount} onChangeText={(value) => patch('rewardAmount', moneyInput(value))} keyboardType="decimal-pad" /> : null}
    {feeShare ? <VadInput label="Share of eligible VAD fees (%)" value={form.revenueSharePercent} onChangeText={(value) => patch('revenueSharePercent', moneyInput(value))} keyboardType="decimal-pad" hint="Example: 10 means 10%." /> : null}
    {form.rewardMode !== 'NONE' ? <VadInput label="Waiting period before review (days)" value={form.holdDays} onChangeText={(value) => patch('holdDays', digits(value))} keyboardType="number-pad" /> : null}

    <SectionHeader title="Who qualifies" subtitle="Select the checks that must be completed before a reward can be reviewed." />
    <MultiChoice label="Required steps" values={form.requiredEvents} options={qualificationChoices} onChange={(value) => patch('requiredEvents', value)} />
    <ChoiceRow label="Who can qualify" value={form.newUsersOnly ? 'NEW' : 'ANY'} options={[{ value: 'NEW', label: 'New VAD users only' }, { value: 'ANY', label: 'New and existing users' }]} onChange={(value) => patch('newUsersOnly', value === 'NEW')} />
    <VadInput label="Maximum rewards per person (optional)" value={form.perUserQualificationCap} onChangeText={(value) => patch('perUserQualificationCap', digits(value))} keyboardType="number-pad" />
    <VadInput label="Maximum total reward per person (optional)" value={form.perUserRewardCap} onChangeText={(value) => patch('perUserRewardCap', moneyInput(value))} keyboardType="decimal-pad" />

    <SectionHeader title="Campaign reach" subtitle="Control where the campaign is available and how partner links receive credit." />
    <MultiChoice label="Eligible countries" values={form.countryCodes} options={options.countries.map((item) => ({ value: item.code, label: item.name }))} onChange={(value) => patch('countryCodes', value)} />
    <ChoiceRow label="If more than one partner link is used" value={form.attributionModel} options={attributionChoices} onChange={(value) => patch('attributionModel', value)} />
    <VadInput label="How long a partner link stays valid (days)" value={form.attributionWindowDays} onChangeText={(value) => patch('attributionWindowDays', digits(value))} keyboardType="number-pad" />

    {isChallenge ? <>
      <SectionHeader title="Challenge scoring" subtitle="Set simple scoring and winner rules without editing technical settings." />
      <VadInput label="Points for a correct prediction" value={form.correctPoints} onChangeText={(value) => patch('correctPoints', moneyInput(value))} keyboardType="decimal-pad" />
      <VadInput label="Bonus points (optional)" value={form.bonusPoints} onChangeText={(value) => patch('bonusPoints', moneyInput(value))} keyboardType="decimal-pad" />
      <VadInput label="Number of winners" value={form.winnerCount} onChangeText={(value) => patch('winnerCount', digits(value))} keyboardType="number-pad" />
      <ChoiceRow label="Prize distribution" value={form.winnerDistribution} options={winnerChoices} onChange={(value) => patch('winnerDistribution', value)} />
    </> : null}

    <SectionHeader title="Campaign artwork" subtitle="Use dedicated artwork so promotions look intentional across mobile and desktop." />
    <MediaField label="Wide hero banner" url={form.heroImageUrl} uploading={uploading} onPick={() => void image('heroImageUrl')} />
    <MediaField label="Campaign card image" url={form.cardImageUrl} uploading={uploading} onPick={() => void image('cardImageUrl')} />
    <MediaField label="Square artwork" url={form.squareImageUrl} uploading={uploading} onPick={() => void image('squareImageUrl')} square />

    <SectionHeader title="Timing & terms" subtitle="Set the campaign window and a plain-language summary users can understand." />
    <VadInput label="Start date & time (optional)" value={form.startsAt} onChangeText={(value) => patch('startsAt', value)} placeholder="2026-09-20 09:00" />
    <VadInput label="End date & time (optional)" value={form.endsAt} onChangeText={(value) => patch('endsAt', value)} placeholder="2026-10-20 23:59" />
    <VadInput label="Campaign terms summary" value={form.termsSummary} onChangeText={(value) => patch('termsSummary', value)} multiline placeholder="Explain the key eligibility, timing and reward conditions in plain language." />
    {error ? <VadErrorState title="Campaign not saved" message={error} /> : null}
    <VadButton label="Save campaign" loading={working} disabled={uploading || !form.name.trim() || !form.code.trim()} onPress={() => void save()} />
  </EditorScroll>;
}

function PartnerEditor({ partner, onSaved }: { partner: GrowthPartner | null; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ partnerType: partner?.type ?? 'CREATOR', name: partner?.name ?? partner?.displayName ?? '', displayName: partner?.displayName ?? '', linkedUserId: partner?.linkedUserId ?? '', status: partner?.status ?? 'DRAFT', bio: partner?.bio ?? '', avatarUrl: partner?.avatarUrl ?? '', bannerUrl: partner?.bannerUrl ?? '' });
  const [accountSearch, setAccountSearch] = useState('');
  const [accounts, setAccounts] = useState<GrowthAccountSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [working, setWorking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patch = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function image(slot: 'avatarUrl' | 'bannerUrl') { setUploading(true); setError(null); try { const picked = await pickProfileImage(); if (!picked) return; patch(slot, await uploadGrowthMedia(picked.bytes, picked.mimeType, `partner-${slot}`)); } catch (value) { setError(value instanceof Error ? value.message : 'Image upload failed.'); } finally { setUploading(false); } }
  async function searchAccounts() { if (accountSearch.trim().length < 2) return; setSearching(true); setError(null); try { setAccounts(await searchGrowthAccounts(accountSearch)); } catch (value) { setError(value instanceof Error ? value.message : 'VAD accounts could not be searched.'); } finally { setSearching(false); } }
  async function save() { setWorking(true); setError(null); try { await upsertGrowthPartner(partner?.publicId ?? null, { ...form, publicMetadata: {} }); await onSaved(); } catch (value) { setError(value instanceof Error ? value.message : 'Partner could not be saved.'); } finally { setWorking(false); } }
  return <EditorScroll>
    <ChoiceRow label="Partner type" value={form.partnerType} options={partnerTypes} onChange={(value) => patch('partnerType', value)} />
    <VadInput label="Partner / business name" value={form.name} onChangeText={(value) => patch('name', value)} />
    <VadInput label="Public display name" value={form.displayName} onChangeText={(value) => patch('displayName', value)} />
    <ChoiceRow label="Status" value={form.status} options={partnerStatuses} onChange={(value) => patch('status', value)} />
    <VadInput label="About this partner" value={form.bio} onChangeText={(value) => patch('bio', value)} multiline />
    <SectionHeader title="Linked VAD account" subtitle="Link the partner to their VAD account when they need in-app earnings or partner access." />
    {form.linkedUserId ? <VadCard variant="muted" style={{ gap: 4 }}><VadText variant="bodyStrong">VAD account linked</VadText><VadText variant="caption" tone="secondary">You can replace or remove this link below.</VadText><VadButton label="Remove link" variant="ghost" size="small" fullWidth={false} onPress={() => patch('linkedUserId', '')} /></VadCard> : null}
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}><View style={{ flex: 1 }}><VadInput label="Find by display name or username" value={accountSearch} onChangeText={setAccountSearch} autoCapitalize="none" /></View><VadButton label="Search" size="small" fullWidth={false} loading={searching} disabled={accountSearch.trim().length < 2} onPress={() => void searchAccounts()} /></View>
    {accounts.length ? <View style={{ gap: 6 }}>{accounts.map((account) => <Pressable key={account.user_id} onPress={() => patch('linkedUserId', account.user_id)}><VadCard variant={form.linkedUserId === account.user_id ? 'brand' : 'outlined'} style={{ gap: 2 }}><VadText variant="bodyStrong">{account.display_name}</VadText><VadText variant="caption" tone="secondary">{account.handle ? `@${account.handle}` : 'VAD member'}</VadText></VadCard></Pressable>)}</View> : null}
    <MediaField label="Partner profile image" url={form.avatarUrl} uploading={uploading} onPick={() => void image('avatarUrl')} square />
    <MediaField label="Partner banner" url={form.bannerUrl} uploading={uploading} onPick={() => void image('bannerUrl')} />
    {error ? <VadErrorState title="Partner not saved" message={error} /> : null}
    <VadButton label="Save partner" loading={working} disabled={uploading || !form.name.trim()} onPress={() => void save()} />
  </EditorScroll>;
}

function LinkEditor({ link, campaigns, partners, onSaved }: { link: GrowthLink | null; campaigns: GrowthCampaign[]; partners: GrowthPartner[]; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ code: link?.code ?? '', linkKind: link?.kind ?? 'AFFILIATE', partnerPublicId: link?.partnerPublicId ?? '', campaignPublicId: link?.campaignPublicId ?? '', rewardable: String(link?.rewardable ?? true), status: link?.status ?? 'ACTIVE', destinationPath: link?.destinationPath ?? '/account/growth', expiresAt: link?.expiresAt ?? '' });
  const [working, setWorking] = useState(false); const [error, setError] = useState<string | null>(null);
  const patch = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function save() { setWorking(true); setError(null); try { await upsertGrowthLink(link?.publicId ?? null, { ...form, rewardable: form.rewardable === 'true' }); await onSaved(); } catch (value) { setError(value instanceof Error ? value.message : 'Code could not be saved.'); } finally { setWorking(false); } }
  return <EditorScroll>
    <VadInput label="Custom code" value={form.code} onChangeText={(value) => patch('code', value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))} hint="Example: DAVIDO or CAMPUS25" />
    <ChoiceRow label="Code type" value={form.linkKind} options={linkKinds} onChange={(value) => patch('linkKind', value)} />
    <ChoiceRow label="Can this code earn a campaign reward?" value={form.rewardable} options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No, tracking only' }]} onChange={(value) => patch('rewardable', value)} />
    <EntityChoice label="Partner (optional)" value={form.partnerPublicId} items={partners.map((item) => ({ value: item.publicId, label: item.displayName }))} onChange={(value) => patch('partnerPublicId', value)} allowNone />
    <EntityChoice label="Campaign (optional)" value={form.campaignPublicId} items={campaigns.map((item) => ({ value: item.publicId, label: item.name }))} onChange={(value) => patch('campaignPublicId', value)} allowNone />
    <ChoiceRow label="Where should this link open?" value={form.destinationPath} options={destinations} onChange={(value) => patch('destinationPath', value)} />
    <VadInput label="Expiry date & time (optional)" value={form.expiresAt} onChangeText={(value) => patch('expiresAt', value)} placeholder="2026-10-20 23:59" />
    {error ? <VadErrorState title="Code not saved" message={error} /> : null}
    <VadButton label="Save code" loading={working} disabled={!form.code.trim()} onPress={() => void save()} />
  </EditorScroll>;
}

function ContractEditor({ contract, campaigns, partners, assets, onSaved }: { contract: GrowthContract | null; campaigns: GrowthCampaign[]; partners: GrowthPartner[]; assets: GrowthAdminOption[]; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({
    partnerPublicId: contract?.partnerPublicId ?? '', campaignPublicId: contract?.campaignPublicId ?? '', contractType: contract?.type ?? 'CPA', status: contract?.status ?? 'DRAFT', rewardAssetCode: contract?.assetCode ?? assets[0]?.code ?? 'NGN', cpaAmount: contract?.cpaAmount == null ? '' : String(contract.cpaAmount), revenueSharePercent: contract?.revenueShareBps == null ? '' : String(contract.revenueShareBps / 100), revenueShareDays: contract?.revenueShareDays == null ? '' : String(contract.revenueShareDays), flatFee: contract?.flatFee == null ? '' : String(contract.flatFee), payoutCap: contract?.payoutCap == null ? '' : String(contract.payoutCap), startsAt: contract?.startsAt ?? '', endsAt: contract?.endsAt ?? '', paymentSchedule: readString(contract?.terms, 'paymentSchedule', 'MONTHLY'), notes: readString(contract?.terms, 'notes', ''),
  });
  const [working, setWorking] = useState(false); const [error, setError] = useState<string | null>(null);
  const patch = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function save() { setWorking(true); setError(null); try { await upsertGrowthContract(contract?.publicId ?? null, { partnerPublicId: form.partnerPublicId, campaignPublicId: form.campaignPublicId, contractType: form.contractType, status: form.status, rewardAssetCode: form.rewardAssetCode, cpaAmount: form.cpaAmount, revenueShareBps: form.revenueSharePercent ? Math.round(Number(form.revenueSharePercent) * 100) : '', revenueShareDays: form.revenueShareDays, flatFee: form.flatFee, payoutCap: form.payoutCap, startsAt: form.startsAt, endsAt: form.endsAt, terms: { paymentSchedule: form.paymentSchedule, notes: form.notes } }); await onSaved(); } catch (value) { setError(value instanceof Error ? value.message : 'Partner terms could not be saved.'); } finally { setWorking(false); } }
  return <EditorScroll>
    <EntityChoice label="Partner" value={form.partnerPublicId} items={partners.map((item) => ({ value: item.publicId, label: item.displayName }))} onChange={(value) => patch('partnerPublicId', value)} />
    <EntityChoice label="Campaign (optional)" value={form.campaignPublicId} items={campaigns.map((item) => ({ value: item.publicId, label: item.name }))} onChange={(value) => patch('campaignPublicId', value)} allowNone />
    <ChoiceRow label="Earning arrangement" value={form.contractType} options={contractTypes} onChange={(value) => patch('contractType', value)} />
    <ChoiceRow label="Status" value={form.status} options={contractStatuses} onChange={(value) => patch('status', value)} />
    <ChoiceRow label="Payment currency" value={form.rewardAssetCode} options={assets.map((item) => ({ value: item.code, label: `${item.name} (${item.code})` }))} onChange={(value) => patch('rewardAssetCode', value)} />
    {['CPA', 'HYBRID', 'TIERED'].includes(form.contractType) ? <VadInput label="Amount per qualified customer" value={form.cpaAmount} onChangeText={(value) => patch('cpaAmount', moneyInput(value))} keyboardType="decimal-pad" /> : null}
    {['REVENUE_SHARE', 'HYBRID', 'TIERED'].includes(form.contractType) ? <><VadInput label="Share of eligible VAD fees (%)" value={form.revenueSharePercent} onChangeText={(value) => patch('revenueSharePercent', moneyInput(value))} keyboardType="decimal-pad" /><VadInput label="How long the fee share lasts (days)" value={form.revenueShareDays} onChangeText={(value) => patch('revenueShareDays', digits(value))} keyboardType="number-pad" /></> : null}
    {form.contractType === 'FLAT' ? <VadInput label="Fixed campaign fee" value={form.flatFee} onChangeText={(value) => patch('flatFee', moneyInput(value))} keyboardType="decimal-pad" /> : null}
    <VadInput label="Maximum total payout (optional)" value={form.payoutCap} onChangeText={(value) => patch('payoutCap', moneyInput(value))} keyboardType="decimal-pad" />
    <ChoiceRow label="Payment schedule" value={form.paymentSchedule} options={[{ value: 'WEEKLY', label: 'Weekly' }, { value: 'MONTHLY', label: 'Monthly' }, { value: 'AFTER_CAMPAIGN', label: 'After the campaign' }, { value: 'MANUAL', label: 'Manual review' }]} onChange={(value) => patch('paymentSchedule', value)} />
    <VadInput label="Start date & time (optional)" value={form.startsAt} onChangeText={(value) => patch('startsAt', value)} placeholder="2026-09-20 09:00" />
    <VadInput label="End date & time (optional)" value={form.endsAt} onChangeText={(value) => patch('endsAt', value)} placeholder="2026-10-20 23:59" />
    <VadInput label="Internal notes (optional)" value={form.notes} onChangeText={(value) => patch('notes', value)} multiline placeholder="Add any agreed commercial conditions the team should remember." />
    {error ? <VadErrorState title="Partner terms not saved" message={error} /> : null}
    <VadButton label="Save partner terms" loading={working} disabled={!form.partnerPublicId} onPress={() => void save()} />
  </EditorScroll>;
}

function ReviewSheet({ target, onClose, onSaved }: { target: ReviewTarget; onClose: () => void; onSaved: () => Promise<void> }) {
  const [reason, setReason] = useState(''); const [working, setWorking] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit() { setWorking(true); setError(null); try { await decideGrowthReward(target.reward.publicId, target.decision, reason); await onSaved(); } catch (value) { setError(value instanceof Error ? value.message : 'Reward review failed.'); } finally { setWorking(false); } }
  return <VadBottomSheet visible title="Reward review" onClose={onClose}><EditorScroll><VadCard variant="muted" style={{ gap: 3 }}><VadText variant="bodyStrong">{target.reward.campaignName}</VadText><VadText variant="caption" tone="secondary">{target.reward.assetCode} {Number(target.reward.amount).toLocaleString()} · {target.decision === 'APPROVE' ? 'Approve' : target.decision === 'HOLD' ? 'Review later' : 'Not eligible'}</VadText></VadCard><VadInput label="Reason" value={reason} onChangeText={setReason} multiline placeholder="Add a clear note for the audit history." />{error ? <VadErrorState title="Review not saved" message={error} /> : null}<VadButton label={target.decision === 'APPROVE' ? 'Approve reward' : target.decision === 'HOLD' ? 'Save for later review' : 'Mark as not eligible'} loading={working} disabled={reason.trim().length < 3} onPress={() => void submit()} /></EditorScroll></VadBottomSheet>;
}

function SectionHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) { const theme = useVadTheme(); return <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.md, flexWrap: 'wrap' }}><View style={{ flex: 1, minWidth: 220, gap: 2 }}><VadText variant="heading">{title}</VadText><VadText variant="caption" tone="secondary">{subtitle}</VadText></View>{action}</View>; }
function EditorScroll({ children }: { children: React.ReactNode }) { const theme = useVadTheme(); return <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.md, paddingBottom: theme.spacing.lg }}>{children}</ScrollView>; }
function ChoiceRow({ label, value, options, onChange }: { label: string; value: string; options: ChoiceOption[]; onChange: (value: string) => void }) { const theme = useVadTheme(); return <View style={{ gap: theme.spacing.xs }}><VadText variant="label" tone="secondary">{label}</VadText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>{options.map((item) => <Pressable key={item.value} onPress={() => onChange(item.value)}><VadChip label={item.label} tone={item.value === value ? 'brand' : 'neutral'} /></Pressable>)}</View></View>; }
function MultiChoice({ label, values, options, onChange }: { label: string; values: string[]; options: ChoiceOption[]; onChange: (values: string[]) => void }) { const theme = useVadTheme(); return <View style={{ gap: theme.spacing.xs }}><VadText variant="label" tone="secondary">{label}</VadText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>{options.map((item) => { const selected = values.includes(item.value); return <Pressable key={item.value} onPress={() => onChange(selected ? values.filter((value) => value !== item.value) : [...values, item.value])}><VadChip label={item.label} tone={selected ? 'brand' : 'neutral'} /></Pressable>; })}</View></View>; }
function EntityChoice({ label, value, items, onChange, allowNone = false }: { label: string; value: string; items: { value: string; label: string }[]; onChange: (value: string) => void; allowNone?: boolean }) { const theme = useVadTheme(); return <View style={{ gap: theme.spacing.xs }}><VadText variant="label" tone="secondary">{label}</VadText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>{allowNone ? <Pressable onPress={() => onChange('')}><VadChip label="None" tone={!value ? 'brand' : 'neutral'} /></Pressable> : null}{items.map((item) => <Pressable key={item.value} onPress={() => onChange(item.value)}><VadChip label={item.label} tone={item.value === value ? 'brand' : 'neutral'} /></Pressable>)}</View></View>; }
function MediaField({ label, url, uploading, onPick, square = false }: { label: string; url: string; uploading: boolean; onPick: () => void; square?: boolean }) { const theme = useVadTheme(); return <View style={{ gap: theme.spacing.xs }}><VadText variant="label" tone="secondary">{label}</VadText>{url ? <Image source={{ uri: url }} style={{ width: square ? 112 : '100%', height: square ? 112 : 120, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surfaceMuted }} resizeMode="cover" /> : <VadCard variant="muted" style={{ minHeight: 72, justifyContent: 'center' }}><VadText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>No image selected</VadText></VadCard>}<VadButton label={url ? 'Replace image' : 'Choose image'} variant="secondary" size="small" loading={uploading} onPress={onPick} /></View>; }

function readNumber(source: Record<string, unknown> | undefined, key: string, fallback: number) { const value = source?.[key]; return typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) ? Number(value) : fallback; }
function readBoolean(source: Record<string, unknown> | undefined, key: string, fallback: boolean) { return typeof source?.[key] === 'boolean' ? Boolean(source?.[key]) : fallback; }
function readString(source: Record<string, unknown> | undefined, key: string, fallback: string) { return typeof source?.[key] === 'string' ? String(source?.[key]) : fallback; }
function readStringArray(source: Record<string, unknown> | undefined, key: string) { const value = source?.[key]; return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function moneyInput(value: string) { return value.replace(/[^0-9.]/g, ''); }
function digits(value: string) { return value.replace(/\D/g, ''); }
function friendlyStatus(value: string) { return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function campaignTypeLabel(value: string) { return campaignTypes.find((item) => item.value === value)?.label ?? friendlyStatus(value); }
function rewardPlanLabel(value: string) { return rewardPlans.find((item) => item.value === value)?.label ?? friendlyStatus(value); }
function partnerTypeLabel(value: string) { return partnerTypes.find((item) => item.value === value)?.label ?? friendlyStatus(value); }
function contractTypeLabel(value: string) { return contractTypes.find((item) => item.value === value)?.label ?? friendlyStatus(value); }
function linkKindLabel(value: string) { return linkKinds.find((item) => item.value === value)?.label ?? friendlyStatus(value); }
function rewardKindLabel(value: string) { const labels: Record<string, string> = { REFERRAL_REWARD: 'Referral reward', AFFILIATE_COMMISSION: 'Partner earnings', CAMPAIGN_REWARD: 'Campaign reward', PROMOTIONAL_CREDIT: 'Promotional credit', FEE_CREDIT: 'Fee credit', PRIZE_PAYOUT: 'Campaign prize' }; return labels[value] ?? friendlyStatus(value); }
function rewardStatusLabel(value: string) { const labels: Record<string, string> = { PENDING: 'In progress', QUALIFYING: 'Checking', EARNED: 'Earned', HELD: 'Review later', APPROVED: 'Approved', PAYABLE: 'Ready for payment', PAID: 'Paid', REVERSED: 'Reversed', DISQUALIFIED: 'Not eligible' }; return labels[value] ?? friendlyStatus(value); }
