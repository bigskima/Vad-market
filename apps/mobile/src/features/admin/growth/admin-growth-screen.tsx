import { useCallback, useEffect, useMemo, useState } from 'react';
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
  getAdminGrowthWorkspace,
  setGrowthCampaignStatus,
  uploadGrowthMedia,
  upsertGrowthCampaign,
  upsertGrowthContract,
  upsertGrowthLink,
  upsertGrowthPartner,
  type AdminGrowthWorkspace,
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

type ReviewTarget = { reward: GrowthReward; decision: 'APPROVE' | 'HOLD' | 'DISQUALIFY' } | null;

const emptyWorkspace: AdminGrowthWorkspace = {
  summary: { activeCampaigns: 0, partners: 0, attributedUsers: 0, pendingRewards: 0, approvedLiability: 0, paidRewards: 0 },
  campaigns: [], partners: [], contracts: [], links: [], rewardQueue: [],
};

export function AdminGrowthScreen() {
  const theme = useVadTheme();
  const admin = useAdminData();
  const [workspace, setWorkspace] = useState<AdminGrowthWorkspace>(emptyWorkspace);
  const [tab, setTab] = useState<Tab>('campaigns');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor>(null);
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget>(null);

  const canManage = admin.access.isSuperAdmin || admin.access.permissions.includes('growth.manage');
  const canReview = admin.access.isSuperAdmin || admin.access.permissions.includes('growth.review');

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    setError(null);
    try {
      setWorkspace(await getAdminGrowthWorkspace());
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Growth operations could not be loaded.');
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
          <VadText variant="label" tone="brand">GROWTH CONTROL PLANE</VadText>
          <VadText variant="title">Campaigns, partners & rewards.</VadText>
          <VadText variant="caption" tone="secondary">Configure acquisition and retention without code changes. Rewards remain liabilities until review and the governed payout layer posts them to the ledger.</VadText>
        </View>
        <VadButton label="Refresh" variant="secondary" size="small" fullWidth={false} loading={refreshing} onPress={() => void load(true)} />
      </View>

      {error ? <VadErrorState title="Growth workspace needs attention" message={error} onRetry={() => void load(true)} /> : null}
      {message ? <VadCard variant="muted" style={{ borderLeftWidth: 3, borderLeftColor: theme.colors.yes, gap: 2 }}><VadText variant="bodyStrong" tone="yes">Saved</VadText><VadText variant="caption" tone="secondary">{message}</VadText></VadCard> : null}

      <SummaryGrid workspace={workspace} />

      <AdminSectionTabs
        active={tab}
        onChange={(value) => setTab(value as Tab)}
        items={[
          { key: 'campaigns', label: 'Campaigns', count: workspace.campaigns.length },
          { key: 'partners', label: 'Partners', count: workspace.partners.length },
          { key: 'links', label: 'Links & codes', count: workspace.links.length },
          { key: 'contracts', label: 'Contracts', count: workspace.contracts.length },
          { key: 'rewards', label: 'Reward review', count: workspace.rewardQueue.length },
        ]}
      />

      {tab === 'campaigns' ? <CampaignSection items={workspace.campaigns} canManage={canManage} onEdit={(value) => setEditor({ kind: 'campaign', value })} onStatus={async (campaign, status) => {
        try { await setGrowthCampaignStatus(campaign.publicId, status, `Admin changed campaign status to ${status}.`); setMessage(`${campaign.name} is now ${status.toLowerCase()}.`); await load(true); }
        catch (value) { setError(value instanceof Error ? value.message : 'Campaign status could not be changed.'); }
      }} /> : null}
      {tab === 'partners' ? <PartnerSection items={workspace.partners} canManage={canManage} onEdit={(value) => setEditor({ kind: 'partner', value })} /> : null}
      {tab === 'links' ? <LinkSection items={workspace.links} canManage={canManage} onEdit={(value) => setEditor({ kind: 'link', value })} /> : null}
      {tab === 'contracts' ? <ContractSection items={workspace.contracts} canManage={canManage} onEdit={(value) => setEditor({ kind: 'contract', value })} /> : null}
      {tab === 'rewards' ? <RewardSection items={workspace.rewardQueue} canReview={canReview} onReview={(reward, decision) => setReviewTarget({ reward, decision })} /> : null}

      <VadBottomSheet visible={Boolean(editor)} title={editor?.kind === 'campaign' ? 'Campaign configuration' : editor?.kind === 'partner' ? 'Partner profile' : editor?.kind === 'link' ? 'Tracking link' : 'Partner contract'} onClose={() => setEditor(null)}>
        {editor?.kind === 'campaign' ? <CampaignEditor campaign={editor.value} onSaved={async () => { setEditor(null); setMessage('Campaign configuration updated.'); await load(true); }} /> : null}
        {editor?.kind === 'partner' ? <PartnerEditor partner={editor.value} onSaved={async () => { setEditor(null); setMessage('Partner profile updated.'); await load(true); }} /> : null}
        {editor?.kind === 'link' ? <LinkEditor link={editor.value} campaigns={workspace.campaigns} partners={workspace.partners} onSaved={async () => { setEditor(null); setMessage('Tracking link updated.'); await load(true); }} /> : null}
        {editor?.kind === 'contract' ? <ContractEditor contract={editor.value} campaigns={workspace.campaigns} partners={workspace.partners} onSaved={async () => { setEditor(null); setMessage('Partner contract updated.'); await load(true); }} /> : null}
      </VadBottomSheet>

      <ReviewSheet target={reviewTarget} onClose={() => setReviewTarget(null)} onSaved={async () => { setReviewTarget(null); setMessage('Reward review saved.'); await load(true); }} />
    </View>
  );
}

