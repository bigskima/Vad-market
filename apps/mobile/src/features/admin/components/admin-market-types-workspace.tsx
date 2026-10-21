import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import type { MarketPresentationProfile } from '@/services/admin-guided-market-catalog-api';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getAdminGuidedMarketCatalog,
  saveAdminGuidedCategory,
  saveAdminSimpleGuidedMarketType,
  setAdminGuidedCategoryPresentation,
  type AdminGuidedCatalogCategory,
} from '@/services/admin-guided-market-catalog-api';

type EditorMode = 'CATEGORY' | 'MARKET_TYPE';

function codeFrom(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

export function AdminMarketTypesWorkspace() {
  const theme = useVadTheme();
  const [categories, setCategories] = useState<AdminGuidedCatalogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>('CATEGORY');

  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [categoryProfile, setCategoryProfile] = useState<MarketPresentationProfile>('EVENT');
  const [categoryGroupField, setCategoryGroupField] = useState('');
  const [presentationProfile, setPresentationProfile] = useState<MarketPresentationProfile>('EVENT');
  const [presentationGroupField, setPresentationGroupField] = useState('');

  const [selectedCategoryCode, setSelectedCategoryCode] = useState('');
  const [typeName, setTypeName] = useState('');
  const [typeDescription, setTypeDescription] = useState('');
  const [sourceLabel, setSourceLabel] = useState('Authoritative result source');

  async function reload(preferredCode?: string) {
    const catalog = await getAdminGuidedMarketCatalog();
    setCategories(catalog.categories);
    const selected = catalog.categories.find((item) => item.code === (preferredCode || selectedCategoryCode))
      ?? catalog.categories[0]
      ?? null;
    setSelectedCategoryCode(selected?.code ?? '');
    setPresentationProfile(selected?.presentationProfile ?? 'EVENT');
    setPresentationGroupField(selected?.groupField ?? '');
  }

  useEffect(() => {
    let ignore = false;
    void getAdminGuidedMarketCatalog()
      .then((catalog) => {
        if (ignore) return;
        setCategories(catalog.categories);
        const first = catalog.categories[0];
        setSelectedCategoryCode(first?.code ?? '');
        setPresentationProfile(first?.presentationProfile ?? 'EVENT');
        setPresentationGroupField(first?.groupField ?? '');
      })
      .catch((value) => { if (!ignore) setError(value instanceof Error ? value.message : 'Market types could not be loaded.'); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, []);

  const selectedCategory = useMemo(
    () => categories.find((item) => item.code === selectedCategoryCode) ?? null,
    [categories, selectedCategoryCode],
  );



  const presentationProfiles: MarketPresentationProfile[] = [
    'EVENT', 'CRYPTO', 'SPORTS', 'MUSIC', 'AI', 'STOCKS',
    'ECONOMICS', 'ENTERTAINMENT', 'PUBLIC_EVENTS',
  ];

  async function saveCategory() {
    const name = categoryName.trim();
    if (!name) return setError('Enter a category name.');
    setWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await saveAdminGuidedCategory({
        code: codeFrom(name),
        name,
        description: categoryDescription.trim(),
        displayOrder: categories.length * 10 + 10,
      });
      await setAdminGuidedCategoryPresentation({
        code: codeFrom(name),
        presentationProfile: categoryProfile,
        groupField: categoryGroupField.trim(),
      });
      await reload(codeFrom(name));
      setCategoryName('');
      setCategoryDescription('');
      setCategoryProfile('EVENT');
      setCategoryGroupField('');
      setSuccess('Category added with its display profile. It is available in Create Market and Market discovery.');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Category could not be saved.');
    } finally {
      setWorking(false);
    }
  }

  async function saveMarketType() {
    const name = typeName.trim();
    if (!selectedCategory || !name) return setError('Choose a category and enter a market type name.');
    setWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await saveAdminSimpleGuidedMarketType({
        code: `${selectedCategory.code}_${codeFrom(name)}`,
        categoryCode: selectedCategory.code,
        name,
        description: typeDescription.trim(),
        sourceLabel: sourceLabel.trim() || 'Authoritative result source',
        displayOrder: selectedCategory.marketTypes.length * 10 + 10,
      });
      await reload();
      setTypeName('');
      setTypeDescription('');
      setSourceLabel('Authoritative result source');
      setSuccess('Market type added. Admins can use it immediately without an app deployment.');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Market type could not be saved.');
    } finally {
      setWorking(false);
    }
  }

  if (loading) return <View style={{ gap: theme.spacing.md }}><VadSkeleton width="45%" height={32} /><VadSkeleton height={160} /><VadSkeleton height={240} /></View>;

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: 4 }}>
        <VadText variant="label" tone="brand">MARKET CATALOG</VadText>
        <VadText variant="title">Categories & market types</VadText>
        <VadText tone="secondary">Keep Create Market simple for admins. Add a category or a new kind of objective market here; VAD generates the internal identifiers automatically.</VadText>
      </View>

      <VadCard variant="raised" style={{ gap: theme.spacing.lg }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <VadChip label="Add category" selected={mode === 'CATEGORY'} tone={mode === 'CATEGORY' ? 'brand' : 'neutral'} onPress={() => { setMode('CATEGORY'); setError(null); setSuccess(null); }} />
          <VadChip label="Add market type" selected={mode === 'MARKET_TYPE'} tone={mode === 'MARKET_TYPE' ? 'brand' : 'neutral'} onPress={() => { setMode('MARKET_TYPE'); setError(null); setSuccess(null); }} />
        </View>

        {mode === 'CATEGORY' ? (
          <View style={{ gap: theme.spacing.md }}>
            <VadInput label="Category name" value={categoryName} onChangeText={setCategoryName} placeholder="e.g. Fashion" />
            <VadInput label="Short description · optional" value={categoryDescription} onChangeText={setCategoryDescription} multiline placeholder="What kinds of objective markets belong here?" />
            <VadText variant="bodyStrong">Market experience</VadText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {presentationProfiles.map((profile) => (
                <VadChip key={profile} label={profile.replaceAll('_', ' ')} selected={categoryProfile === profile} tone={categoryProfile === profile ? 'brand' : 'neutral'} onPress={() => setCategoryProfile(profile)} />
              ))}
            </View>
            <VadInput label="Grouping field · optional" value={categoryGroupField} onChangeText={setCategoryGroupField} placeholder="e.g. competition, event_name, company" />
            <VadCard variant="muted"><VadText variant="caption" tone="secondary">Profile controls category-specific presentation. Grouping reads existing market context and does not change outcome rules.</VadText></VadCard>
            <VadButton label={working ? 'Saving…' : 'Add category'} disabled={working} onPress={() => void saveCategory()} />
          </View>
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            <VadText variant="bodyStrong">Choose category</VadText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {categories.map((item) => <VadChip key={item.code} label={item.name} selected={selectedCategory?.code === item.code} onPress={() => { setSelectedCategoryCode(item.code); setPresentationProfile(item.presentationProfile ?? 'EVENT'); setPresentationGroupField(item.groupField ?? ''); }} />)}
            </View>
            <VadCard variant="muted" style={{ gap: theme.spacing.sm }}>
              <VadText variant="bodyStrong">Selected category experience</VadText>
              <VadText variant="caption" tone="secondary">Changing the profile updates the market display and grouping, not its authoritative result source or settlement.</VadText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {presentationProfiles.map((profile) => (
                  <VadChip key={profile} label={profile.replaceAll('_', ' ')} selected={presentationProfile === profile} tone={presentationProfile === profile ? 'brand' : 'neutral'} onPress={() => setPresentationProfile(profile)} />
                ))}
              </View>
              <VadInput label="Grouping field · optional" value={presentationGroupField} onChangeText={setPresentationGroupField} placeholder="e.g. competition, event_name, company" />
              <VadButton
                label="Save category presentation"
                variant="secondary"
                disabled={working || !selectedCategory}
                onPress={() => {
                  if (!selectedCategory) return;
                  setWorking(true);
                  setError(null);
                  setSuccess(null);
                  void setAdminGuidedCategoryPresentation({
                    code: selectedCategory.code,
                    presentationProfile,
                    groupField: presentationGroupField.trim(),
                  }).then(async () => {
                    await reload();
                    setSuccess('Category presentation updated. Market discovery will use the saved profile and grouping field.');
                  }).catch((value: unknown) => setError(value instanceof Error ? value.message : 'Category presentation could not be saved.'))
                    .finally(() => setWorking(false));
                }}
              />
            </VadCard>
            <VadInput label="Market type name" value={typeName} onChangeText={setTypeName} placeholder="e.g. Fashion award winner" />
            <VadInput label="Short description · optional" value={typeDescription} onChangeText={setTypeDescription} multiline placeholder="Explain when an admin should choose this." />
            <VadInput label="Result source label" value={sourceLabel} onChangeText={setSourceLabel} placeholder="e.g. Official award organizer" />
            <VadCard variant="muted" style={{ gap: 4 }}>
              <VadText variant="bodyStrong">Simple market type</VadText>
              <VadText variant="caption" tone="secondary">Admins creating this type will write the YES condition in plain language and choose an authoritative source. Common built-in types can still have more structured fields.</VadText>
            </VadCard>
            <VadButton label={working ? 'Saving…' : 'Add market type'} disabled={working} onPress={() => void saveMarketType()} />
          </View>
        )}

        {error ? <VadErrorState title="Could not save" message={error} /> : null}
        {success ? <VadCard variant="brand"><VadText tone="brand">{success}</VadText></VadCard> : null}
      </VadCard>

      <View style={{ gap: theme.spacing.md }}>
        <VadText variant="heading">Available now</VadText>
        {categories.map((item) => (
          <VadCard key={item.code} variant="muted" style={{ gap: 8 }}>
            <VadText variant="bodyStrong">{item.name}</VadText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <VadChip label={(item.presentationProfile ?? 'EVENT').replaceAll('_', ' ')} tone="brand" />
              <VadChip label={item.groupField ? `Group: ${item.groupField}` : 'Ungrouped'} />
            </View>
            {item.description ? <VadText variant="caption" tone="secondary">{item.description}</VadText> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {item.marketTypes.map((type) => <VadChip key={type.code} label={type.name} />)}
            </View>
          </VadCard>
        ))}
      </View>
    </View>
  );
}
