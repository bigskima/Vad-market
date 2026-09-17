import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadDateTimeField } from '@/components/ui/vad-date-time-field';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { useVadTheme } from '@/providers/theme-provider';
import {
  createAdminMarketDraft,
  getAdminMarketAutoOptions,
  type AdminMarketAutoOptions,
} from '@/services/admin-market-approval-api';

const CATEGORIES = ['Politics', 'Sports', 'Crypto', 'Business', 'Economy', 'Technology', 'Entertainment', 'Science', 'World', 'Other'] as const;
type CreateStep = 1 | 2 | 3;

export default function AdminCreateMarketRoute() {
  return (
    <AdminPermissionGate permissions={['markets.manage']}>
      <AdminRouteContainer>
        <AdminCreateMarketContent />
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}

function AdminCreateMarketContent() {
  const theme = useVadTheme();
  const [options, setOptions] = useState<AdminMarketAutoOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Record<string, unknown> | null>(null);
  const [step, setStep] = useState<CreateStep>(1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('Politics');
  const [countryCode, setCountryCode] = useState('');
  const [assetCode, setAssetCode] = useState('');
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [resolvesAfter, setResolvesAfter] = useState('');

  useEffect(() => {
    let ignore = false;
    void getAdminMarketAutoOptions()
      .then((next) => {
        if (!ignore) setOptions(next);
      })
      .catch((value) => {
        if (!ignore) setError(value instanceof Error ? value.message : 'Market options could not be loaded.');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => { ignore = true; };
  }, []);

  const resolvedCountryCode = countryCode || (options?.jurisdictions.length === 1 ? options.jurisdictions[0].countryCode : '');
  const jurisdiction = useMemo(
    () => options?.jurisdictions.find((item) => item.countryCode === resolvedCountryCode) ?? null,
    [options, resolvedCountryCode],
  );
  const resolvedAssetCode = assetCode || (jurisdiction?.assets.includes('TNGN') ? 'TNGN' : jurisdiction?.assets[0] ?? '');
  const sandbox = resolvedAssetCode === 'TNGN';

  const scheduleValid = [opensAt, closesAt, resolvesAfter].every((value) => value && Number.isFinite(Date.parse(value)))
    && Date.parse(closesAt) > Date.parse(opensAt)
    && Date.parse(resolvesAfter) >= Date.parse(closesAt);

  function continueFromDetails() {
    setError(null);
    if (!title.trim()) {
      setError('Enter the market question before continuing.');
      return;
    }
    setStep(2);
  }

  function continueFromSetup() {
    setError(null);
    if (!resolvedCountryCode || !resolvedAssetCode) {
      setError('Choose a market currency before continuing.');
      return;
    }
    if (![opensAt, closesAt, resolvesAfter].every((value) => value && Number.isFinite(Date.parse(value)))) {
      setError('Choose the opening, closing and resolution times.');
      return;
    }
    if (Date.parse(closesAt) <= Date.parse(opensAt)) {
      setError('Closing time must be after opening time.');
      return;
    }
    if (Date.parse(resolvesAfter) < Date.parse(closesAt)) {
      setError('Resolution time cannot be before market close.');
      return;
    }
    setStep(3);
  }

  async function createMarket() {
    if (working || !scheduleValid) return;
    setError(null);
    setCreated(null);
    setWorking(true);
    try {
      setCreated(await createAdminMarketDraft({
        title,
        description,
        category,
        opensAt: new Date(opensAt).toISOString(),
        closesAt: new Date(closesAt).toISOString(),
        resolvesAfter: new Date(resolvesAfter).toISOString(),
        countryCode: resolvedCountryCode,
        assetCode: resolvedAssetCode,
      }));
    } catch (value) {
      setError(value instanceof Error ? value.message : 'VAD market could not be created.');
    } finally {
      setWorking(false);
    }
  }

  function resetForm() {
    setCreated(null);
    setStep(1);
    setTitle('');
    setDescription('');
    setCategory('Politics');
    setCountryCode('');
    setAssetCode('');
    setOpensAt('');
    setClosesAt('');
    setResolvesAfter('');
    setError(null);
  }

  if (loading) {
    return <View style={{ gap: theme.spacing.md }}><VadSkeleton width="50%" height={32} /><VadSkeleton height={110} /><VadSkeleton height={260} /></View>;
  }

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: 4 }}>
        <VadText variant="label" tone="brand">VAD MARKETS</VadText>
        <VadText variant="title">Create a VAD market.</VadText>
        <VadText tone="secondary">A guided three-step flow keeps the market question, trading setup and final review separate.</VadText>
      </View>

      {!created ? <CreateStepRail step={step} /> : null}

      {created ? (
        <VadCard variant="raised" style={{ gap: theme.spacing.md, borderColor: theme.colors.yes }}>
          <VadChip label="DRAFT CREATED" tone="yes" />
          <VadText variant="title" tone="yes">Market created successfully.</VadText>
          <VadText variant="caption" tone="secondary">
            VAD configured the resolution path automatically. The market is still a controlled draft; publish it when you are ready for testers to see it.
          </VadText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <VadChip label={String(created.asset_code ?? resolvedAssetCode)} tone={sandbox ? 'brand' : 'neutral'} />
            <VadChip label={String(created.resolution_mode ?? 'VAD AUTO').replaceAll('_', ' ')} tone="yes" />
          </View>
          <VadButton label="Open Market Publishing" onPress={() => router.push('/admin/market-publishing')} />
          <VadButton label="Create another market" variant="secondary" onPress={resetForm} />
        </VadCard>
      ) : null}

      {!created && step === 1 ? (
        <VadCard variant="raised" style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: 3 }}>
            <VadText variant="caption" tone="brand">STEP 1 · MARKET</VadText>
            <VadText variant="heading">Define the question.</VadText>
            <VadText variant="caption" tone="secondary">Keep this step focused on what users are predicting. Timing and currency come next.</VadText>
          </View>

          <VadInput
            label="Market question"
            value={title}
            onChangeText={(value) => { setTitle(value); setError(null); }}
            multiline
            placeholder="Will … happen before …?"
            hint="Write one clear YES/NO question."
          />
          <VadInput
            label="Short context · optional"
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="Add useful context for traders."
          />

          <View style={{ gap: 8 }}>
            <VadText variant="label">Category</VadText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {CATEGORIES.map((item) => (
                <VadChip key={item} label={item} selected={category === item} tone={category === item ? 'brand' : 'neutral'} onPress={() => setCategory(item)} />
              ))}
            </View>
          </View>

          {error ? <VadErrorState title="Check this step" message={error} /> : null}
          <VadButton label="Continue to setup" onPress={continueFromDetails} />
        </VadCard>
      ) : null}

      {!created && step === 2 ? (
        <VadCard variant="raised" style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: 3 }}>
            <VadText variant="caption" tone="brand">STEP 2 · TRADING SETUP</VadText>
            <VadText variant="heading">Choose currency and timing.</VadText>
            <VadText variant="caption" tone="secondary">Use TNGN while validating the full market lifecycle. It is isolated from real NGN.</VadText>
          </View>

          {options && options.jurisdictions.length > 1 ? (
            <View style={{ gap: 8 }}>
              <VadText variant="label">Jurisdiction</VadText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {options.jurisdictions.map((item) => (
                  <VadChip key={item.countryCode} label={item.name} selected={resolvedCountryCode === item.countryCode} onPress={() => { setCountryCode(item.countryCode); setAssetCode(''); }} />
                ))}
              </View>
            </View>
          ) : null}

          {jurisdiction ? (
            <View style={{ gap: 8 }}>
              <VadText variant="label">Market currency</VadText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {jurisdiction.assets.map((asset) => (
                  <VadChip
                    key={asset}
                    label={asset === 'TNGN' ? 'Test NGN · Sandbox' : asset}
                    selected={resolvedAssetCode === asset}
                    tone={resolvedAssetCode === asset && asset === 'TNGN' ? 'brand' : 'neutral'}
                    onPress={() => setAssetCode(asset)}
                  />
                ))}
              </View>
              <VadCard variant={sandbox ? 'brand' : 'muted'} style={{ gap: 3 }}>
                <VadText variant="bodyStrong" tone={sandbox ? 'brand' : 'warning'}>{sandbox ? 'Recommended for testnet' : 'Real-money currency selected'}</VadText>
                <VadText variant="caption" tone="secondary">
                  {sandbox
                    ? 'TNGN uses synthetic balances and instant sandbox liquidity. It cannot be deposited or withdrawn.'
                    : 'Use TNGN until matching, oracle resolution and automatic settlement have passed your sandbox tests.'}
                </VadText>
              </VadCard>
            </View>
          ) : null}

          <VadDateTimeField label="Opens" value={opensAt} onChange={setOpensAt} hint="When testers can begin trading." />
          <VadDateTimeField label="Closes" value={closesAt} onChange={setClosesAt} minDate={opensAt || undefined} hint="Trading stops at this time." />
          <VadDateTimeField label="Resolve after" value={resolvesAfter} onChange={setResolvesAfter} minDate={closesAt || opensAt || undefined} hint="VAD begins automatic resolution or controlled oracle review from this time." />

          {error ? <VadErrorState title="Check this step" message={error} /> : null}
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <VadButton label="Back" variant="secondary" onPress={() => { setError(null); setStep(1); }} style={{ flex: 1 }} />
            <VadButton label="Review market" onPress={continueFromSetup} style={{ flex: 1.4 }} />
          </View>
        </VadCard>
      ) : null}

      {!created && step === 3 ? (
        <VadCard variant="brand" style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: 3 }}>
            <VadText variant="caption" tone="brand">STEP 3 · REVIEW</VadText>
            <VadText variant="heading">Ready to create the draft.</VadText>
            <VadText variant="caption" tone="secondary">Nothing is public yet. Creation produces a controlled draft, then Market Publishing decides when users can see it.</VadText>
          </View>

          <ReviewRow label="Question" value={title.trim()} />
          <ReviewRow label="Category" value={category} />
          <ReviewRow label="Currency" value={sandbox ? 'TNGN · Sandbox' : resolvedAssetCode} />
          <ReviewRow label="Opens" value={new Date(opensAt).toLocaleString()} />
          <ReviewRow label="Closes" value={new Date(closesAt).toLocaleString()} />
          <ReviewRow label="Resolve after" value={new Date(resolvesAfter).toLocaleString()} />

          <VadCard variant="muted" style={{ gap: 4 }}>
            <VadText variant="bodyStrong" tone="yes">Automatic resolution configuration</VadText>
            <VadText variant="caption" tone="secondary">VAD selects the configured policy and resolver. Deterministic markets use approved providers; unresolved cases move to oracle review.</VadText>
          </VadCard>

          {error ? <VadErrorState title="Market not created" message={error} /> : null}
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <VadButton label="Back" variant="secondary" disabled={working} onPress={() => { setError(null); setStep(2); }} style={{ flex: 1 }} />
            <VadButton label="Create market draft" loading={working} disabled={!scheduleValid || working} onPress={() => void createMarket()} style={{ flex: 1.5 }} />
          </View>
        </VadCard>
      ) : null}
    </View>
  );
}