function SummaryGrid({ workspace }: { workspace: AdminGrowthWorkspace }) {
  const theme = useVadTheme();
  const metrics = [
    ['Live campaigns', workspace.summary.activeCampaigns],
    ['Active partners', workspace.summary.partners],
    ['Attributed users', workspace.summary.attributedUsers],
    ['Pending rewards', workspace.summary.pendingRewards],
    ['Approved liability', Number(workspace.summary.approvedLiability).toLocaleString()],
    ['Paid rewards', Number(workspace.summary.paidRewards).toLocaleString()],
  ];
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>{metrics.map(([label, value]) => <VadCard key={String(label)} variant="raised" style={{ minWidth: 150, flexGrow: 1, gap: 3 }}><VadText variant="caption" tone="secondary">{label}</VadText><VadText variant="heading">{String(value)}</VadText></VadCard>)}</View>;
}

function CampaignSection({ items, canManage, onEdit, onStatus }: { items: GrowthCampaign[]; canManage: boolean; onEdit: (item: GrowthCampaign | null) => void; onStatus: (item: GrowthCampaign, status: string) => Promise<void> }) {
  const theme = useVadTheme();
  return <View style={{ gap: theme.spacing.md }}><SectionHeader title="Campaign portfolio" subtitle="Referral, affiliate, challenge, sponsor, creator and seasonal campaigns share one configurable engine." action={canManage ? <VadButton label="New campaign" size="small" fullWidth={false} onPress={() => onEdit(null)} /> : null} />
    {items.length ? items.map((item) => <VadCard key={item.publicId} variant="raised" style={{ padding: 0, overflow: 'hidden' }}>{item.cardImageUrl ? <Image source={{ uri: item.cardImageUrl }} style={{ width: '100%', height: 105 }} resizeMode="cover" /> : null}<View style={{ padding: theme.spacing.md, gap: theme.spacing.sm }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}><View style={{ flex: 1, gap: 2 }}><VadText variant="bodyStrong">{item.name}</VadText><VadText variant="caption" tone="secondary">{item.code} · {item.type.replaceAll('_', ' ')}</VadText></View><VadChip label={item.status ?? 'DRAFT'} tone={item.status === 'ACTIVE' ? 'yes' : item.status === 'PAUSED' ? 'warning' : 'neutral'} /></View><VadText variant="caption" tone="secondary">{item.description}</VadText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}><VadChip label={item.rewardMode.replaceAll('_', ' ')} tone="brand" />{item.sponsorName ? <VadChip label={item.sponsorName} tone="neutral" /> : null}<VadChip label={`Budget ${Number(item.allocatedBudget ?? 0).toLocaleString()}`} tone="neutral" /><VadChip label={`Available ${Number(item.availableAmount ?? 0).toLocaleString()}`} tone="neutral" /></View>{canManage ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}><VadButton label="Edit" variant="secondary" size="small" fullWidth={false} onPress={() => onEdit(item)} />{item.status !== 'ACTIVE' ? <VadButton label="Activate" size="small" fullWidth={false} onPress={() => void onStatus(item, 'ACTIVE')} /> : <VadButton label="Pause" variant="secondary" size="small" fullWidth={false} onPress={() => void onStatus(item, 'PAUSED')} />}</View> : null}</View></VadCard>) : <VadEmptyState title="No campaigns configured" body="Create the first campaign; nothing becomes live until an admin activates it." />}
  </View>;
}

