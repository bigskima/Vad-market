import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadText } from '@/components/ui/vad-text';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import {
  DEFAULT_LEGAL_DOCUMENTS,
  getPolicyWorkspace,
  type LegalDocument,
  type LegalDocumentKey,
} from '@/features/policy/legal-policy-service';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';

export default function PoliciesRoute() {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [documents, setDocuments] = useState<LegalDocument[]>(DEFAULT_LEGAL_DOCUMENTS);
  const [selectedKey, setSelectedKey] = useState<LegalDocumentKey>('TERMS');

  useEffect(() => {
    let mounted = true;
    void getPolicyWorkspace().then((items) => {
      if (mounted) setDocuments(items);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const selected = documents.find((document) => document.key === selectedKey) ?? documents[0];

  return (
    <ProductSubpage title="Policies & privacy" maxWidth={900}>
      <View style={{ gap: density.sectionGap }}>
        <View style={{ gap: 5 }}>
          <VadText variant="caption" tone="brand">VAD POLICIES</VadText>
          <VadText variant="title">Important information in one place</VadText>
          <VadText tone="secondary">
            Read the terms that apply to using VAD and how account information is handled. When a future published update needs your agreement, VAD will ask you to review it before you continue.
          </VadText>
        </View>

        <View style={{ flexDirection: density.desktop ? 'row' : 'column', gap: theme.spacing.lg, alignItems: 'flex-start' }}>
          <View style={{ width: density.desktop ? 250 : '100%', gap: theme.spacing.sm }}>
            {documents.map((document) => (
              <PolicySelector
                key={document.key}
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
      </VadCard>
    </Pressable>
  );
}
