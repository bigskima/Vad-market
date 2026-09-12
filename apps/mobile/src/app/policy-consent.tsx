import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
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
import {
  parseInlinePolicyText,
  parsePolicySections,
  type PolicyBlock,
} from '@/features/policy/policy-format';
import { useProductDensity } from '@/hooks/use-product-density';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function PolicyConsentRoute() {
  const theme = useVadTheme();
  const density = useProductDensity();
  const { isLoading, session, signOut } = useAuth();
  const userId = session?.user.id ?? null;
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [selectedKey, setSelectedKey] = useState<LegalDocumentKey>('TERMS');
  const [agreedKeys, setAgreedKeys] = useState<LegalDocumentKey[]>([]);
  const [readKeys, setReadKeys] = useState<LegalDocumentKey[]>([]);
  const [sectionByKey, setSectionByKey] = useState<Partial<Record<LegalDocumentKey, number>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const state = await getPolicyGateState(userId);
      if (!state.requiresAcceptance) {
        router.replace('/home');
        return;
      }

      setDocuments(state.documents);
      setReadKeys(state.documents.filter((document) => document.accepted).map((document) => document.key));
      const firstRequired = state.requiredDocuments[0];
      if (firstRequired) setSelectedKey(firstRequired.key);
    } catch (loadError) {
      setError(loadError instanceof Error
        ? loadError.message
        : 'We could not load the policies for your account. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const required = useMemo(
    () => documents.filter((document) => document.requiredAcceptance && !document.accepted),
    [documents],
  );
  const selected = documents.find((document) => document.key === selectedKey) ?? documents[0];
  const sections = useMemo(
    () => parsePolicySections(selected?.content ?? '', selected?.summary ?? ''),
    [selected?.content, selected?.summary],
  );
  const sectionIndex = Math.min(sectionByKey[selectedKey] ?? 0, Math.max(0, sections.length - 1));
  const currentSection = sections[sectionIndex];
  const selectedRead = Boolean(selected?.accepted || readKeys.includes(selectedKey));
  const selectedAgreed = Boolean(selected?.accepted || agreedKeys.includes(selectedKey));
  const ready = required.length > 0 && required.every((document) => agreedKeys.includes(document.key));
  const completedAgreementCount = required.filter((document) => agreedKeys.includes(document.key)).length;

  async function agreeAndContinue() {
    if (!userId || !ready) return;
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

  function setSection(index: number) {
    setSectionByKey((current) => ({ ...current, [selectedKey]: index }));
  }

  function finishReading() {
    setReadKeys((current) => current.includes(selectedKey) ? current : [...current, selectedKey]);
  }

  function toggleAgreement(key: LegalDocumentKey) {
    if (!readKeys.includes(key)) return;
    setAgreedKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  function moveToNextRequired() {
    const next = required.find((document) => !agreedKeys.includes(document.key));
    if (next) setSelectedKey(next.key);
  }

  if (!isLoading && !session) return <Redirect href="/" />;

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
          <VadText variant="bodyStrong">A quick review before you enter</VadText>
          <VadText variant="caption" tone="secondary">Read each required policy, then confirm your agreement</VadText>
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          width: '100%',
          maxWidth: 980,
          alignSelf: 'center',
          padding: density.horizontalPadding,
          paddingBottom: theme.spacing.xxxl,
          gap: density.sectionGap,
        }}
      >
        <View style={{ gap: theme.spacing.sm, paddingTop: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <VadText variant="caption" tone="brand">YOUR VAD AGREEMENT</VadText>
            {!loading && required.length ? (
              <View style={{ borderRadius: theme.radius.pill, backgroundColor: theme.colors.brandSoft, paddingHorizontal: theme.spacing.sm, paddingVertical: 4 }}>
                <VadText variant="caption" tone="brand">{completedAgreementCount}/{required.length} agreed</VadText>
              </View>
            ) : null}
          </View>
          <VadText variant={density.phone ? 'title' : 'display'}>Know what you are agreeing to.</VadText>
          <VadText tone="secondary" style={{ maxWidth: 720 }}>
            We guide you through one part at a time. Headings, subheadings, bold emphasis and bullets are exactly as VAD administrators published them.
          </VadText>
        </View>

        {error ? <VadErrorState title="Policies could not be confirmed" message={error} onRetry={() => void load()} /> : null}

        {loading ? (
          <View style={{ gap: theme.spacing.md }}>
            <View style={{ flexDirection: density.desktop ? 'row' : 'column', gap: theme.spacing.sm }}>
              <VadSkeleton height={84} radius={theme.radius.xl} />
              <VadSkeleton height={84} radius={theme.radius.xl} />
            </View>
            <VadSkeleton height={320} radius={theme.radius.xl} />
          </View>
        ) : documents.length && selected ? (
          <>
            <View style={{ gap: theme.spacing.xs }}>
              <VadText variant="caption" tone="tertiary">REQUIRED DOCUMENTS</VadText>
              <View style={{ flexDirection: density.phone ? 'column' : 'row', gap: theme.spacing.sm }}>
                {documents.map((document, index) => (
                  <DocumentStep
                    key={`${document.key}-${document.policyVersionId ?? document.version}`}
                    document={document}
                    number={index + 1}
                    selected={document.key === selected.key}
                    read={document.accepted || readKeys.includes(document.key)}
                    agreed={document.accepted || agreedKeys.includes(document.key)}
                    onPress={() => setSelectedKey(document.key)}
                  />
                ))}
              </View>
            </View>

            <VadCard variant="raised" style={{ padding: density.phone ? theme.spacing.lg : theme.spacing.xl, gap: theme.spacing.lg }}>
              <View style={{ gap: theme.spacing.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md, alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <VadText variant="caption" tone="brand">{selected.title.toUpperCase()}</VadText>
                    <VadText variant="title">{selected.summary}</VadText>
                  </View>
                  <View style={{ minWidth: 72, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceMuted, paddingHorizontal: theme.spacing.sm, paddingVertical: 6, alignItems: 'center' }}>
                    <VadText variant="caption" tone="secondary">v{selected.version}</VadText>
                  </View>
                </View>

                <View style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
                    <VadText variant="caption" tone="secondary">Part {sectionIndex + 1} of {sections.length}</VadText>
                    <VadText variant="caption" tone={selectedRead ? 'yes' : 'brand'}>
                      {selectedRead ? 'READ COMPLETE' : `${Math.round(((sectionIndex + 1) / sections.length) * 100)}%`}
                    </VadText>
                  </View>
                  <View style={{ height: 7, borderRadius: theme.radius.pill, overflow: 'hidden', backgroundColor: theme.colors.surfaceMuted }}>
                    <View
                      style={{
                        width: `${selectedRead ? 100 : ((sectionIndex + 1) / sections.length) * 100}%`,
                        height: '100%',
                        backgroundColor: selectedRead ? theme.colors.yes : theme.colors.brandPrimary,
                      }}
                    />
                  </View>
                </View>
              </View>

              <View style={{ height: 1, backgroundColor: theme.colors.border }} />

              {currentSection ? (
                <View style={{ gap: theme.spacing.md, minHeight: density.phone ? 240 : 300 }}>
                  <VadText variant={density.phone ? 'heading' : 'title'}>{currentSection.title}</VadText>
                  <PolicySectionContent blocks={currentSection.blocks} />
                </View>
              ) : null}

              {!selectedRead ? (
                <View style={{ flexDirection: density.phone ? 'column' : 'row', gap: theme.spacing.sm }}>
                  <VadButton label="Previous" variant="secondary" disabled={sectionIndex === 0} onPress={() => setSection(Math.max(0, sectionIndex - 1))} />
                  {sectionIndex < sections.length - 1 ? (
                    <VadButton label="Next part" onPress={() => setSection(Math.min(sections.length - 1, sectionIndex + 1))} />
                  ) : (
                    <VadButton label="Finish reading" onPress={finishReading} />
                  )}
                </View>
              ) : (
                <View style={{ gap: theme.spacing.sm }}>
                  <View style={{ borderRadius: theme.radius.lg, backgroundColor: theme.colors.yesSoft, padding: theme.spacing.md, flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: theme.colors.yes, alignItems: 'center', justifyContent: 'center' }}>
                      <VadText variant="label" tone="inverse">✓</VadText>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <VadText variant="bodyStrong" tone="yes">You reached the end of this document</VadText>
                      <VadText variant="caption" tone="secondary">Now confirm whether you agree to this version.</VadText>
                    </View>
                  </View>

                  {selected.requiredAcceptance && !selected.accepted ? (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selectedAgreed }}
                      onPress={() => toggleAgreement(selected.key)}
                      style={({ pressed }) => ({
                        minHeight: 72,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: theme.spacing.md,
                        borderRadius: theme.radius.xl,
                        borderWidth: 2,
                        borderColor: selectedAgreed ? theme.colors.brandPrimary : theme.colors.borderStrong,
                        backgroundColor: selectedAgreed ? theme.colors.brandSoft : theme.colors.surface,
                        padding: theme.spacing.md,
                        opacity: pressed ? 0.76 : 1,
                      })}
                    >
                      <View style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: selectedAgreed ? theme.colors.brandPrimary : theme.colors.surfaceRaised, borderWidth: 1, borderColor: selectedAgreed ? theme.colors.brandPrimary : theme.colors.borderStrong }}>
                        {selectedAgreed ? <VadText variant="label" tone="inverse">✓</VadText> : null}
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <VadText variant="bodyStrong">I agree to {selected.title}</VadText>
                        <VadText variant="caption" tone="secondary">I have read this version and agree to it as part of using VAD.</VadText>
                      </View>
                    </Pressable>
                  ) : selected.accepted ? (
                    <VadText variant="caption" tone="yes">You already agreed to this version.</VadText>
                  ) : null}

                  {selectedAgreed && !ready ? <VadButton label="Continue to the next policy" variant="secondary" onPress={moveToNextRequired} /> : null}
                </View>
              )}
            </VadCard>

            <VadCard variant={ready ? 'brand' : 'muted'} style={{ gap: theme.spacing.md }}>
              <View style={{ gap: 4 }}>
                <VadText variant="bodyStrong">Agreement checklist</VadText>
                <VadText variant="caption" tone="secondary">
                  {ready
                    ? 'All required documents are confirmed. You can now continue into VAD.'
                    : 'Read and agree to each required document separately. The final Continue button remains locked until all are complete.'}
                </VadText>
              </View>

              <View style={{ gap: theme.spacing.xs }}>
                {required.map((document) => {
                  const agreed = agreedKeys.includes(document.key);
                  const read = readKeys.includes(document.key);
                  return (
                    <Pressable
                      key={`check-${document.key}`}
                      accessibilityRole="button"
                      onPress={() => setSelectedKey(document.key)}
                      style={({ pressed }) => ({ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, paddingHorizontal: theme.spacing.md, opacity: pressed ? 0.76 : 1 })}
                    >
                      <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: agreed ? theme.colors.yes : read ? theme.colors.brandSoft : theme.colors.surfaceMuted }}>
                        <VadText variant="caption" tone={agreed ? 'inverse' : read ? 'brand' : 'secondary'}>{agreed ? '✓' : read ? '•' : '—'}</VadText>
                      </View>
                      <VadText variant="bodyStrong" style={{ flex: 1 }}>{document.title}</VadText>
                      <VadText variant="caption" tone={agreed ? 'yes' : read ? 'brand' : 'tertiary'}>{agreed ? 'AGREED' : read ? 'READY TO AGREE' : 'READ NEXT'}</VadText>
                    </Pressable>
                  );
                })}
              </View>

              <VadButton label="Agree and continue to VAD" disabled={!ready || Boolean(error)} loading={saving} onPress={() => void agreeAndContinue()} />
              <VadButton label="I don't agree — sign me out" variant="ghost" onPress={() => void decline()} />
            </VadCard>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function DocumentStep({
  document,
  number,
  selected,
  read,
  agreed,
  onPress,
}: {
  document: LegalDocument;
  number: number;
  selected: boolean;
  read: boolean;
  agreed: boolean;
  onPress: () => void;
}) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 82,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
        borderRadius: theme.radius.xl,
        backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
        padding: theme.spacing.md,
        opacity: pressed ? 0.76 : 1,
      })}
    >
      <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: agreed ? theme.colors.yes : selected ? theme.colors.brandPrimary : theme.colors.surfaceMuted }}>
        <VadText variant="label" tone={agreed || selected ? 'inverse' : 'secondary'}>{agreed ? '✓' : number}</VadText>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <VadText variant="bodyStrong">{document.title}</VadText>
        <VadText variant="caption" tone={agreed ? 'yes' : read ? 'brand' : 'secondary'}>
          {document.accepted ? 'Already agreed' : agreed ? 'Agreement confirmed' : read ? 'Read — agreement needed' : 'Read in short parts'}
        </VadText>
      </View>
    </Pressable>
  );
}

