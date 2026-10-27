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
  saveAdminGuidedMarketTypeDefinition,
  setAdminGuidedCategoryPresentation,
  type AdminGuidedCatalogCategory,
  type AdminGuidedCatalogField,
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
  const [sourceLabel, setSourceLabel] = useState('Official government, publisher or result-owner source');
  const [sourceRequired, setSourceRequired] = useState(true);
  const [typeQuestionTemplate, setTypeQuestionTemplate] = useState('Will {{subject}} {{outcome}} by {{deadline}}?');
  const [typeConditionTemplate, setTypeConditionTemplate] = useState("Resolve YES only when the named authoritative source confirms that {{subject}} has {{outcome}} by {{deadline}}. Use the source's original publication timestamp. If the source is unavailable or evidence is ambiguous, do not resolve NO merely because no matching result was found.");
  const [typeFields, setTypeFields] = useState<AdminGuidedCatalogField[]>([
    { key: 'subject', label: 'Subject / institution', placeholder: 'Who or what the market concerns', required: true },
    { key: 'outcome', label: 'Qualifying outcome', placeholder: 'Precisely define the event', required: true },
    { key: 'deadline', label: 'Deadline and timezone', placeholder: 'YYYY-MM-DD HH:mm WAT', required: true },
  ]);

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

  function updateTypeField(index: number, key: keyof AdminGuidedCatalogField, value: string | boolean) {
    setTypeFields((current) => current.map((field, position) => {
      if (position !== index) return field;
      if (key === 'required') return { ...field, required: value === true };
      if (key === 'key') return { ...field, key: String(value).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 50) };
      return { ...field, [key]: String(value) };
    }));
  }

  async function saveMarketType() {
    const name = typeName.trim();
    const question = typeQuestionTemplate.trim();
    const condition = typeConditionTemplate.trim();
    const fields = typeFields.map((field) => ({
      key: field.key.trim(),
      label: field.label.trim(),
      placeholder: field.placeholder?.trim() ?? '',
      required: field.required === true,
    }));
    if (!selectedCategory || !name) return setError('Choose a category and enter a market type name.');
    if (!question) return setError('Add a question template so the type can generate a clear market question.');
    if (condition.length < 20) return setError('Write an objective resolution condition of at least 20 characters.');
    if (!sourceLabel.trim()) return setError('Name the authoritative source or source class.');
    if (!fields.length) return setError('Add at least one parameter field.');
    const keys = fields.map((field) => field.key);
    if (fields.some((field) => !/^[a-z][a-z0-9_]{0,49}$/.test(field.key) || !field.label)) {
      return setError('Each field needs a unique lowercase key (letters, numbers and underscores) and a label.');
    }
    if (new Set(keys).size !== keys.length) return setError('Parameter keys must be unique.');
    const placeholders = [...(question + ' ' + condition).matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)].map((match) => match[1]);
    const missing = placeholders.find((placeholder) => !keys.includes(placeholder));
    if (missing) return setError('Add a parameter field for every template variable, including {{' + missing + '}}.');
    setWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await saveAdminGuidedMarketTypeDefinition({
        code: `${selectedCategory.code}_${codeFrom(name)}`,
        categoryCode: selectedCategory.code,
        name,
        description: typeDescription.trim(),
        questionTemplate: question,
        conditionTemplate: condition,
        sourceLabel: sourceLabel.trim(),
        sourceRequired,
        fields,
        displayOrder: selectedCategory.marketTypes.length * 10 + 10,
      });
      await reload(selectedCategory.code);
      setTypeName('');
      setTypeDescription('');
      setSourceLabel('Official government, publisher or result-owner source');
      setSourceRequired(true);
      setTypeQuestionTemplate('Will {{subject}} {{outcome}} by {{deadline}}?');
      setTypeConditionTemplate("Resolve YES only when the named authoritative source confirms that {{subject}} has {{outcome}} by {{deadline}}. Use the source's original publication timestamp. If the source is unavailable or evidence is ambiguous, do not resolve NO merely because no matching result was found.");
      setTypeFields([
        { key: 'subject', label: 'Subject / institution', placeholder: 'Who or what the market concerns', required: true },
        { key: 'outcome', label: 'Qualifying outcome', placeholder: 'Precisely define the event', required: true },
        { key: 'deadline', label: 'Deadline and timezone', placeholder: 'YYYY-MM-DD HH:mm WAT', required: true },
      ]);
      setSuccess('Market type saved with its question template, required parameters, authoritative source policy and resolution condition. Create Market and the agent API now use this database configuration.');
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
            <VadInput label="Market type name" value={typeName} onChangeText={setTypeName} placeholder="e.g. Official policy announcement" />
            <VadInput label="Short description · optional" value={typeDescription} onChangeText={setTypeDescription} multiline placeholder="Explain when an admin should choose this." />

            <VadText variant="bodyStrong">Question template</VadText>
            <VadInput label="Question with {{field}} variables" value={typeQuestionTemplate} onChangeText={setTypeQuestionTemplate} multiline placeholder="Will {{subject}} {{outcome}} by {{deadline}}?" hint="Use variables whose keys match fields below. VAD fills these from the admin's entered details." />
            <VadText variant="bodyStrong">Objective resolution condition</VadText>
            <VadInput label="When should YES resolve?" value={typeConditionTemplate} onChangeText={setTypeConditionTemplate} multiline placeholder="Define the evidence, eligible publication time, deadline and what to do if evidence is inconclusive." hint="This condition is saved with the DB market type and the chosen resolver. AI may propose wording but cannot silently replace this rule." />

            <VadText variant="bodyStrong">Authoritative source</VadText>
            <VadInput label="Source name or source class" value={sourceLabel} onChangeText={setSourceLabel} placeholder="e.g. Official State House newsroom" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 }}>
              <VadText variant="caption" tone="secondary">Require source before creation</VadText>
              <VadChip label="Required" selected={sourceRequired} tone={sourceRequired ? 'brand' : 'neutral'} onPress={() => setSourceRequired(true)} />
              <VadChip label="Optional" selected={!sourceRequired} tone={!sourceRequired ? 'brand' : 'neutral'} onPress={() => setSourceRequired(false)} />
            </View>

            <View style={{ gap: theme.spacing.sm }}>
              <VadText variant="bodyStrong">Market parameters</VadText>
              <VadText variant="caption" tone="secondary">Create the fields admins fill in at market creation. The key is used inside templates; label and placeholder are what the admin sees.</VadText>
              {typeFields.map((field, index) => (
                <VadCard key={field.key || index} variant="muted" style={{ gap: theme.spacing.sm }}>
                  <VadInput label="Field key" value={field.key} onChangeText={(value) => updateTypeField(index, 'key', value)} placeholder="institution" autoCapitalize="none" />
                  <VadInput label="Field label" value={field.label} onChangeText={(value) => updateTypeField(index, 'label', value)} placeholder="Government institution" />
                  <VadInput label="Placeholder / example" value={field.placeholder ?? ''} onChangeText={(value) => updateTypeField(index, 'placeholder', value)} placeholder="e.g. Nigeria State House" />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 }}>
                    <VadChip label={field.required ? 'Required' : 'Optional'} selected={field.required} tone={field.required ? 'brand' : 'neutral'} onPress={() => updateTypeField(index, 'required', !field.required)} />
                    <VadButton label="Remove field" size="small" variant="secondary" onPress={() => setTypeFields((current) => current.filter((_, position) => position !== index))} />
                  </View>
                </VadCard>
              ))}
              <VadButton label="Add parameter field" size="small" variant="secondary" onPress={() => setTypeFields((current) => [...current, { key: `field_${current.length + 1}`, label: '', placeholder: '', required: true }])} />
            </View>

            <VadCard variant="muted" style={{ gap: 4 }}>
              <VadText variant="bodyStrong">Resolver mode: Verified event</VadText>
              <VadText variant="caption" tone="secondary">Custom types use VAD's existing verified-event resolution handler. Do not select a specialized handler unless its source and runtime are already supported. Every question still uses a configured source and condition; a custom label does not disable resolution safeguards.</VadText>
            </VadCard>
            <VadButton label={working ? 'Saving market type…' : 'Save configured market type'} disabled={working} onPress={() => void saveMarketType()} />
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