function PartnerSection({ items, canManage, onEdit }: { items: GrowthPartner[]; canManage: boolean; onEdit: (item: GrowthPartner | null) => void }) {
  const theme = useVadTheme();
  return <View style={{ gap: theme.spacing.md }}><SectionHeader title="Partners" subtitle="Create celebrity, creator, community, media, agency and strategic partner profiles." action={canManage ? <VadButton label="New partner" size="small" fullWidth={false} onPress={() => onEdit(null)} /> : null} />{items.length ? items.map((item) => <Pressable key={item.publicId} disabled={!canManage} onPress={() => onEdit(item)}><VadCard variant="raised" style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>{item.avatarUrl ? <Image source={{ uri: item.avatarUrl }} style={{ width: 58, height: 58, borderRadius: 29 }} /> : <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: theme.colors.brandSoft }} />}<View style={{ flex: 1, gap: 2 }}><VadText variant="bodyStrong">{item.displayName}</VadText><VadText variant="caption" tone="secondary">{item.type.replaceAll('_', ' ')} · {item.status}</VadText>{item.bio ? <VadText variant="caption" tone="tertiary" numberOfLines={2}>{item.bio}</VadText> : null}</View></VadCard></Pressable>) : <VadEmptyState title="No partners yet" body="Add a partner before issuing an affiliate link or commercial agreement." />}</View>;
}

function LinkSection({ items, canManage, onEdit }: { items: GrowthLink[]; canManage: boolean; onEdit: (item: GrowthLink | null) => void }) {
  const theme = useVadTheme();
  return <View style={{ gap: theme.spacing.md }}><SectionHeader title="Links & vanity codes" subtitle="Every code is traceable. Normal personal invite links stay outside this rewardable admin list." action={canManage ? <VadButton label="New code" size="small" fullWidth={false} onPress={() => onEdit(null)} /> : null} />{items.length ? items.map((item) => <Pressable key={item.publicId} disabled={!canManage} onPress={() => onEdit(item)}><VadCard variant="raised" style={{ gap: theme.spacing.sm }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}><View style={{ flex: 1 }}><VadText variant="heading">{item.code}</VadText><VadText variant="caption" tone="secondary">{item.kind} · {item.destinationPath}</VadText></View><VadChip label={item.status} tone={item.status === 'ACTIVE' ? 'yes' : 'warning'} /><VadChip label={item.rewardable ? 'Rewardable' : 'Attribution only'} tone={item.rewardable ? 'brand' : 'neutral'} /></View><VadText variant="caption" tone="tertiary">{item.partnerName || item.campaignName || 'Unassigned'}</VadText></VadCard></Pressable>) : <VadEmptyState title="No admin codes" body="Issue vanity referral, affiliate or campaign codes here." />}</View>;
}

function ContractSection({ items, canManage, onEdit }: { items: GrowthContract[]; canManage: boolean; onEdit: (item: GrowthContract | null) => void }) {
  const theme = useVadTheme();
  return <View style={{ gap: theme.spacing.md }}><SectionHeader title="Partner economics" subtitle="CPA, revenue share, flat and hybrid contracts are separate from public campaign presentation." action={canManage ? <VadButton label="New contract" size="small" fullWidth={false} onPress={() => onEdit(null)} /> : null} />{items.length ? items.map((item) => <Pressable key={item.publicId} disabled={!canManage} onPress={() => onEdit(item)}><VadCard variant="raised" style={{ gap: theme.spacing.sm }}><View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}><View style={{ flex: 1 }}><VadText variant="bodyStrong">{item.partnerName}</VadText><VadText variant="caption" tone="secondary">{item.type} · {item.campaignName || 'All eligible acquisition'}</VadText></View><VadChip label={item.status} tone={item.status === 'ACTIVE' ? 'yes' : 'neutral'} /></View><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>{item.cpaAmount != null ? <VadChip label={`CPA ${item.assetCode ?? ''} ${item.cpaAmount}`} tone="brand" /> : null}{item.revenueShareBps != null ? <VadChip label={`${item.revenueShareBps / 100}% revenue share`} tone="brand" /> : null}{item.flatFee != null ? <VadChip label={`Flat ${item.assetCode ?? ''} ${item.flatFee}`} tone="neutral" /> : null}</View></VadCard></Pressable>) : <VadEmptyState title="No partner contracts" body="Create commercial terms without changing application code." />}</View>;
}