function PolicySectionContent({ blocks }: { blocks: PolicyBlock[] }) {
  const theme = useVadTheme();
  if (!blocks.length) return <VadText tone="secondary">There is no additional text in this section.</VadText>;

  return (
    <View style={{ gap: theme.spacing.md }}>
      {blocks.map((block, index) => {
        if (block.kind === 'subheading') {
          return <RichPolicyLine key={`${block.kind}-${index}`} text={block.text} strong />;
        }
        if (block.kind === 'bullet') {
          return (
            <View key={`${block.kind}-${index}`} style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, marginTop: 8, backgroundColor: theme.colors.brandPrimary }} />
              <RichPolicyLine text={block.text} style={{ flex: 1, lineHeight: 24 }} />
            </View>
          );
        }
        return <RichPolicyLine key={`${block.kind}-${index}`} text={block.text} style={{ lineHeight: 24 }} />;
      })}
    </View>
  );
}

function RichPolicyLine({ text, strong = false, style }: { text: string; strong?: boolean; style?: object }) {
  const segments = parseInlinePolicyText(text);
  return (
    <VadText variant={strong ? 'bodyStrong' : undefined} tone={strong ? 'primary' : 'secondary'} style={style}>
      {segments.map((segment, index) => segment.bold ? (
        <Text key={`${index}-${segment.text}`} style={{ fontWeight: '700' }}>{segment.text}</Text>
      ) : segment.text)}
    </VadText>
  );
}
