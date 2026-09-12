import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VadLogo } from '@/components/brand/vad-logo';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import {
  acceptLegalPolicies,
  getPolicyGateState,
  type LegalDocument,
  type LegalDocumentKey,
} from '@/features/policy/legal-policy-service';
import { useProductDensity } from '@/hooks/use-product-density';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function PolicyConsentRoute() {
  const theme = useVadTheme();
  const density = useProductDensity();
  const { session, signOut } = useAuth();
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [selectedKey, setSelectedKey] = useState<LegalDocumentKey>('TERMS');
  const [agreedKeys, setAgreedKeys] = useState<LegalDocumentKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    setLoading(true);
    setError(null);
    try {
      const state = await getPolicyGateState(session.user.id);
      if (!state.requiresAcceptance) {
        router.replace('/home');
        return;
      }
      setDocuments(state.documents);
      const firstRequired = state.requiredDocuments[0];
      if (firstRequired) setSelectedKey(firstRequired.key);
    } catch (loadError) {
      setError(loadError instanceof Error
        ? loadError.message
        : 'We could not load the policies for your account. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [session?.user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const required = useMemo(
    () => documents.filter((document) => document.requiredAcceptance && !document.accepted),
    [documents],
  );
  const selected = documents.find((document) => document.key === selectedKey) ?? documents[0];
  const ready = required.length > 0
    && required.every((document) => agreedKeys.includes(document.key));

  async function agreeAndContinue() {
    if (!session?.user.id || !ready) return;
    setSaving(true);
    setError(null);
    try {
      await acceptLegalPolicies(required);
      router.replace('/home');
    } catch (saveError) {
      setError(saveError instanceof Error
        ? saveError.message
        : 'We could not save your agreement. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function decline() {
    await signOut();
    router.replace('/');
  }

  function toggleAgreement(key: LegalDocumentKey) {
    setAgreedKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top', 'bottom']}>
      <View
        style={{
          minHeight: 58,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          paddingHorizontal: density.horizontalPadding,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}
      >
        <VadLogo size={34} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <VadText variant="bodyStrong">Before you continue</VadText>
          <VadText variant="caption" tone="secondary">Review and agree to the current VAD policies</VadText>
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          width: '100%',
          maxWidth: 1080,
          alignSelf: 'center',
          padding: density.horizontalPadding,
          paddingBottom: theme.spacing.xxxl,
          gap: density.sectionGap,
        }}
      >
        <View style={{ gap: 6, paddingTop: theme.spacing.md }}>
          <VadText variant="caption" tone="brand">REVIEW REQUIRED</VadText>
          <VadText variant={density.phone ? 'title' : 'display'}>Know the rules before using VAD</VadText>
          <VadText tone="secondary" style={{ maxWidth: 760 }}>
            Please read each required document. You must agree before entering VAD. If you do not agree, you can leave without continuing to the app.
          </VadText>
        </View>

        {error ? (
          <VadErrorState
            title="Policies could not be confirmed"
            message={error}
            onRetry={() => void load()}
          />
        ) : null}

        {loading ? (
          <View style={{ flexDirection: density.desktop ? 'row' : 'column', gap: theme.spacing.lg }}>
            <View style={{ width: density.desktop ? 300 : '100%', gap: theme.spacing.sm }}>
              <VadSkeleton height={110} radius={theme.radius.xl} />
              <VadSkeleton height={110} radius={theme.radius.xl} />
            </View>
            <View style={{ flex: 1, gap: theme.spacing.sm }}>
              <VadSkeleton width="56%" height={28} />
              <VadSkeleton height={360} radius={theme.radius.xl} />
            </View>
          </View>
        ) : documents.length ? (
          <View style={{ flexDirection: density.desktop ? 'row' : 'column', gap: theme.spacing.lg, alignItems: 'flex-start' }}>
            <View style={{ width: density.desktop ? 300 : '100%', gap: theme.spacing.sm }}>
              {documents.map((document) => {
                const agreed = document.accepted || agreedKeys.includes(document.key);
                const needsAgreement = document.requiredAcceptance && !document.accepted;
                return (
                  <View key={`${document.key}-${document.policyVersionId ?? document.version}`} style={{ gap: theme.spacing.xs }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: selected?.key === document.key }}
                      onPress={() => setSelectedKey(document.key)}
                      style={({ pressed }) => ({ opacity: pressed ? 0.76 : 1 })}
                    >
                      <VadCard variant={selected?.key === document.key ? 'brand' : 'raised'} style={{ gap: 4 }}>
                        <VadText variant="bodyStrong">{document.title}</VadText>
                        <VadText variant="caption" tone="secondary" numberOfLines={2}>{document.summary}</VadText>
                        <VadText variant="caption" tone="tertiary">Version {document.version}</VadText>
                      </VadCard>
                    </Pressable>

                    {needsAgreement ? (
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: agreed }}
                        onPress={() => toggleAgreement(document.key)}
                        style={({ pressed }) => ({
                          minHeight: 48,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: theme.spacing.sm,
                          borderRadius: theme.radius.lg,
                          borderWidth: 1,
                          borderColor: agreed ? theme.colors.brandPrimary : theme.colors.border,
                          backgroundColor: agreed ? theme.colors.brandSoft : theme.colors.surface,
                          paddingHorizontal: theme.spacing.md,
                          opacity: pressed ? 0.76 : 1,
                        })}
                      >
                        <View
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 7,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: agreed ? theme.colors.brandPrimary : theme.colors.surfaceRaised,
                            borderWidth: 1,
                            borderColor: agreed ? theme.colors.brandPrimary : theme.colors.borderStrong,
                          }}
                        >
                          {agreed ? <VadText variant="label" tone="inverse">✓</VadText> : null}
                        </View>
                        <VadText variant="caption" style={{ flex: 1 }}>I have read and agree to this document</VadText>
                      </Pressable>
                    ) : document.accepted ? (
                      <VadText variant="caption" tone="yes">Already agreed to this version</VadText>
                    ) : null}
                  </View>
                );
              })}
            </View>

            {selected ? (
              <VadCard
                variant="raised"
                style={{
                  flex: 1,
                  width: density.desktop ? undefined : '100%',
                  minHeight: density.desktop ? 620 : undefined,
                  padding: density.phone ? theme.spacing.lg : theme.spacing.xl,
                  gap: theme.spacing.lg,
                }}
              >
                <View style={{ gap: 5 }}>
                  <VadText variant="caption" tone="brand">EFFECTIVE {selected.effectiveDate}</VadText>
                  <VadText variant="title">{selected.title}</VadText>
                  <VadText tone="secondary">{selected.summary}</VadText>
                </View>
                <View style={{ height: 1, backgroundColor: theme.colors.border }} />
                <VadText style={{ lineHeight: density.phone ? 24 : 26 }}>{selected.content}</VadText>
              </VadCard>
            ) : null}
          </View>
        ) : null}

        {!loading && documents.length ? (
          <VadCard variant="brand" style={{ gap: theme.spacing.md }}>
            <VadText variant="bodyStrong">
              {ready
                ? 'You are ready to continue.'
                : `Agree to ${required.length - agreedKeys.filter((key) => required.some((document) => document.key === key)).length} required document(s) to continue.`}
            </VadText>
            <View style={{ flexDirection: density.phone ? 'column' : 'row', gap: theme.spacing.sm }}>
              <VadButton
                label="I agree — continue to VAD"
                disabled={!ready || Boolean(error)}
                loading={saving}
                onPress={() => void agreeAndContinue()}
              />
              <VadButton label="I don't agree" variant="ghost" onPress={() => void decline()} />
            </View>
          </VadCard>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
