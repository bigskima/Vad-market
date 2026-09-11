import { useEffect, useMemo, useState } from 'react';
import { Pressable, Switch, TextInput, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadText } from '@/components/ui/vad-text';
import {
  DEFAULT_LEGAL_DOCUMENTS,
  getPolicyWorkspace,
  savePolicyPreviewDraft,
  VAD_POLICY_PUBLISHING_CONNECTED,
  type LegalDocument,
  type LegalDocumentKey,
} from '@/features/policy/legal-policy-service';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';

export function AdminPolicyEditorScreen() {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [documents, setDocuments] = useState<LegalDocument[]>(DEFAULT_LEGAL_DOCUMENTS);
  const [selectedKey, setSelectedKey] = useState<LegalDocumentKey>('TERMS');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    void getPolicyWorkspace().then((items) => {
      if (mounted) setDocuments(items);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const selected = useMemo(
    () => documents.find((document) => document.key === selectedKey) ?? documents[0],
    [documents, selectedKey],
  );

  function updateSelected(patch: Partial<LegalDocument>) {
    setSaved(false);
    setDocuments((current) => current.map((document) =>
      document.key === selected?.key ? { ...document, ...patch } : document,
    ));
  }

  async function saveDraft() {
    setSaving(true);
    try {
      await savePolicyPreviewDraft(documents.map((document) => ({ ...document, status: 'DRAFT' })));
      setDocuments((current) => current.map((document) => ({ ...document, status: 'DRAFT' })));
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (!selected) return null;

  return (
    <View style={{ gap: density.sectionGap }}>
      <View style={{ gap: 5 }}>
        <VadText variant="caption" tone="brand">POLICIES & CONSENT</VadText>
        <VadText variant="title">Write policies like a real document</VadText>
        <VadText tone="secondary" style={{ maxWidth: 820 }}>
          Draft, review and preview the documents users will read before continuing to VAD. The main document editor is intentionally large so policies are written as full notes, not inside a cramped settings field.
        </VadText>
      </View>

      {!VAD_POLICY_PUBLISHING_CONNECTED ? (
        <VadCard variant="brand" style={{ gap: 4 }}>
          <VadText variant="bodyStrong" tone="brand">Publishing is not connected yet</VadText>
          <VadText variant="caption" tone="secondary">
            You can build and review the complete policy experience now. Drafts saved here remain a preview on this device until the VAD policy service is connected; no other project is being used for this data.
          </VadText>
        </VadCard>
      ) : null}

      <View style={{ flexDirection: density.desktop ? 'row' : 'column', alignItems: 'flex-start', gap: theme.spacing.lg }}>
        <View style={{ width: density.desktop ? 250 : '100%', gap: theme.spacing.sm }}>
          {documents.map((document) => (
            <Pressable
              key={document.key}
              accessibilityRole="button"
              accessibilityState={{ selected: document.key === selected.key }}
              onPress={() => setSelectedKey(document.key)}
              style={({ pressed }) => ({ opacity: pressed ? 0.76 : 1 })}
            >
              <VadCard variant={document.key === selected.key ? 'brand' : 'raised'} style={{ gap: 4 }}>
                <VadText variant="bodyStrong">{document.title}</VadText>
                <VadText variant="caption" tone="secondary">{document.summary}</VadText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                  <VadChip label={document.status} tone={document.status === 'PUBLISHED' ? 'yes' : 'neutral'} />
                  {document.requiredAcceptance ? <VadChip label="Agreement required" tone="brand" /> : null}
                </View>
              </VadCard>
            </Pressable>
          ))}

          <VadButton label={saved ? 'Draft saved' : 'Save preview draft'} variant={saved ? 'tonal' : 'secondary'} loading={saving} onPress={() => void saveDraft()} />
          <VadButton
            label="Publish new version"
            disabled={!VAD_POLICY_PUBLISHING_CONNECTED}
            onPress={() => undefined}
          />
          {!VAD_POLICY_PUBLISHING_CONNECTED ? (
            <VadText variant="caption" tone="tertiary">
              Global publishing will be enabled when the VAD policy service is connected.
            </VadText>
          ) : null}
        </View>

        <View style={{ flex: 1, width: density.desktop ? undefined : '100%', gap: theme.spacing.lg }}>
          <VadCard variant="raised" style={{ gap: theme.spacing.md, padding: density.phone ? theme.spacing.lg : theme.spacing.xl }}>
            <VadText variant="heading">Document settings</VadText>
            <Field label="Document title">
              <EditorInput value={selected.title} onChangeText={(value) => updateSelected({ title: value })} />
            </Field>
            <Field label="Short description">
              <EditorInput value={selected.summary} onChangeText={(value) => updateSelected({ summary: value })} multiline minHeight={96} />
            </Field>
            <View style={{ flexDirection: density.phone ? 'column' : 'row', gap: theme.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Field label="Version">
                  <EditorInput value={selected.version} onChangeText={(value) => updateSelected({ version: value })} />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Effective date">
                  <EditorInput value={selected.effectiveDate} onChangeText={(value) => updateSelected({ effectiveDate: value })} />
                </Field>
              </View>
            </View>

            <View
              style={{
                minHeight: 56,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: theme.spacing.md,
                borderTopWidth: 1,
                borderTopColor: theme.colors.border,
                paddingTop: theme.spacing.md,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <VadText variant="bodyStrong">Require user agreement</VadText>
                <VadText variant="caption" tone="secondary">When published, users must agree to this version before continuing.</VadText>
              </View>
              <Switch
                value={selected.requiredAcceptance}
                onValueChange={(value) => updateSelected({ requiredAcceptance: value })}
                trackColor={{ false: theme.colors.surfaceMuted, true: theme.colors.brandSoft }}
                thumbColor={selected.requiredAcceptance ? theme.colors.brandPrimary : theme.colors.textTertiary}
              />
            </View>
          </VadCard>

          <View style={{ flexDirection: density.wide ? 'row' : 'column', gap: theme.spacing.lg, alignItems: 'flex-start' }}>
            <View style={{ flex: 1, width: density.wide ? undefined : '100%', gap: theme.spacing.sm }}>
              <View style={{ gap: 3 }}>
                <VadText variant="heading">Full policy text</VadText>
                <VadText variant="caption" tone="secondary">Write the complete document here. Paragraphs and line breaks are preserved in the user view.</VadText>
              </View>
              <TextInput
                accessibilityLabel="Full policy text"
                value={selected.content}
                onChangeText={(value) => updateSelected({ content: value })}
                multiline
                textAlignVertical="top"
                selectionColor={theme.colors.brandPrimary}
                placeholder="Write the complete policy here…"
                placeholderTextColor={theme.colors.textTertiary}
                style={{
                  minHeight: density.phone ? 460 : 620,
                  borderWidth: 1,
                  borderColor: theme.colors.borderStrong,
                  borderRadius: theme.radius.xl,
                  backgroundColor: theme.colors.surface,
                  color: theme.colors.textPrimary,
                  padding: density.phone ? theme.spacing.md : theme.spacing.lg,
                  fontSize: 15,
                  lineHeight: 24,
                }}
              />
            </View>

            <View style={{ width: density.wide ? 360 : '100%', gap: theme.spacing.sm }}>
              <VadText variant="heading">User preview</VadText>
              <VadCard variant="raised" style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
                <VadText variant="caption" tone="brand">EFFECTIVE {selected.effectiveDate}</VadText>
                <VadText variant="title">{selected.title}</VadText>
                <VadText tone="secondary">{selected.summary}</VadText>
                <View style={{ height: 1, backgroundColor: theme.colors.border }} />
                <VadText style={{ lineHeight: 24 }}>{selected.content}</VadText>
              </VadCard>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useVadTheme();
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <VadText variant="label">{label}</VadText>
      {children}
    </View>
  );
}

function EditorInput({
  value,
  onChangeText,
  multiline = false,
  minHeight = 50,
}: {
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  minHeight?: number;
}) {
  const theme = useVadTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      selectionColor={theme.colors.brandPrimary}
      style={{
        minHeight,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.background,
        color: theme.colors.textPrimary,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: multiline ? theme.spacing.md : 10,
        fontSize: 15,
        lineHeight: 22,
      }}
    />
  );
}
