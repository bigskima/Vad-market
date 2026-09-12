import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import {
  getPolicyWorkspace,
  type LegalDocument,
  type LegalDocumentKey,
} from '@/features/policy/legal-policy-service';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';

export default function PoliciesRoute() {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [selectedKey, setSelectedKey] = useState<LegalDocumentKey>('TERMS');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await getPolicyWorkspace();
      setDocuments(items);
      if (items.length && !items.some((document) => document.key === selectedKey)) {
        setSelectedKey(items[0].key);
      }
    } catch (loadError) {
      setError(loadError instanceof Error
        ? loadError.message
        : 'We could not load the current VAD policies. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = documents.find((document) => document.key === selectedKey) ?? documents[0];

  return (
    <ProductSubpage title="Policies & privacy" maxWidth={900}>
      <View style={{ gap: density.sectionGap }}>
        <View style={{ gap: 5 }}>
          <VadText variant="caption" tone="brand">VAD POLICIES</VadText>
          <VadText variant="title">Important information in one place</VadText>
          <VadText tone="secondary">
            Read the current terms that apply to using VAD and how account information is handled. When a future published update needs your agreement, VAD will ask you to review it before you continue.
          </VadText>
        </View>

        {error ? (
          <VadErrorState
            title="Policies could not be loaded"
            message={error}
            onRetry={() => void load()}
          />
        ) : null}

        {loading && !documents.length ? (
          <View style={{ flexDirection: density.desktop ? 'row' : 'column', gap: theme.spacing.lg }}>
            <View style={{ width: density.desktop ? 250 : '100%', gap: theme.spacing.sm }}>
              <VadSkeleton height={106} radius={theme.radius.xl} />
              <VadSkeleton height={106} radius={theme.radius.xl} />
            </View>
            <View style={{ flex: 1, gap: theme.spacing.sm }}>
              <VadSkeleton width="58%" height={28} />
              <VadSkeleton height={380} radius={theme.radius.xl} />
            </View>
          </View>
        ) : documents.length ? (
          <View style={{ flexDirection: density.desktop ? 'row' : 'column', gap: theme.spacing.lg, alignItems: 'flex-start' }}>
            <View style={{ width: density.desktop ? 250 : '100%', gap: theme.spacing.sm }}>
              {documents.map((document) => (
                <PolicySelector
                  key={`${document.key}-${document.policyVersionId ?? document.version}`}
                  document={document}
                  selected={document.key === selected?.key}
                  onPress={() => setSelectedKey(document.key)}
                />
              ))}
            </View>

            {selected ? (
              <VadCard
                variant="raised"
                style={{ flex: 1, width: density.desktop ? undefined : '100%', gap: theme.spacing.lg, padding: density.phone ? theme.spacing.lg : theme.spacing.xl }}
              >
                <View style={{ gap: theme.spacing.sm }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs, alignItems: 'center' }}>
                    <VadChip label={`Version ${selected.version}`} tone="brand" />
                    <VadChip label={`Effective ${selected.effectiveDate}`} />
                    {selected.accepted ? <VadChip label="Agreed" tone="yes" /> : null}
                  </View>
                  <VadText variant="title">{selected.title}</VadText>
                  <VadText tone="secondary">{selected.summary}</VadText>
                </View>

                <View style={{ height: 1, backgroundColor: theme.colors.border }} />

                <VadText style={{ lineHeight: density.phone ? 24 : 26 }}>
                  {selected.content}
                </VadText>
              </VadCard>
            ) : null}
          </View>
        ) : !loading && !error ? (
          <VadCard variant="outlined" style={{ gap: 4 }}>
            <VadText variant="bodyStrong">No published policies are available.</VadText>
            <VadText variant="caption" tone="secondary">Please try again later.</VadText>
          </VadCard>
        ) : null}
      </View>
    </ProductSubpage>
  );
}

function PolicySelector({
  document,
  selected,
  onPress,
}: {
  document: LegalDocument;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
    >
      <VadCard
        variant={selected ? 'brand' : 'raised'}
        style={{ gap: 4, borderColor: selected ? theme.colors.brandPrimary : theme.colors.border }}
      >
        <VadText variant="bodyStrong" tone={selected ? 'brand' : 'primary'}>{document.title}</VadText>
        <VadText variant="caption" tone="secondary" numberOfLines={2}>{document.summary}</VadText>
        {document.accepted ? <VadText variant="caption" tone="yes">Agreed to current version</VadText> : null}
      </VadCard>
    </Pressable>
  );
}