function RewardSection({ items, canReview, onReview }: { items: GrowthReward[]; canReview: boolean; onReview: (item: GrowthReward, decision: 'APPROVE' | 'HOLD' | 'DISQUALIFY') => void }) {
  const theme = useVadTheme();
  return <View style={{ gap: theme.spacing.md }}><SectionHeader title="Reward review" subtitle="Approval changes liability state only. It does not directly mint funds or bypass the financial ledger." />{items.length ? items.map((item) => <VadCard key={item.publicId} variant="raised" style={{ gap: theme.spacing.sm }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}><View style={{ flex: 1 }}><VadText variant="bodyStrong">{item.campaignName}</VadText><VadText variant="caption" tone="secondary">{item.beneficiaryPartnerName || item.beneficiaryUserId || 'Beneficiary'} · {item.kind.replaceAll('_', ' ')}</VadText></View><View style={{ alignItems: 'flex-end', gap: 4 }}><VadText variant="bodyStrong">{item.assetCode} {Number(item.amount).toLocaleString()}</VadText><VadChip label={item.status} tone="warning" /></View></View>{canReview ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}><VadButton label="Approve" size="small" fullWidth={false} onPress={() => onReview(item, 'APPROVE')} /><VadButton label="Hold" variant="secondary" size="small" fullWidth={false} onPress={() => onReview(item, 'HOLD')} /><VadButton label="Disqualify" variant="ghost" size="small" fullWidth={false} onPress={() => onReview(item, 'DISQUALIFY')} /></View> : null}</VadCard>) : <VadEmptyState title="Reward queue is clear" body="Earned, held and payable rewards appear here for operational review." />}</View>;
}

