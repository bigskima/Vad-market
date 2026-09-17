import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getAdminGuidedMarketCatalog,
  saveAdminGuidedCategory,
  saveAdminSimpleGuidedMarketType,
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

  const [selectedCategoryCode, setSelectedCategoryCode] = useState('');
  const [typeName, setTypeName] = useState('');
  const [typeDescription, setTypeDescription] = useState('');
  const [sourceLabel, setSourceLabel] = useState('Authoritative result source');

  async function reload() {
    const catalog = await getAdminGuidedMarketCatalog();
    setCategories(catalog.categories);
    setSelectedCategoryCode((current) => current || catalog.categories[0]?.code || '');
  }

  useEffect(() => {
    let ignore = false;
    void getAdminGuidedMarketCatalog()
      .then((catalog) => {
        if (ignore) return;
        setCategories(catalog.categories);
        setSelectedCategoryCode(catalog.categories[0]?.code ?? '');
      })
      .catch((value) => { if (!ignore) setError(value instanceof Error ? value.message : 'Market types could not be loaded.'); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, []);

  const selectedCategory = useMemo(
    () => categories.find((item) => item.code === selectedCategoryCode) ?? null,
    [categories, selectedCategoryCode],
  );

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
      await reload();
      setCategoryName('');
      setCategoryDescription('');
      setSuccess('Category added. It is now available in Create Market.');
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
            <VadCard variant="muted"><VadText variant="caption" tone="secondary">No code or internal category ID is needed. VAD creates it from the name.</VadText></VadCard>
            <VadButton label={working ? 'Saving…' : 'Add category'} disabled={working} onPress={() => void saveCategory()} />
          </View>
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            <VadText variant="bodyStrong">Choose category</VadText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {categories.map((item) => <VadChip key={item.code} label={item.name} selected={selectedCategory?.code === item.code} onPress={() => setSelectedCategoryCode(item.code)} />)}
            </View>
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
