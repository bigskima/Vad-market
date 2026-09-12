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
    return () => {
      ignore = true;
    };
  }, []);

  const resolvedCountryCode = countryCode || (options?.jurisdictions.length === 1 ? options.jurisdictions[0].countryCode : '');
  const jurisdiction = useMemo(
    () => options?.jurisdictions.find((item) => item.countryCode === resolvedCountryCode) ?? null,
    [options, resolvedCountryCode],
  );
  const resolvedAssetCode = assetCode || (jurisdiction?.assets.includes('TNGN') ? 'TNGN' : jurisdiction?.assets[0] ?? '');
  const sandbox = resolvedAssetCode === 'TNGN';

  async function createMarket() {
    if (working) return;
    setError(null);
    setCreated(null);
    if (!title.trim()) {
      setError('Enter the market question.');
      return;
    }
    if (!resolvedCountryCode || !resolvedAssetCode) {
      setError('Choose a market currency.');
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

  if (loading) {
    return <View style={{ gap: theme.spacing.md }}><VadSkeleton width="50%" height={32} /><VadSkeleton height={110} /><VadSkeleton height={260} /></View>;
  }

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: 4 }}>
        <VadText variant="label" tone="brand">VAD MARKETS</VadText>
        <VadText variant="title">Create a VAD market.</VadText>
        <VadText tone="secondary">
          Enter the market itself. VAD handles the technical template, oracle policy and resolution configuration automatically.
        </VadText>
      </View>

      <VadCard variant="brand" style={{ gap: 4 }}>
        <VadText variant="bodyStrong" tone="brand">Tester launch is ready</VadText>
        <VadText variant="caption" tone="secondary">
          Test NGN is selected by default when available. It is synthetic money with no cash value, so testers can trade without using real NGN.
        </VadText>
      </VadCard>

      {created ? (
        <VadCard variant="raised" style={{ gap: theme.spacing.md, borderColor: theme.colors.yes }}>
          <VadText variant="heading" tone="yes">Market created successfully.</VadText>
          <VadText variant="caption" tone="secondary">
            VAD configured the resolution path automatically. The market is now a controlled draft; publish it when you are ready for testers to see it.
          </VadText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <VadChip label={String(created.asset_code ?? resolvedAssetCode)} tone={sandbox ? 'brand' : 'neutral'} />
            <VadChip label={String(created.resolution_mode ?? 'VAD AUTO').replaceAll('_', ' ')} tone="yes" />
          </View>
          <VadButton label="Open Market Publishing" onPress={() => router.push('/admin/market-publishing')} />
          <VadButton
            label="Create another market"
            variant="secondary"
            onPress={() => {
              setCreated(null);
              setTitle('');
              setDescription('');
              setOpensAt('');
              setClosesAt('');
              setResolvesAfter('');
            }}
          />
        </VadCard>
      ) : (
        <VadCard variant="raised" style={{ gap: theme.spacing.lg }}>
          <VadInput
            label="Market question"
            value={title}
            onChangeText={(value) => {
              setTitle(value);
              setError(null);
            }}
            multiline
            placeholder="Will … happen before …?"
            hint="Write one clear YES/NO question."
          />
          <VadInput
            label="Short context · optional"
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="Add any useful context for traders."
          />

          <View style={{ gap: 8 }}>
            <VadText variant="label">Category</VadText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {CATEGORIES.map((item) => (
                <VadChip key={item} label={item} selected={category === item} tone={category === item ? 'brand' : 'neutral'} onPress={() => setCategory(item)} />
              ))}
            </View>
          </View>

          {options && options.jurisdictions.length > 1 ? (
            <View style={{ gap: 8 }}>
              <VadText variant="label">Jurisdiction</VadText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {options.jurisdictions.map((item) => <VadChip key={item.countryCode} label={item.name} selected={resolvedCountryCode === item.countryCode} onPress={() => { setCountryCode(item.countryCode); setAssetCode(''); }} />)}
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
              <VadText variant="caption" tone={sandbox ? 'brand' : 'warning'}>
                {sandbox ? 'Recommended for testing · every current tester has ₦T100,000 · cannot be deposited or withdrawn.' : 'This is a real-money currency. Use Test NGN while validating the market flow.'}
              </VadText>
            </View>
          ) : null}

          <VadDateTimeField label="Opens" value={opensAt} onChange={setOpensAt} hint="When testers can begin trading." />
          <VadDateTimeField label="Closes" value={closesAt} onChange={setClosesAt} minDate={opensAt || undefined} hint="Trading stops at this time." />
          <VadDateTimeField label="Resolve after" value={resolvesAfter} onChange={setResolvesAfter} minDate={closesAt || opensAt || undefined} hint="VAD starts automatic resolution or controlled oracle review from this time." />

          <VadCard variant="muted" style={{ gap: 4 }}>
            <VadText variant="bodyStrong" tone="yes">Automatic resolution configuration</VadText>
            <VadText variant="caption" tone="secondary">
              VAD selects the correct policy and resolver. Supported deterministic markets use configured oracle providers; anything that cannot be safely automated is sent to the oracle review queue.
            </VadText>
          </VadCard>

          {error ? <VadErrorState title="Market not created" message={error} /> : null}
          <VadButton label="Create market draft" loading={working} onPress={() => void createMarket()} />
        </VadCard>
      )}
    </View>
  );
}