function CampaignEditor({ campaign, onSaved }: { campaign: GrowthCampaign | null; onSaved: () => Promise<void> }) {
  const theme = useVadTheme();
  const [form, setForm] = useState({
    code: campaign?.code ?? '', campaignType: campaign?.type ?? 'REFERRAL', name: campaign?.name ?? '', shortDescription: campaign?.description ?? '', fullDescription: '', status: ['DRAFT','SCHEDULED','PAUSED'].includes(campaign?.status ?? '') ? campaign?.status ?? 'DRAFT' : 'PAUSED', rewardAssetCode: campaign?.rewardAssetCode ?? 'NGN', rewardMode: campaign?.rewardMode ?? 'NONE', allocatedBudget: String(campaign?.allocatedBudget ?? 0), fundingSource: campaign?.fundingSource ?? 'VAD_MARKETING', attributionModel: campaign?.attributionModel ?? 'LAST_TOUCH_BEFORE_SIGNUP', attributionWindowDays: String(campaign?.attributionWindowDays ?? 30), countryCodes: (campaign?.countryCodes ?? ['NG']).join(','), perUserRewardCap: campaign?.perUserRewardCap == null ? '' : String(campaign.perUserRewardCap), perUserQualificationCap: campaign?.perUserQualificationCap == null ? '' : String(campaign.perUserQualificationCap), heroImageUrl: campaign?.heroImageUrl ?? '', cardImageUrl: campaign?.cardImageUrl ?? '', squareImageUrl: campaign?.squareImageUrl ?? '', badgeText: campaign?.badgeText ?? '', sponsorName: campaign?.sponsorName ?? '', termsSummary: campaign?.termsSummary ?? '', startsAt: campaign?.startsAt ?? '', endsAt: campaign?.endsAt ?? '', rewardConfig: JSON.stringify(campaign?.rewardConfig ?? {}, null, 2), qualificationRule: JSON.stringify(campaign?.qualificationRule ?? {}, null, 2), eligibilityRule: JSON.stringify(campaign?.eligibilityRule ?? {}, null, 2), scoringRule: JSON.stringify(campaign?.scoringRule ?? {}, null, 2), winnerRule: JSON.stringify(campaign?.winnerRule ?? {}, null, 2), visualConfig: JSON.stringify(campaign?.visualConfig ?? {}, null, 2),
  });
  const [working, setWorking] = useState(false); const [uploading, setUploading] = useState(false); const [error, setError] = useState<string | null>(null);
  const patch = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function image(slot: 'heroImageUrl' | 'cardImageUrl' | 'squareImageUrl') { setUploading(true); setError(null); try { const picked = await pickProfileImage(); if (!picked) return; patch(slot, await uploadGrowthMedia(picked.bytes, picked.mimeType, slot)); } catch (value) { setError(value instanceof Error ? value.message : 'Image upload failed.'); } finally { setUploading(false); } }
  async function save() { setWorking(true); setError(null); try { const parse = (value: string, label: string) => { try { return JSON.parse(value || '{}'); } catch { throw new Error(`${label} must contain valid JSON.`); } }; await upsertGrowthCampaign(campaign?.publicId ?? null, { ...form, allocatedBudget: Number(form.allocatedBudget || 0), attributionWindowDays: Number(form.attributionWindowDays || 30), countryCodes: form.countryCodes.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean), perUserRewardCap: form.perUserRewardCap, perUserQualificationCap: form.perUserQualificationCap, rewardConfig: parse(form.rewardConfig, 'Reward configuration'), qualificationRule: parse(form.qualificationRule, 'Qualification rule'), eligibilityRule: parse(form.eligibilityRule, 'Eligibility rule'), scoringRule: parse(form.scoringRule, 'Scoring rule'), winnerRule: parse(form.winnerRule, 'Winner rule'), visualConfig: parse(form.visualConfig, 'Visual configuration') }); await onSaved(); } catch (value) { setError(value instanceof Error ? value.message : 'Campaign could not be saved.'); } finally { setWorking(false); } }
  return <EditorScroll><VadInput label="Campaign code" value={form.code} onChangeText={(value) => patch('code', value.toUpperCase())} autoCapitalize="characters" /><ChoiceRow label="Campaign type" value={form.campaignType} values={['REFERRAL','AFFILIATE','CHALLENGE','SPONSORED','CREATOR','SEASONAL','LAUNCH','EDUCATION']} onChange={(value) => patch('campaignType', value)} /><VadInput label="Campaign name" value={form.name} onChangeText={(value) => patch('name', value)} /><VadInput label="Short description" value={form.shortDescription} onChangeText={(value) => patch('shortDescription', value)} multiline /><ChoiceRow label="Reward model" value={form.rewardMode} values={['NONE','FIXED_CPA','REVENUE_SHARE','HYBRID','PRIZE_POOL','PROMOTIONAL_CREDIT','FEE_CREDIT']} onChange={(value) => patch('rewardMode', value)} /><View style={{ flexDirection: 'row', gap: theme.spacing.sm }}><View style={{ flex: 1 }}><VadInput label="Reward asset" value={form.rewardAssetCode} onChangeText={(value) => patch('rewardAssetCode', value.toUpperCase())} /></View><View style={{ flex: 1 }}><VadInput label="Allocated budget" value={form.allocatedBudget} onChangeText={(value) => patch('allocatedBudget', value.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" /></View></View><VadInput label="Countries" value={form.countryCodes} onChangeText={(value) => patch('countryCodes', value)} hint="Comma separated ISO codes, e.g. NG,GH" /><VadInput label="Badge text" value={form.badgeText} onChangeText={(value) => patch('badgeText', value)} /><VadInput label="Sponsor name" value={form.sponsorName} onChangeText={(value) => patch('sponsorName', value)} /><MediaField label="Hero banner" url={form.heroImageUrl} uploading={uploading} onPick={() => void image('heroImageUrl')} /><MediaField label="Campaign card" url={form.cardImageUrl} uploading={uploading} onPick={() => void image('cardImageUrl')} /><MediaField label="Square artwork" url={form.squareImageUrl} uploading={uploading} onPick={() => void image('squareImageUrl')} /><VadInput label="Starts at (ISO, optional)" value={form.startsAt} onChangeText={(value) => patch('startsAt', value)} /><VadInput label="Ends at (ISO, optional)" value={form.endsAt} onChangeText={(value) => patch('endsAt', value)} /><VadInput label="Terms summary" value={form.termsSummary} onChangeText={(value) => patch('termsSummary', value)} multiline /><VadInput label="Reward configuration (JSON)" value={form.rewardConfig} onChangeText={(value) => patch('rewardConfig', value)} multiline /><VadInput label="Qualification rule (JSON)" value={form.qualificationRule} onChangeText={(value) => patch('qualificationRule', value)} multiline /><VadInput label="Eligibility rule (JSON)" value={form.eligibilityRule} onChangeText={(value) => patch('eligibilityRule', value)} multiline /><VadInput label="Scoring rule (JSON)" value={form.scoringRule} onChangeText={(value) => patch('scoringRule', value)} multiline /><VadInput label="Winner rule (JSON)" value={form.winnerRule} onChangeText={(value) => patch('winnerRule', value)} multiline />{error ? <VadErrorState title="Campaign not saved" message={error} /> : null}<VadButton label="Save campaign" loading={working} disabled={uploading} onPress={() => void save()} /></EditorScroll>;
}

function PartnerEditor({ partner, onSaved }: { partner: GrowthPartner | null; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ partnerType: partner?.type ?? 'CREATOR', name: partner?.name ?? partner?.displayName ?? '', displayName: partner?.displayName ?? '', linkedUserId: partner?.linkedUserId ?? '', status: partner?.status ?? 'DRAFT', bio: partner?.bio ?? '', avatarUrl: partner?.avatarUrl ?? '', bannerUrl: partner?.bannerUrl ?? '' });
  const [working, setWorking] = useState(false); const [uploading, setUploading] = useState(false); const [error, setError] = useState<string | null>(null); const patch=(key:string,value:string)=>setForm((current)=>({...current,[key]:value}));
  async function image(slot:'avatarUrl'|'bannerUrl'){setUploading(true);try{const picked=await pickProfileImage();if(!picked)return;patch(slot,await uploadGrowthMedia(picked.bytes,picked.mimeType,`partner-${slot}`));}catch(value){setError(value instanceof Error?value.message:'Image upload failed.');}finally{setUploading(false);}}
  async function save(){setWorking(true);setError(null);try{await upsertGrowthPartner(partner?.publicId??null,{...form,publicMetadata:{}});await onSaved();}catch(value){setError(value instanceof Error?value.message:'Partner could not be saved.');}finally{setWorking(false);}}
  return <EditorScroll><ChoiceRow label="Partner type" value={form.partnerType} values={['CELEBRITY','INFLUENCER','CREATOR','COMMUNITY','MEDIA','AGENCY','BRAND','CAMPUS_AMBASSADOR','STRATEGIC_PARTNER','OTHER']} onChange={(value)=>patch('partnerType',value)} /><VadInput label="Legal / internal name" value={form.name} onChangeText={(value)=>patch('name',value)} /><VadInput label="Public display name" value={form.displayName} onChangeText={(value)=>patch('displayName',value)} /><VadInput label="Linked VAD user ID (optional)" value={form.linkedUserId} onChangeText={(value)=>patch('linkedUserId',value)} autoCapitalize="none" /><ChoiceRow label="Status" value={form.status} values={['DRAFT','ACTIVE','PAUSED','SUSPENDED','ENDED','ARCHIVED']} onChange={(value)=>patch('status',value)} /><VadInput label="Bio" value={form.bio} onChangeText={(value)=>patch('bio',value)} multiline /><MediaField label="Partner avatar" url={form.avatarUrl} uploading={uploading} onPick={()=>void image('avatarUrl')} square /><MediaField label="Partner banner" url={form.bannerUrl} uploading={uploading} onPick={()=>void image('bannerUrl')} />{error?<VadErrorState title="Partner not saved" message={error}/>:null}<VadButton label="Save partner" loading={working} disabled={uploading} onPress={()=>void save()} /></EditorScroll>;
}

