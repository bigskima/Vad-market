import { useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import {
  draftPlayCampaign,
  generatePlayCampaignImage,
  playMediaPublicUrl,
  uploadPlayMedia,
} from '@/services/play-media-api';
import {
  saveAdminPlayCampaign,
  saveAdminPlayExperience,
  type PlayAdminDashboard,
} from '@/services/admin-play-api';

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
        backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
        borderRadius: theme.radius.pill,
        paddingHorizontal: 12,
        paddingVertical: 9,
        opacity: pressed ? 0.76 : 1,
      })}
    >
      <VadText variant="caption" tone={selected ? 'brand' : 'secondary'}>{label}</VadText>
    </Pressable>
  );
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
}

export function AdminPlayGameBuilder({
  dashboard,
  onSaved,
}: {
  dashboard: PlayAdminDashboard;
  onSaved: () => Promise<void> | void;
}) {
  const theme = useVadTheme();
  const engines = dashboard.engines;
  const [engineKey, setEngineKey] = useState('PRIZE_DRAW');
  const [idea, setIdea] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [campaignTitle, setCampaignTitle] = useState('');
  const [prizeTitle, setPrizeTitle] = useState('');
  const [terms, setTerms] = useState('');
  const [refundPolicy, setRefundPolicy] = useState('');
  const [imagePath, setImagePath] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [riskNotes, setRiskNotes] = useState('');
  const [currency, setCurrency] = useState('');
  const [prizeCost, setPrizeCost] = useState('');
  const [profitMode, setProfitMode] = useState<'PERCENT_OF_PRIZE' | 'FIXED_AMOUNT' | ''>('');
  const [profitValue, setProfitValue] = useState('');
  const [campaignCosts, setCampaignCosts] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [maxEntries, setMaxEntries] = useState('');
  const [ticketsPerPurchase, setTicketsPerPurchase] = useState('');
  const [userLimit, setUserLimit] = useState('');
  const [working, setWorking] = useState<'draft' | 'upload' | 'image' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedEngine = engines.find((engine) => engine.engine_key === engineKey);
  const isPrizeDraw = engineKey === 'PRIZE_DRAW';
  const previewUrl = playMediaPublicUrl(imagePath);
  const estimate = useMemo(() => {
    const prize = Number(prizeCost);
    const target = Number(profitValue);
    const costs = Number(campaignCosts);
    if (!currency || !prizeCost.trim() || !profitMode || !profitValue.trim() || !campaignCosts.trim()
      || !Number.isFinite(prize) || !Number.isFinite(target) || !Number.isFinite(costs) || prize <= 0 || target < 0 || costs < 0) return null;
    return prize + (profitMode === 'PERCENT_OF_PRIZE' ? prize * target / 100 : target) + costs;
  }, [campaignCosts, currency, prizeCost, profitMode, profitValue]);

  async function askAiForDraft() {
    if (idea.trim().length < 5) {
      setError('Describe the game idea first.');
      return;
    }
    setWorking('draft');
    setError(null);
    setMessage(null);
    try {
      const draft = await draftPlayCampaign({ idea: idea.trim(), engineKey, currency: currency || null });
      setTitle(draft.title || title);
      setDescription(draft.description || description);
      setPrizeTitle(draft.prizeTitle || prizeTitle);
      setCampaignTitle(draft.campaignTitle || draft.title || campaignTitle);
      setTerms(draft.terms || terms);
      setRefundPolicy(draft.refundPolicy || refundPolicy);
      setImagePrompt(draft.imagePrompt || imagePrompt);
      setRiskNotes(draft.riskNotes || '');
      setMessage('AI draft prepared. Review every field before saving.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'AI could not prepare the draft.');
    } finally {
      setWorking(null);
    }
  }

  async function uploadArtwork() {
    setWorking('upload');
    setError(null);
    setMessage(null);
    try {
      const path = await uploadPlayMedia();
      if (!path) return;
      setImagePath(path);
      setMessage('Artwork uploaded to VAD Play storage.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The artwork could not be uploaded.');
    } finally {
      setWorking(null);
    }
  }

  async function generateArtwork() {
    if (!title.trim()) {
      setError('Enter a game title or use AI draft first.');
      return;
    }
    setWorking('image');
    setError(null);
    setMessage(null);
    try {
      const path = await generatePlayCampaignImage({
        title: title.trim(),
        prizeTitle: prizeTitle.trim(),
        visualDirection: imagePrompt.trim(),
      });
      setImagePath(path);
      setMessage('AI artwork generated and saved to VAD Play storage.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'AI artwork could not be generated.');
    } finally {
      setWorking(null);
    }
  }

  async function saveDraft() {
    setError(null);
    setMessage(null);
    if (!title.trim() || title.trim().length < 3) {
      setError('Add a game title.');
      return;
    }
    if (!selectedEngine) {
      setError('Select a registered game engine.');
      return;
    }
    if (isPrizeDraw) {
      if (!campaignTitle.trim() || !prizeTitle.trim() || !currency || !prizeCost.trim() || !profitMode || !profitValue.trim()
        || !campaignCosts.trim() || !entryPrice.trim() || !maxEntries.trim() || !ticketsPerPurchase.trim()
        || terms.trim().length < 20 || refundPolicy.trim().length < 10) {
        setError('Complete the campaign economics, entry limits, terms and refund policy.');
        return;
      }
      const values = [prizeCost, profitValue, campaignCosts, entryPrice].map(Number);
      const totalCap = Number(maxEntries);
      const purchaseCap = Number(ticketsPerPurchase);
      const perUserCap = userLimit.trim() ? Number(userLimit) : null;
      if (values.some((value) => !Number.isFinite(value)) || values[0] <= 0 || values[1] < 0 || values[2] < 0 || values[3] <= 0) {
        setError('Check the amounts. Prize cost and entry price must be positive; profit target and campaign budget cannot be negative.');
        return;
      }
      if (!Number.isSafeInteger(totalCap) || totalCap < 1 || !Number.isSafeInteger(purchaseCap) || purchaseCap < 1 || purchaseCap > totalCap
        || (perUserCap !== null && (!Number.isSafeInteger(perUserCap) || perUserCap < 1 || perUserCap > totalCap))) {
        setError('Use valid whole-number entry limits. Per-purchase and per-user limits cannot exceed the campaign cap.');
        return;
      }
    }

    setWorking('save');
    let experienceSaved = false;
    try {
      const experienceId = await saveAdminPlayExperience({
        slug: slugify(title) || `play-${Date.now()}`,
        title: title.trim(),
        description: description.trim() || null,
        experience_type: selectedEngine.engine_family,
        engine_key: engineKey,
        status: 'DRAFT',
        hero_asset_url: imagePath || null,
        card_asset_url: imagePath || null,
        image_alt: title.trim(),
        public_config: {},
        engine_config: {},
      });
      experienceSaved = true;

      if (isPrizeDraw) {
        await saveAdminPlayCampaign({
          experience_id: experienceId,
          slug: slugify(campaignTitle) || slugify(title),
          title: campaignTitle.trim(),
          prize_title: prizeTitle.trim(),
          currency_code: currency,
          prize_cost_amount: Number(prizeCost),
          profit_target_mode: profitMode,
          profit_target_value: Number(profitValue),
          campaign_cost_budget_amount: Number(campaignCosts),
          entry_price_amount: Number(entryPrice),
          max_entries: Number(maxEntries),
          max_tickets_per_purchase: Number(ticketsPerPurchase),
          entry_limit_per_user: userLimit.trim() ? Number(userLimit) : null,
          rules_public: {
            terms: terms.trim(),
            refund_policy: refundPolicy.trim(),
            campaign_image_path: imagePath || null,
          },
          engine_config: {},
        });
      }

      await onSaved();
      setMessage(isPrizeDraw ? 'Game and campaign drafts saved.' : 'Game experience draft saved. Its runtime is still subject to review.');
      setIdea('');
      setTitle('');
      setDescription('');
      setCampaignTitle('');
      setPrizeTitle('');
      setTerms('');
      setRefundPolicy('');
      setImagePath('');
      setImagePrompt('');
      setRiskNotes('');
      setCurrency('');
      setPrizeCost('');
      setProfitMode('');
      setProfitValue('');
      setCampaignCosts('');
      setEntryPrice('');
      setMaxEntries('');
      setTicketsPerPurchase('');
      setUserLimit('');
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : 'VAD Play could not save this draft.';
      setError(experienceSaved
        ? `The experience draft was saved, but its campaign could not be completed. Review the fields and retry: ${detail}`
        : detail);
    } finally {
      setWorking(null);
    }
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ gap: 4 }}>
        <VadText variant="title">Create a game</VadText>
        <VadText variant="caption" tone="secondary">One guided form. Save drafts for review before anything is published.</VadText>
      </View>

      {error ? (
        <VadCard><View style={{ padding: theme.spacing.md, gap: 6 }}>
          <VadText tone="no" variant="label">Needs attention</VadText>
          <VadText tone="secondary">{error}</VadText>
        </View></VadCard>
      ) : null}
      {message ? (
        <VadCard><View style={{ padding: theme.spacing.md }}>
          <VadText tone="yes">{message}</VadText>
        </View></VadCard>
      ) : null}

      <VadCard>
        <View style={{ padding: theme.spacing.md, gap: theme.spacing.md }}>
          <View style={{ gap: 4 }}>
            <VadText variant="heading">1. Describe the idea</VadText>
            <VadText variant="caption" tone="secondary">AI fills in wording, not money values or legal approval.</VadText>
          </View>
          <VadInput label="Game idea" value={idea} onChangeText={setIdea} multiline placeholder="What should players experience or win?" />
          <View style={{ gap: 8 }}>
            <VadText variant="label">Game type</VadText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {engines.map((engine) => (
                <Chip key={engine.engine_key} label={engine.display_name} selected={engineKey === engine.engine_key} onPress={() => setEngineKey(engine.engine_key)} />
              ))}
            </View>
            {selectedEngine ? (
              <VadText variant="caption" tone={selectedEngine.runtime_ready && selectedEngine.rollout_status === 'ENABLED' ? 'yes' : 'warning'}>
                {selectedEngine.runtime_ready && selectedEngine.rollout_status === 'ENABLED'
                  ? 'Runtime marked ready'
                  : 'Draft-only: this engine is not enabled for public play'}
              </VadText>
            ) : null}
          </View>
          <VadButton label="Help me draft with AI" onPress={() => void askAiForDraft()} loading={working === 'draft'} disabled={working !== null} />
        </View>
      </VadCard>

      <VadCard>
        <View style={{ padding: theme.spacing.md, gap: theme.spacing.md }}>
          <VadText variant="heading">2. Game details</VadText>
          <VadInput label="Game title" value={title} onChangeText={setTitle} placeholder="A clear, short title" />
          <VadInput label="Description" value={description} onChangeText={setDescription} multiline placeholder="What is this game?" />
          {isPrizeDraw ? (
            <>
              <VadInput label="Campaign title" value={campaignTitle} onChangeText={setCampaignTitle} placeholder="Campaign or prize event name" />
              <VadInput label="Prize description" value={prizeTitle} onChangeText={setPrizeTitle} placeholder="What is the prize?" />
            </>
          ) : null}
        </View>
      </VadCard>

      <VadCard>
        <View style={{ padding: theme.spacing.md, gap: theme.spacing.md }}>
          <View style={{ gap: 4 }}>
            <VadText variant="heading">3. Artwork</VadText>
            <VadText variant="caption" tone="secondary">Upload a real image or generate a text-free cover. Artwork is saved to VAD Storage.</VadText>
          </View>
          <VadInput label="Visual direction (optional)" value={imagePrompt} onChangeText={setImagePrompt} multiline placeholder="Style, colours or visual subject" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <VadButton label="Upload image" variant="secondary" onPress={() => void uploadArtwork()} loading={working === 'upload'} disabled={working !== null} />
            <VadButton label="Generate with AI" onPress={() => void generateArtwork()} loading={working === 'image'} disabled={working !== null || !title.trim()} />
          </View>
          {previewUrl ? (
            <Image source={{ uri: previewUrl }} accessibilityLabel={title ? `${title} artwork preview` : 'Game artwork preview'} resizeMode="cover" style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surfaceMuted }} />
          ) : (
            <View style={{ minHeight: 78, borderRadius: theme.radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <VadIcon name="camera" size={20} tone="tertiary" />
              <VadText variant="caption" tone="tertiary">No cover selected</VadText>
            </View>
          )}
          {riskNotes ? <VadText variant="caption" tone="warning">AI review notes: {riskNotes}</VadText> : null}
        </View>
      </VadCard>

      {isPrizeDraw ? (
        <VadCard>
          <View style={{ padding: theme.spacing.md, gap: theme.spacing.md }}>
            <View style={{ gap: 4 }}>
              <VadText variant="heading">4. Campaign economics</VadText>
              <VadText variant="caption" tone="secondary">Set values for this campaign only. Nothing is prefilled.</VadText>
            </View>
            <View style={{ gap: 8 }}>
              <VadText variant="label">Currency</VadText>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['NGN', 'USDC'].map((item) => <Chip key={item} label={item} selected={currency === item} onPress={() => setCurrency(item)} />)}
              </View>
            </View>
            <VadInput label="Prize cost" value={prizeCost} onChangeText={setPrizeCost} keyboardType="decimal-pad" placeholder="Required" />
            <View style={{ gap: 8 }}>
              <VadText variant="label">Profit target</VadText>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Chip label="% of prize cost" selected={profitMode === 'PERCENT_OF_PRIZE'} onPress={() => setProfitMode('PERCENT_OF_PRIZE')} />
                <Chip label="Fixed amount" selected={profitMode === 'FIXED_AMOUNT'} onPress={() => setProfitMode('FIXED_AMOUNT')} />
              </View>
            </View>
            <VadInput label={profitMode === 'PERCENT_OF_PRIZE' ? 'Target (%)' : 'Target amount'} value={profitValue} onChangeText={setProfitValue} keyboardType="decimal-pad" placeholder="Required" />
            <VadInput label="Campaign cost budget" value={campaignCosts} onChangeText={setCampaignCosts} keyboardType="decimal-pad" placeholder="Required" />
            <VadInput label="Entry price" value={entryPrice} onChangeText={setEntryPrice} keyboardType="decimal-pad" placeholder="Required" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <VadInput label="Total entry cap" value={maxEntries} onChangeText={setMaxEntries} keyboardType="number-pad" placeholder="Required" />
              </View>
              <View style={{ flex: 1 }}>
                <VadInput label="Per-purchase cap" value={ticketsPerPurchase} onChangeText={setTicketsPerPurchase} keyboardType="number-pad" placeholder="Required" />
              </View>
            </View>
            <VadInput label="Per-user cap (optional)" value={userLimit} onChangeText={setUserLimit} keyboardType="number-pad" placeholder="Leave blank if not needed" />
            {estimate !== null ? (
              <View style={{ borderRadius: theme.radius.lg, backgroundColor: theme.colors.surfaceMuted, padding: theme.spacing.md, gap: 4 }}>
                <VadText variant="caption" tone="secondary">Estimated funding threshold</VadText>
                <VadText variant="heading">{currency} {estimate.toLocaleString('en-NG', { maximumFractionDigits: 4 })}</VadText>
                <VadText variant="caption" tone="tertiary">Based on the amounts entered; the database remains authoritative.</VadText>
              </View>
            ) : null}
            <VadInput label="Public terms" value={terms} onChangeText={setTerms} multiline placeholder="Review and confirm the campaign terms" />
            <VadInput label="Refund policy" value={refundPolicy} onChangeText={setRefundPolicy} multiline placeholder="Explain when entries are refunded" />
          </View>
        </VadCard>
      ) : null}

      <VadButton label={isPrizeDraw ? 'Save game and campaign drafts' : 'Save game draft'} onPress={() => void saveDraft()} loading={working === 'save'} disabled={working !== null} />
      <VadText variant="caption" tone="tertiary">Saving does not publish the game or enable paid play. Reviews and runtime controls remain separate.</VadText>
    </View>
  );
}
