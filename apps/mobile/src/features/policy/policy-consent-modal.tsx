import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
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
  const { signOut } = useAuth();
  const [selectedKey, setSelectedKey] = useState<LegalDocumentKey>(documents[0]?.key ?? 'TERMS');
  const [pageByKey, setPageByKey] = useState<Partial<Record<LegalDocumentKey, number>>>({});
  const [readKeys, setReadKeys] = useState<LegalDocumentKey[]>([]);
  const [agreedKeys, setAgreedKeys] = useState<LegalDocumentKey[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (documents.length && !documents.some((document) => document.key === selectedKey)) {
      setSelectedKey(documents[0].key);
    }
  }, [documents, selectedKey]);

  const selected = documents.find((document) => document.key === selectedKey) ?? documents[0];
  const pages = useMemo(() => buildPolicyPages(selected), [selected]);
  const pageIndex = Math.min(pageByKey[selectedKey] ?? 0, Math.max(0, pages.length - 1));
  const page = pages[pageIndex];
  const selectedRead = readKeys.includes(selectedKey);
  const selectedAgreed = agreedKeys.includes(selectedKey);
  const ready = documents.length > 0 && documents.every((document) => agreedKeys.includes(document.key));
  const completed = documents.filter((document) => agreedKeys.includes(document.key)).length;

  function setPage(index: number) {
    setPageByKey((current) => ({ ...current, [selectedKey]: index }));
    setError(null);
  }

  function finishReading() {
    setReadKeys((current) => current.includes(selectedKey) ? current : [...current, selectedKey]);
  }

  function toggleAgreement() {
    if (!selectedRead) return;
    setAgreedKeys((current) => current.includes(selectedKey)
      ? current.filter((key) => key !== selectedKey)
      : [...current, selectedKey]);
  }

  function nextPolicy() {
    const next = documents.find((document) => !agreedKeys.includes(document.key) && document.key !== selectedKey)
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
    <VadBottomSheet
      visible
      title="A quick review before you continue"
      dismissible={false}
      onClose={() => undefined}
    >
      <View style={{ gap: theme.spacing.md }}>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, alignItems: 'center' }}>
            <VadText variant="caption" tone="brand">YOUR VAD AGREEMENT</VadText>
            <VadText variant="caption" tone="secondary">{completed}/{documents.length} agreed</VadText>
          </View>
          <VadText variant="bodyStrong">Read one short part at a time.</VadText>
          <VadText variant="caption" tone="secondary">
            VAD will keep your place. You must read and agree to every required document before using the app.
          </VadText>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {documents.map((document, index) => {
            const agreed = agreedKeys.includes(document.key);
            const selectedDocument = document.key === selectedKey;
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
              <VadText variant="caption" tone={selectedRead ? 'yes' : 'brand'}>
                {selectedRead ? 'READ' : `${Math.round(((pageIndex + 1) / Math.max(pages.length, 1)) * 100)}%`}
              </VadText>
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
              {pageIndex < pages.length - 1 ? (
                <VadButton label="Next part" fullWidth={false} onPress={() => setPage(pageIndex + 1)} />
              ) : (
                <VadButton label="I have read this" fullWidth={false} onPress={finishReading} />
              )}
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
          <VadText variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>
            If you do not agree to the required policies, VAD will sign you out.
          </VadText>
        </View>
      </View>
    </VadBottomSheet>
  );
}

function buildPolicyPages(document?: LegalDocument): PolicyPage[] {
  if (!document) return [];
  const sections = parsePolicySections(document.content, document.summary);
  const pages: PolicyPage[] = [];
  sections.forEach((section) => {
    const blocks = section.blocks.length ? section.blocks : [{ kind: 'paragraph' as const, text: document.summary }];
    for (let index = 0; index < blocks.length; index += 3) {
      pages.push({
        title: index === 0 ? section.title : `${section.title} · continued`,
        blocks: blocks.slice(index, index + 3),
      });
    }
  });
  return pages.length ? pages : [{ title: 'Overview', blocks: [{ kind: 'paragraph', text: document.summary }] }];
}

function PolicyBlockView({ block }: { block: PolicyBlock }) {
  const theme = useVadTheme();
  if (block.kind === 'subheading') return <VadText variant="bodyStrong">{block.text}</VadText>;

  const content = <InlinePolicyText text={block.text} />;
  if (block.kind === 'bullet') {
    return (
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <VadText tone="brand">•</VadText>
        <View style={{ flex: 1 }}>{content}</View>
      </View>
    );
  }
  return <View>{content}</View>;
}

function InlinePolicyText({ text }: { text: string }) {
  const theme = useVadTheme();
  const segments = parseInlinePolicyText(text);
  return (
    <Text style={{ color: theme.colors.textPrimary, fontSize: 15, lineHeight: 22 }}>
      {segments.map((segment, index) => (
        <Text key={`${segment.text}-${index}`} style={{ fontWeight: segment.bold ? '700' : '400' }}>
          {segment.text}
        </Text>
      ))}
    </Text>
  );
}
