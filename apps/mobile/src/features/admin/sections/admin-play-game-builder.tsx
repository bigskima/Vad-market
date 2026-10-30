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
  saveAdminPlayCampaignPrizes,
  publishAdminPlayPracticeExperience,
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

type PrizeDraft = { key: string; title: string; description: string; stockQuantity: string; winnerLimit: string; assetPath: string };

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
  const [engineKey, setEngineKey] = useState('QUICK_DRAW');
  const [idea, setIdea] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [campaignTitle, setCampaignTitle] = useState('');
  const [prizeTitle, setPrizeTitle] = useState('');
  const [prizeItems, setPrizeItems] = useState<PrizeDraft[]>([{ key: 'prize-1', title: '', description: '', stockQuantity: '1', winnerLimit: '1', assetPath: '' }]);
  const [uploadingPrizeIndex, setUploadingPrizeIndex] = useState<number | null>(null);
  const [pendingPrizeCampaignId, setPendingPrizeCampaignId] = useState<string | null>(null);
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

  function updatePrize(index: number, patch: Partial<PrizeDraft>) {
    setPrizeItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function addPrize() {
    setPrizeItems((current) => [
      ...current,
      { key: 'prize-' + Date.now().toString(36), title: '', description: '', stockQuantity: '1', winnerLimit: '1', assetPath: '' },
    ]);
  }

  async function uploadPrizeArtwork(index: number) {
    setUploadingPrizeIndex(index);
    setError(null);
    setMessage(null);
    try {
      const path = await uploadPlayMedia();
      if (!path) return;
      updatePrize(index, { assetPath: path });
      setMessage('Prize artwork uploaded.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Prize artwork could not be uploaded.');
    } finally {
      setUploadingPrizeIndex(null);
    }
  }

  const selectedEngine = engines.find((engine) => engine.engine_key === engineKey);
  const isPrizeDraw = engineKey === 'PRIZE_DRAW';
  const isFreePractice = ['QUICK_DRAW', 'SPIN_AND_WIN', 'SCRATCH_AND_REVEAL'].includes(engineKey);
  const selectedEngineReady = Boolean(selectedEngine?.runtime_ready && selectedEngine.rollout_status === 'ENABLED');
  const publishPracticeNow = isFreePractice && selectedEngineReady;
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
      setMessage('Draft ready. Review before saving.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create a draft. Try again.');
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
      setMessage('Cover uploaded.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The artwork could not be uploaded.');
    } finally {
      setWorking(null);
    }
  }

  async function generateArtwork() {
    if (!title.trim()) {
      setError('Enter a game title or create a draft with AI.');
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
      setMessage('Cover generated.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not generate the cover. Try again.');
    } finally {
      setWorking(null);
    }
  }

  async function retryPrizeInventory() {
    if (!pendingPrizeCampaignId || working !== null) return;
    setWorking('save');
    setError(null);
    setMessage(null);
    try {
      await saveAdminPlayCampaignPrizes(pendingPrizeCampaignId, prizeItems.map((item, index) => ({
        title: item.title.trim(),
        description: item.description.trim() || null,
        asset_path: item.assetPath || null,
        image_alt: item.title.trim(),
        stock_quantity: Number(item.stockQuantity),
        winner_limit: Number(item.winnerLimit),
        display_order: (index + 1) * 10,
      })));
      setPendingPrizeCampaignId(null);
      setMessage('Prize inventory saved to the campaign draft.');
      await onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Prize inventory could not be saved. Retry after checking the prize details.');
    } finally {
      setWorking(null);
    }
  }

  async function saveGame() {
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
      if (!campaignTitle.trim() || !currency || !prizeCost.trim() || !profitMode || !profitValue.trim()
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
      if (prizeItems.length < 1 || prizeItems.length > 25) {
        setError('Add between 1 and 25 prize items.');
        return;
      }
      let totalWinnerSlots = 0;
      for (const item of prizeItems) {
        const stock = Number(item.stockQuantity);
        const winners = Number(item.winnerLimit);
        if (!item.title.trim() || !Number.isSafeInteger(stock) || stock < 1
          || !Number.isSafeInteger(winners) || winners < 1 || winners > stock) {
          setError('Each prize needs a title, positive stock and a winner limit that does not exceed stock.');
          return;
        }
        totalWinnerSlots += winners;
      }
      if (totalWinnerSlots > totalCap) {
        setError('The total number of configured prize winners cannot exceed the campaign entry cap.');
        return;
      }
    }

    setWorking('save');
    let experienceSaved = false;
    let campaignSaved = false;
    try {
      const experiencePayload = {
        slug: slugify(title) || `play-${Date.now()}`,
        title: title.trim(),
        description: description.trim() || null,
        experience_type: selectedEngine.engine_family,
        engine_key: engineKey,
        hero_asset_url: imagePath || null,
        card_asset_url: imagePath || null,
        image_alt: title.trim(),
      };
      const experienceId = publishPracticeNow
        ? await publishAdminPlayPracticeExperience(experiencePayload)
        : await saveAdminPlayExperience({
            ...experiencePayload,
            status: 'DRAFT',
            public_config: {},
            engine_config: {},
          });
      experienceSaved = true;

      if (isPrizeDraw) {
        const campaignId = await saveAdminPlayCampaign({
          experience_id: experienceId,
          slug: slugify(campaignTitle) || slugify(title),
          title: campaignTitle.trim(),
          prize_title: prizeTitle.trim() || prizeItems[0]?.title.trim() || title.trim(),
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
        campaignSaved = true;
        setPendingPrizeCampaignId(campaignId);
        await saveAdminPlayCampaignPrizes(campaignId, prizeItems.map((item, index) => ({
          title: item.title.trim(),
          description: item.description.trim() || null,
          asset_path: item.assetPath || null,
          image_alt: item.title.trim(),
          stock_quantity: Number(item.stockQuantity),
          winner_limit: Number(item.winnerLimit),
          display_order: (index + 1) * 10,
        })));
        setPendingPrizeCampaignId(null);
      }

      await onSaved();
      setMessage(isPrizeDraw
        ? 'Game and campaign saved as drafts for review.'
        : publishPracticeNow
          ? 'Game published. Players can now play this free practice game.'
          : 'Game saved as a draft for review.');
      setIdea('');
      setTitle('');
      setDescription('');
      setCampaignTitle('');
      setPrizeTitle('');
      setPendingPrizeCampaignId(null);
      setPrizeItems([{ key: 'prize-1', title: '', description: '', stockQuantity: '1', winnerLimit: '1', assetPath: '' }]);
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
      const detail = reason instanceof Error ? reason.message : 'Could not save the draft. Try again.';
      setError(campaignSaved
        ? 'The game and campaign draft were saved, but prize inventory needs attention. Reopen the draft and complete its prize setup.'
        : experienceSaved
          ? 'The game was saved, but its campaign needs attention. Check the fields and try again.'
          : detail);
    } finally {
      setWorking(null);
    }
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ gap: 4 }}>
        <VadText variant="title">Create a game</VadText>
        <VadText variant="caption" tone="secondary">Free practice games go live now. Paid prize draws stay in review until approved.</VadText>
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
            <VadText variant="caption" tone="secondary">AI helps with copy, but you set the numbers and approve the terms.</VadText>
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
                  ? (isFreePractice ? 'Ready for players' : 'Ready for review')
                  : 'Not available to players yet'}
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
              <VadInput label="Prize summary (optional)" value={prizeTitle} onChangeText={setPrizeTitle} placeholder="Short summary of the prize collection" />
            </>
          ) : null}
        </View>
      </VadCard>

      <VadCard>
        <View style={{ padding: theme.spacing.md, gap: theme.spacing.md }}>
          <View style={{ gap: 4 }}>
            <VadText variant="heading">3. Artwork</VadText>
            <VadText variant="caption" tone="secondary">Upload a cover image or generate one with AI.</VadText>
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
              <VadText variant="caption" tone="secondary">Set the values for this campaign.</VadText>
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
                <VadText variant="caption" tone="tertiary">Estimate only.</VadText>
              </View>
            ) : null}
            <VadInput label="Public terms" value={terms} onChangeText={setTerms} multiline placeholder="Review and confirm the campaign terms" />
            <VadInput label="Refund policy" value={refundPolicy} onChangeText={setRefundPolicy} multiline placeholder="Explain when entries are refunded" />
          </View>
        </VadCard>
      ) : null}

      {isPrizeDraw ? (
        <VadCard>
          <View style={{ padding: theme.spacing.md, gap: theme.spacing.md }}>
            <View style={{ gap: 4 }}>
              <VadText variant="heading">5. Prize inventory & winner limits</VadText>
              <VadText variant="caption" tone="secondary">
                Add every item in the collection. Stock is the quantity secured; winner limit is how many different tickets may win that item.
              </VadText>
            </View>
            {prizeItems.map((item, index) => {
              const itemImage = playMediaPublicUrl(item.assetPath);
              return (
                <View key={item.key} style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: theme.spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <VadText variant="label">Prize {index + 1}</VadText>
                    {prizeItems.length > 1 ? (
                      <Pressable accessibilityRole="button" onPress={() => setPrizeItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                        <VadText variant="caption" tone="no">Remove</VadText>
                      </Pressable>
                    ) : null}
                  </View>
                  <VadInput label="Prize name" value={item.title} onChangeText={(value) => updatePrize(index, { title: value })} placeholder="e.g. Smartphone" />
                  <VadInput label="Description (optional)" value={item.description} onChangeText={(value) => updatePrize(index, { description: value })} placeholder="Model, colour or key details" />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <VadInput label="Stock quantity" value={item.stockQuantity} onChangeText={(value) => updatePrize(index, { stockQuantity: value })} keyboardType="number-pad" placeholder="e.g. 10" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <VadInput label="Maximum winners" value={item.winnerLimit} onChangeText={(value) => updatePrize(index, { winnerLimit: value })} keyboardType="number-pad" placeholder="e.g. 2" />
                    </View>
                  </View>
                  <VadButton
                    label={uploadingPrizeIndex === index ? 'Uploading prize image…' : item.assetPath ? 'Replace prize image' : 'Upload prize image'}
                    variant="secondary"
                    onPress={() => void uploadPrizeArtwork(index)}
                    loading={uploadingPrizeIndex === index}
                    disabled={working !== null || uploadingPrizeIndex !== null}
                  />
                  {itemImage ? (
                    <Image source={{ uri: itemImage }} accessibilityLabel={item.title ? item.title + ' prize artwork' : 'Prize artwork'} resizeMode="cover" style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceMuted }} />
                  ) : null}
                </View>
              );
            })}
            <VadButton label="Add another prize" variant="secondary" onPress={addPrize} disabled={working !== null || uploadingPrizeIndex !== null || prizeItems.length >= 25} />
            <VadText variant="caption" tone="tertiary">
              The draw assigns a unique eligible ticket to each configured winner slot. Prize stock and winner limits are checked again on the server.
            </VadText>
          </View>
        </VadCard>
      ) : null}

      {pendingPrizeCampaignId ? (
        <VadCard>
          <View style={{ padding: theme.spacing.md, gap: theme.spacing.sm }}>
            <VadText variant="label">Campaign draft saved; prize setup still needs to finish.</VadText>
            <VadButton
              label="Retry saving prize inventory"
              onPress={() => void retryPrizeInventory()}
              loading={working === 'save'}
              disabled={working !== null}
            />
          </View>
        </VadCard>
      ) : null}

      <VadButton
        label={isPrizeDraw ? 'Save game and campaign drafts' : publishPracticeNow ? 'Publish game for players' : 'Save game draft'}
        onPress={() => void saveGame()}
        loading={working === 'save'}
        disabled={working !== null}
      />
      <VadText variant="caption" tone="tertiary">
        {publishPracticeNow
          ? 'Free practice only. No entry fee, points, cash or physical prizes.'
          : 'Games that are not ready stay in draft until their engine is enabled and reviewed.'}
      </VadText>
    </View>
  );
}
