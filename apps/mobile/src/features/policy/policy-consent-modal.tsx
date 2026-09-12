import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadText } from '@/components/ui/vad-text';
import {
  acceptLegalPolicies,
  type LegalDocument,
  type LegalDocumentKey,
} from '@/features/policy/legal-policy-service';
import {
  parseInlinePolicyText,
  parsePolicySections,
  type PolicyBlock,
} from '@/features/policy/policy-format';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

type PolicyPage = {
  title: string;
  blocks: PolicyBlock[];
};

export function PolicyConsentModal({
  documents,
  onAccepted,
}: {
  documents: LegalDocument[];
  onAccepted: () => Promise<void> | void;
}) {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const { signOut } = useAuth();
  const [selectedKey, setSelectedKey] = useState<LegalDocumentKey>(documents[0]?.key ?? 'TERMS');
  const [pageByKey, setPageByKey] = useState<Partial<Record<LegalDocumentKey, number>>>({});
  const [readKeys, setReadKeys] = useState<LegalDocumentKey[]>([]);
  const [agreedKeys, setAgreedKeys] = useState<LegalDocumentKey[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = width >= 768;
  const compact = width < 380;

  const activeKey = documents.some((document) => document.key === selectedKey)
    ? selectedKey
    : documents[0]?.key ?? selectedKey;
  const selected = documents.find((document) => document.key === activeKey) ?? documents[0];
  const pages = useMemo(() => buildPolicyPages(selected), [selected]);
  const pageIndex = Math.min(pageByKey[activeKey] ?? 0, Math.max(0, pages.length - 1));
  const page = pages[pageIndex];
  const selectedRead = readKeys.includes(activeKey);
  const selectedAgreed = agreedKeys.includes(activeKey);
  const ready = documents.length > 0 && documents.every((document) => agreedKeys.includes(document.key));
  const completed = documents.filter((document) => agreedKeys.includes(document.key)).length;

  function setPage(index: number) {
    setPageByKey((current) => ({ ...current, [activeKey]: index }));
    setError(null);
  }

  function finishReading() {
    setReadKeys((current) => current.includes(activeKey) ? current : [...current, activeKey]);
  }

  function toggleAgreement() {
    if (!selectedRead) return;
    setAgreedKeys((current) => current.includes(activeKey)
      ? current.filter((key) => key !== activeKey)
      : [...current, activeKey]);
  }

  function nextPolicy() {
    const next = documents.find((document) => !agreedKeys.includes(document.key) && document.key !== activeKey)
      ?? documents.find((document) => !agreedKeys.includes(document.key));
    if (next) setSelectedKey(next.key);
  }

  async function acceptAndContinue() {
    if (!ready || saving) return;
    setSaving(true);
    setError(null);
    try {
      await acceptLegalPolicies(documents);
      await onAccepted();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'We could not save your agreement. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function decline() {
    if (saving) return;
    setSaving(true);
    try {
      await signOut();
    } finally {
      setSaving(false);
    }
  }

  if (!selected) return null;

  return (
    <View
      accessibilityViewIsModal
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 1000,
        elevation: 1000,
        justifyContent: dialog ? 'center' : 'flex-end',
        alignItems: dialog ? 'center' : 'stretch',
        backgroundColor: theme.colors.overlay,
        padding: dialog ? theme.spacing.xl : 0,
      }}
    >
      <View
        style={[
          dialog ? theme.shadows.floating : theme.shadows.card,
          {
            width: '100%',
            maxWidth: dialog ? 700 : undefined,
            maxHeight: dialog ? '88%' : '92%',
            minHeight: dialog ? 360 : 320,
            backgroundColor: theme.colors.surface,
            borderRadius: dialog ? theme.radius.xxl : 0,
            borderTopLeftRadius: theme.radius.xxl,
            borderTopRightRadius: theme.radius.xxl,
            borderWidth: 1,
            borderColor: theme.colors.border,
            overflow: 'hidden',
          },
        ]}
      >
        {!dialog ? (
          <View style={{ alignItems: 'center', paddingTop: theme.spacing.xs }}>
            <View
              style={{
                width: 44,
                height: 4,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.borderStrong,
              }}
            />
          </View>
        ) : null}

        <View
          style={{
            minHeight: 64,
            justifyContent: 'center',
            paddingHorizontal: compact ? theme.spacing.md : theme.spacing.lg,
            paddingVertical: theme.spacing.sm,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          <VadText variant="heading">A quick review before you continue</VadText>
          <VadText variant="caption" tone="secondary">
            Read each required policy, then confirm your agreement.
          </VadText>
        </View>

        <ScrollView
          style={{ flexShrink: 1 }}
          contentContainerStyle={{
            paddingHorizontal: compact ? theme.spacing.md : theme.spacing.lg,
            paddingTop: theme.spacing.md,
            paddingBottom: theme.spacing.xl,
            gap: theme.spacing.md,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'center' }}>
              <VadText variant="caption" tone="brand">YOUR VAD AGREEMENT</VadText>
              <VadText variant="caption" tone="secondary">{completed}/{documents.length} agreed</VadText>
            </View>
            <VadText variant="bodyStrong">Read one short part at a time.</VadText>
            <VadText variant="caption" tone="secondary">VAD keeps the process short and progressive. You must agree to every required document before entering the app.</VadText>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {documents.map((document, index) => {
              const agreed = agreedKeys.includes(document.key);
              const selectedDocument = document.key === activeKey;
              return (
                <Pressable
                  key={`${document.key}-${document.policyVersionId ?? document.version}`}
                  accessibilityRole="button"
                  onPress={() => setSelectedKey(document.key)}
                  style={({ pressed }) => ({
                    minHeight: 42,
                    flexGrow: 1,
                    minWidth: 150,
                    borderRadius: theme.radius.lg,
                    borderWidth: 1,
                    borderColor: selectedDocument ? theme.colors.brandPrimary : theme.colors.border,
                    backgroundColor: selectedDocument ? theme.colors.brandSoft : theme.colors.surfaceRaised,
                    paddingHorizontal: theme.spacing.sm,
                    paddingVertical: 8,
                    opacity: pressed ? 0.72 : 1,
                  })}
                >
                  <VadText variant="caption" tone={agreed ? 'yes' : selectedDocument ? 'brand' : 'secondary'}>
                    {agreed ? '✓' : index + 1} · {document.title}
                  </VadText>
                </Pressable>
              );
            })}
          </View>

          <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.xl, backgroundColor: theme.colors.surfaceRaised, padding: theme.spacing.md, gap: theme.spacing.md }}>
            <View style={{ gap: 5 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
                <VadText variant="caption" tone="brand">{selected.title.toUpperCase()}</VadText>
                <VadText variant="caption" tone="tertiary">v{selected.version}</VadText>
              </View>
              <VadText variant="heading">{page?.title ?? selected.summary}</VadText>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
                <VadText variant="caption" tone="secondary">Part {pageIndex + 1} of {Math.max(pages.length, 1)}</VadText>
                <VadText variant="caption" tone={selectedRead ? 'yes' : 'brand'}>{selectedRead ? 'READ' : `${Math.round(((pageIndex + 1) / Math.max(pages.length, 1)) * 100)}%`}</VadText>
              </View>
              <View style={{ height: 6, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceMuted, overflow: 'hidden' }}>
                <View style={{ width: `${selectedRead ? 100 : ((pageIndex + 1) / Math.max(pages.length, 1)) * 100}%`, height: '100%', backgroundColor: selectedRead ? theme.colors.yes : theme.colors.brandPrimary }} />
              </View>
            </View>

            <View style={{ gap: theme.spacing.sm }}>
              {(page?.blocks ?? []).map((block, index) => <PolicyBlockView key={`${block.kind}-${index}`} block={block} />)}
              {!page?.blocks.length ? <VadText tone="secondary">{selected.summary}</VadText> : null}
            </View>

            {!selectedRead ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <VadButton label="Previous" variant="secondary" disabled={pageIndex === 0} fullWidth={false} onPress={() => setPage(Math.max(0, pageIndex - 1))} />
                {pageIndex < pages.length - 1
                  ? <VadButton label="Next part" fullWidth={false} onPress={() => setPage(pageIndex + 1)} />
                  : <VadButton label="I have read this" fullWidth={false} onPress={finishReading} />}
              </View>
            ) : (
              <View style={{ gap: theme.spacing.sm }}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selectedAgreed }}
                  onPress={toggleAgreement}
                  style={({ pressed }) => ({
                    minHeight: 60,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing.sm,
                    borderRadius: theme.radius.lg,
                    borderWidth: 1,
                    borderColor: selectedAgreed ? theme.colors.brandPrimary : theme.colors.borderStrong,
                    backgroundColor: selectedAgreed ? theme.colors.brandSoft : theme.colors.surface,
                    padding: theme.spacing.sm,
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <View style={{ width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: selectedAgreed ? theme.colors.brandPrimary : theme.colors.surfaceMuted }}>
                    {selectedAgreed ? <VadText variant="caption" tone="inverse">✓</VadText> : null}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <VadText variant="bodyStrong">I agree to {selected.title}</VadText>
                    <VadText variant="caption" tone="secondary">I have read this version and agree to it.</VadText>
                  </View>
                </Pressable>
                {selectedAgreed && !ready ? <VadButton label="Next required policy" variant="secondary" onPress={nextPolicy} /> : null}
              </View>
            )}
          </View>

          {error ? <VadErrorState title="Agreement could not be saved" message={error} /> : null}

          <View style={{ gap: 8 }}>
            <VadButton label="Agree and enter VAD" disabled={!ready} loading={saving && ready} onPress={() => void acceptAndContinue()} />
            <VadButton label="I do not agree" variant="ghost" disabled={saving} onPress={() => void decline()} />
            <VadText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>If you do not agree to the required policies, VAD will sign you out.</VadText>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function buildPolicyPages(document?: LegalDocument): PolicyPage[] {
  if (!document) return [];
  const sections = parsePolicySections(document.content, document.summary);
  const pages: PolicyPage[] = [];
  sections.forEach((section) => {
    const blocks = section.blocks.length ? section.blocks : [{ kind: 'paragraph' as const, text: document.summary }];
    for (let index = 0; index < blocks.length; index += 3) {
      pages.push({ title: index === 0 ? section.title : `${section.title} · continued`, blocks: blocks.slice(index, index + 3) });
    }
  });
  return pages.length ? pages : [{ title: 'Overview', blocks: [{ kind: 'paragraph', text: document.summary }] }];
}

function PolicyBlockView({ block }: { block: PolicyBlock }) {
  if (block.kind === 'subheading') return <VadText variant="bodyStrong">{block.text}</VadText>;
  const content = <InlinePolicyText text={block.text} />;
  if (block.kind === 'bullet') {
    return <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}><VadText tone="brand">•</VadText><View style={{ flex: 1 }}>{content}</View></View>;
  }
  return <View>{content}</View>;
}

function InlinePolicyText({ text }: { text: string }) {
  const theme = useVadTheme();
  const segments = parseInlinePolicyText(text);
  return (
    <Text style={{ color: theme.colors.textPrimary, fontSize: 15, lineHeight: 22 }}>
      {segments.map((segment, index) => <Text key={`${segment.text}-${index}`} style={{ fontWeight: segment.bold ? '700' : '400' }}>{segment.text}</Text>)}
    </Text>
  );
}