function LinkEditor({ link, campaigns, partners, onSaved }: { link: GrowthLink | null; campaigns: GrowthCampaign[]; partners: GrowthPartner[]; onSaved: () => Promise<void> }) {
  const [form,setForm]=useState({code:link?.code??'',linkKind:link?.kind??'AFFILIATE',partnerPublicId:link?.partnerPublicId??'',campaignPublicId:link?.campaignPublicId??'',rewardable:String(link?.rewardable??true),status:link?.status??'ACTIVE',destinationPath:link?.destinationPath??'/account/growth',expiresAt:link?.expiresAt??''});const [working,setWorking]=useState(false);const [error,setError]=useState<string|null>(null);const patch=(key:string,value:string)=>setForm((current)=>({...current,[key]:value}));
  async function save(){setWorking(true);setError(null);try{await upsertGrowthLink(link?.publicId??null,{...form,rewardable:form.rewardable==='true'});await onSaved();}catch(value){setError(value instanceof Error?value.message:'Code could not be saved.');}finally{setWorking(false);}}
  return <EditorScroll><VadInput label="Code" value={form.code} onChangeText={(value)=>patch('code',value.toUpperCase())}/><ChoiceRow label="Kind" value={form.linkKind} values={['REFERRAL','AFFILIATE','CAMPAIGN']} onChange={(value)=>patch('linkKind',value)}/><ChoiceRow label="Rewardable" value={form.rewardable} values={['true','false']} onChange={(value)=>patch('rewardable',value)}/><EntityChoice label="Partner" value={form.partnerPublicId} items={partners.map((item)=>({value:item.publicId,label:item.displayName}))} onChange={(value)=>patch('partnerPublicId',value)} allowNone /><EntityChoice label="Campaign" value={form.campaignPublicId} items={campaigns.map((item)=>({value:item.publicId,label:item.name}))} onChange={(value)=>patch('campaignPublicId',value)} allowNone /><VadInput label="Destination route" value={form.destinationPath} onChangeText={(value)=>patch('destinationPath',value)} autoCapitalize="none"/><VadInput label="Expires at (ISO, optional)" value={form.expiresAt} onChangeText={(value)=>patch('expiresAt',value)}/>{error?<VadErrorState title="Code not saved" message={error}/>:null}<VadButton label="Save code" loading={working} onPress={()=>void save()}/></EditorScroll>;
}