function CreateStepRail({ step }: { step: CreateStep }) {
  const theme = useVadTheme();
  const labels = ['Market', 'Setup', 'Review'];
  return (
    <VadCard variant="muted" style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {labels.map((label, index) => {
          const number = (index + 1) as CreateStep;
          const complete = number < step;
          const active = number === step;
          return (
            <View key={label} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: active ? 26 : 20, height: active ? 26 : 20, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: complete ? theme.colors.yesSoft : active ? theme.colors.brandSoft : theme.colors.surface, borderWidth: 1, borderColor: complete ? theme.colors.yes : active ? theme.colors.brandPrimary : theme.colors.border }}>
                <VadText variant="caption" tone={complete ? 'yes' : active ? 'brand' : 'tertiary'}>{number}</VadText>
              </View>
              {index < labels.length - 1 ? <View style={{ height: 1, flex: 1, backgroundColor: number < step ? theme.colors.yes : theme.colors.border, marginHorizontal: 6 }} /> : null}
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {labels.map((label, index) => (
          <VadText key={label} variant="caption" tone={index + 1 === step ? 'brand' : index + 1 < step ? 'yes' : 'tertiary'} style={{ flex: 1 }}>{label}</VadText>
        ))}
      </View>
    </VadCard>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  const theme = useVadTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingBottom: theme.spacing.sm }}>
      <VadText variant="caption" tone="tertiary" style={{ flex: 0.65 }}>{label}</VadText>
      <VadText variant="bodyStrong" style={{ flex: 1.35, textAlign: 'right' }}>{value}</VadText>
    </View>
  );
}
