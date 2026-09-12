import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Switch, TextInput, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import {
  getAdminPolicyWorkspace,
  publishAdminLegalPolicy,
  saveAdminPolicyDraft,
  type AdminLegalDocument,
  type LegalDocument,
  type LegalDocumentKey,
} from '@/features/policy/legal-policy-service';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';

export function AdminPolicyEditorScreen() {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [documents, setDocuments] = useState<AdminLegalDocument[]>([]);
  const [selectedKey, setSelectedKey] = useState<LegalDocumentKey>('TERMS');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publicationReason, setPublicationReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await getAdminPolicyWorkspace();
      setDocuments(items);
      setSelectedKey((current) => (
        items.some((document) => document.key === current)
          ? current
          : items[0]?.key ?? 'TERMS'
      ));
    } catch (loadError) {
      setError(loadError instanceof Error
        ? loadError.message
        : 'We could not load the policy workspace right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const selected = useMemo(
    () => documents.find((document) => document.key === selectedKey) ?? documents[0],
    [documents, selectedKey],
  );

  function updateSelected(patch: Partial<LegalDocument>) {
    setSaved(false);
    setMessage(null);
    setDocuments((current) => current.map((document) =>
      document.key === selected?.key ? { ...document, ...patch } : document,
    ));
  }

  async function saveDraft(showMessage = true) {
    if (!selected) return false;
    setSaving(true);
    setError(null);
    try {
      await saveAdminPolicyDraft(selected);
      setSaved(true);
      if (showMessage) setMessage(`${selected.title} draft saved.`);
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error
        ? saveError.message
        : 'We could not save this policy draft.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publishVersion() {
    if (!selected || !selected.canPublish || publicationReason.trim().length < 3) return;
    setPublishing(true);
    setError(null);
    setMessage(null);
    try {
      const savedOk = await saveDraft(false);
      if (!savedOk) return;
      await publishAdminLegalPolicy(selected.key, publicationReason);
      setPublicationReason('');
      setMessage(`${selected.title} was published. Users who have not accepted this required version will be asked to review it before continuing.`);
      await load();
      setSaved(true);
    } catch (publishError) {
      setError(publishError instanceof Error
        ? publishError.message
        : 'We could not publish this policy version.');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <View style={{ gap: density.sectionGap }}>
      <View style={{ gap: 5 }}>
        <VadText variant="caption" tone="brand">POLICIES & CONSENT</VadText>
        <VadText variant="title">Write and publish VAD policies</VadText>
        <VadText tone="secondary" style={{ maxWidth: 820 }}>
          Draft, review and publish the documents users read before continuing to VAD. The document editor is intentionally large so complete policies can be written as full notes rather than inside a cramped settings field.
        </VadText>
      </View>

      <VadCard variant="brand" style={{ gap: 4 }}>
        <VadText variant="bodyStrong" tone="brand">Connected to VAD policy controls</VadText>
        <VadText variant="caption" tone="secondary">
          Drafts are saved to VAD. Publishing creates a new immutable policy version; when agreement is required, users who have not accepted that version are stopped before entering the product.
        </VadText>
      </VadCard>

      {error ? (
        <VadErrorState title="Policy workspace needs attention" message={error} onRetry={() => void load()} />
      ) : null}
      {message ? (
        <VadCard variant="outlined" style={{ gap: 3 }}>
          <VadText variant="bodyStrong" tone="yes">Saved</VadText>
          <VadText variant="caption" tone="secondary">{message}</VadText>
        </VadCard>
      ) : null}

      {loading && !documents.length ? (
        <View style={{ flexDirection: density.desktop ? 'row' : 'column', gap: theme.spacing.lg }}>
          <View style={{ width: density.desktop ? 250 : '100%', gap: theme.spacing.sm }}>
            <VadSkeleton height={112} radius={theme.radius.xl} />
            <VadSkeleton height={112} radius={theme.radius.xl} />
          </View>
          <View style={{ flex: 1, gap: theme.spacing.md }}>
            <VadSkeleton height={260} radius={theme.radius.xl} />
            <VadSkeleton height={520} radius={theme.radius.xl} />
          </View>
        </View>
      ) : selected ? (
        <View style={{ flexDirection: density.desktop ? 'row' : 'column', alignItems: 'flex-start', gap: theme.spacing.lg }}>
          <View style={{ width: density.desktop ? 270 : '100%', gap: theme.spacing.sm }}>
            {documents.map((document) => (
              <Pressable
                key={document.key}
                accessibilityRole="button"
                accessibilityState={{ selected: document.key === selected.key }}
                onPress={() => {
                  setSelectedKey(document.key);
                  setSaved(false);
                  setMessage(null);
                  setPublicationReason('');
                }}
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

            <VadButton
              label={saved ? 'Draft saved' : 'Save draft'}
              variant={saved ? 'tonal' : 'secondary'}
              loading={saving}
              onPress={() => void saveDraft()}
            />

            <VadCard variant="outlined" style={{ gap: theme.spacing.sm }}>
              <VadText variant="bodyStrong">Publish this version</VadText>
              <VadText variant="caption" tone="secondary">
                Publishing makes this document the current VAD version. Use a new version label each time you publish.
              </VadText>
              <EditorInput
                value={publicationReason}
                onChangeText={setPublicationReason}
                multiline
                minHeight={92}
                placeholder="Why is this version being published?"
              />
              <VadButton
                label="Publish new version"
                loading={publishing}
                disabled={!selected.canPublish || publicationReason.trim().length < 3}
                onPress={() => void publishVersion()}
              />
              {!selected.canPublish ? (
                <VadText variant="caption" tone="tertiary">
                  You can prepare and save drafts. A Super Admin must publish legal policy versions.
                </VadText>
              ) : null}
            </VadCard>
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
                  <Field label="Version label">
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
      ) : null}
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
  placeholder,
}: {
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  minHeight?: number;
  placeholder?: string;
}) {
  const theme = useVadTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      selectionColor={theme.colors.brandPrimary}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.textTertiary}
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