function ContractEditor({ contract, campaigns, partners, onSaved }: { contract: GrowthContract | null; campaigns: GrowthCampaign[]; partners: GrowthPartner[]; onSaved: () => Promise<void> }) {
  const [form,setForm]=useState({partnerPublicId:contract?.partnerPublicId??'',campaignPublicId:contract?.campaignPublicId??'',contractType:contract?.type??'CPA',status:contract?.status??'DRAFT',rewardAssetCode:contract?.assetCode??'NGN',cpaAmount:contract?.cpaAmount==null?'':String(contract.cpaAmount),revenueShareBps:contract?.revenueShareBps==null?'':String(contract.revenueShareBps),revenueShareDays:contract?.revenueShareDays==null?'':String(contract.revenueShareDays),flatFee:contract?.flatFee==null?'':String(contract.flatFee),payoutCap:contract?.payoutCap==null?'':String(contract.payoutCap),startsAt:contract?.startsAt??'',endsAt:contract?.endsAt??'',terms:JSON.stringify(contract?.terms??{},null,2)});const [working,setWorking]=useState(false);const [error,setError]=useState<string|null>(null);const patch=(key:string,value:string)=>setForm((current)=>({...current,[key]:value}));
  async function save(){setWorking(true);setError(null);try{let terms:Record<string,unknown>;try{terms=JSON.parse(form.terms||'{}');}catch{throw new Error('Contract terms must contain valid JSON.');}await upsertGrowthContract(contract?.publicId??null,{...form,terms});await onSaved();}catch(value){setError(value instanceof Error?value.message:'Contract could not be saved.');}finally{setWorking(false);}}
  return <EditorScroll><EntityChoice label="Partner" value={form.partnerPublicId} items={partners.map((item)=>({value:item.publicId,label:item.displayName}))} onChange={(value)=>patch('partnerPublicId',value)}/><EntityChoice label="Campaign (optional)" value={form.campaignPublicId} items={campaigns.map((item)=>({value:item.publicId,label:item.name}))} onChange={(value)=>patch('campaignPublicId',value)} allowNone/><ChoiceRow label="Contract type" value={form.contractType} values={['CPA','REVENUE_SHARE','HYBRID','FLAT','TIERED']} onChange={(value)=>patch('contractType',value)}/><ChoiceRow label="Status" value={form.status} values={['DRAFT','ACTIVE','PAUSED','ENDED','ARCHIVED']} onChange={(value)=>patch('status',value)}/><VadInput label="Asset" value={form.rewardAssetCode} onChangeText={(value)=>patch('rewardAssetCode',value.toUpperCase())}/><VadInput label="CPA amount" value={form.cpaAmount} onChangeText={(value)=>patch('cpaAmount',value.replace(/[^0-9.]/g,''))}/><VadInput label="Revenue share (basis points)" value={form.revenueShareBps} onChangeText={(value)=>patch('revenueShareBps',value.replace(/\D/g,''))} hint="100 basis points = 1%"/><VadInput label="Revenue share duration (days)" value={form.revenueShareDays} onChangeText={(value)=>patch('revenueShareDays',value.replace(/\D/g,''))}/><VadInput label="Flat fee" value={form.flatFee} onChangeText={(value)=>patch('flatFee',value.replace(/[^0-9.]/g,''))}/><VadInput label="Payout cap" value={form.payoutCap} onChangeText={(value)=>patch('payoutCap',value.replace(/[^0-9.]/g,''))}/><VadInput label="Contract terms (JSON)" value={form.terms} onChangeText={(value)=>patch('terms',value)} multiline/>{error?<VadErrorState title="Contract not saved" message={error}/>:null}<VadButton label="Save contract" loading={working} disabled={!form.partnerPublicId} onPress={()=>void save()}/></EditorScroll>;
}

function ReviewSheet({ target, onClose, onSaved }: { target: ReviewTarget; onClose: () => void; onSaved: () => Promise<void> }) { const [reason,setReason]=useState('');const [working,setWorking]=useState(false);const [error,setError]=useState<string|null>(null);useEffect(()=>{if(target)setReason('');},[target]);async function submit(){if(!target)return;setWorking(true);setError(null);try{await decideGrowthReward(target.reward.publicId,target.decision,reason);await onSaved();}catch(value){setError(value instanceof Error?value.message:'Reward review failed.');}finally{setWorking(false);}}return <VadBottomSheet visible={Boolean(target)} title="Reward review" onClose={onClose}>{target?<EditorScroll><VadCard variant="muted" style={{ gap: 3 }}><VadText variant="bodyStrong">{target.reward.campaignName}</VadText><VadText variant="caption" tone="secondary">{target.reward.assetCode} {Number(target.reward.amount).toLocaleString()} · {target.decision}</VadText></VadCard><VadInput label="Review reason" value={reason} onChangeText={setReason} multiline placeholder="Explain why this reward is being approved, held or disqualified."/>{error?<VadErrorState title="Review not saved" message={error}/>:null}<VadButton label={target.decision === 'APPROVE' ? 'Approve reward' : target.decision === 'HOLD' ? 'Place on hold' : 'Disqualify reward'} loading={working} disabled={reason.trim().length<3} onPress={()=>void submit()}/></EditorScroll>:null}</VadBottomSheet>; }

function SectionHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) { const theme=useVadTheme();return <View style={{ flexDirection:'row',alignItems:'flex-end',gap:theme.spacing.md,flexWrap:'wrap' }}><View style={{ flex:1,minWidth:220,gap:2 }}><VadText variant="heading">{title}</VadText><VadText variant="caption" tone="secondary">{subtitle}</VadText></View>{action}</View>; }
function EditorScroll({ children }: { children: React.ReactNode }) { const theme=useVadTheme();return <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap:theme.spacing.md,paddingBottom:theme.spacing.lg }}>{children}</ScrollView>; }
function ChoiceRow({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) { const theme=useVadTheme();return <View style={{ gap:theme.spacing.xs }}><VadText variant="label" tone="secondary">{label}</VadText><View style={{ flexDirection:'row',flexWrap:'wrap',gap:theme.spacing.xs }}>{values.map((item)=><Pressable key={item} onPress={()=>onChange(item)}><VadChip label={item.replaceAll('_',' ')} tone={item===value?'brand':'neutral'} /></Pressable>)}</View></View>; }
function EntityChoice({ label, value, items, onChange, allowNone=false }: { label:string; value:string; items:{value:string;label:string}[]; onChange:(value:string)=>void; allowNone?:boolean }) { const theme=useVadTheme();return <View style={{ gap:theme.spacing.xs }}><VadText variant="label" tone="secondary">{label}</VadText><View style={{ flexDirection:'row',flexWrap:'wrap',gap:theme.spacing.xs }}>{allowNone?<Pressable onPress={()=>onChange('')}><VadChip label="None" tone={!value?'brand':'neutral'}/></Pressable>:null}{items.map((item)=><Pressable key={item.value} onPress={()=>onChange(item.value)}><VadChip label={item.label} tone={item.value===value?'brand':'neutral'}/></Pressable>)}</View></View>; }
function MediaField({ label, url, uploading, onPick, square=false }: { label:string; url:string; uploading:boolean; onPick:()=>void; square?:boolean }) { const theme=useVadTheme();return <View style={{ gap:theme.spacing.xs }}><VadText variant="label" tone="secondary">{label}</VadText>{url?<Image source={{uri:url}} style={{ width:square?112:'100%',height:square?112:120,borderRadius:theme.radius.lg,backgroundColor:theme.colors.surfaceMuted }} resizeMode="cover"/>:<VadCard variant="muted" style={{ minHeight:72,justifyContent:'center' }}><VadText variant="caption" tone="tertiary" style={{textAlign:'center'}}>No image selected</VadText></VadCard>}<VadButton label={url?'Replace image':'Choose image'} variant="secondary" size="small" loading={uploading} onPress={onPick}/></View>; }
