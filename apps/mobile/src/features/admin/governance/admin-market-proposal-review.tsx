import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadDateTimeField } from '@/components/ui/vad-date-time-field';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import {
  approveAdminMarketProposalAutomatically,
  decideAdminMarketProposalSimple,
  getAdminMarketAutoOptions,
  type AdminMarketAutoOptions,
} from '@/services/admin-market-approval-api';

type ProposalRow = Record<string, unknown>;
type Decision = 'APPROVE' | 'NEEDS_CLARIFICATION' | 'REJECT';

const MARKET_CATEGORIES = [
  'Politics',
  'Sports',
  'Crypto',
  'Business',
  'Economy',
  'Technology',
  'Entertainment',
  'Science',
  'World',
  'Other',
] as const;

export function AdminMarketProposalReview({
  proposal,
  onClose,
  onCompleted,
}: {
  proposal: ProposalRow | null;
  onClose: () => void;
  onCompleted: (message: string) => Promise<void> | void;
}) {
  return (
    <VadBottomSheet visible={Boolean(proposal)} title="Market proposal review" onClose={onClose}>
      {proposal ? (
        <ProposalReviewForm
          key={String(proposal.proposal_public_id ?? 'proposal')}
          proposal={proposal}
          onClose={onClose}
          onCompleted={onCompleted}
        />
      ) : null}
    </VadBottomSheet>
  );
}

function ProposalReviewForm({
  proposal,
  onClose,
  onCompleted,
}: {
  proposal: ProposalRow;
  onClose: () => void;
  onCompleted: (message: string) => Promise<void> | void;
}) {
  const theme = useVadTheme();
  const [decision, setDecision] = useState<Decision>('APPROVE');
  const [options, setOptions] = useState<AdminMarketAutoOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [reason, setReason] = useState('');
  const [title, setTitle] = useState(() => String(proposal.question ?? proposal.title ?? ''));
  const [description, setDescription] = useState(() => String(proposal.context ?? ''));
  const [category, setCategory] = useState(() => normaliseCategory(String(proposal.category ?? '')));
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
        if (!ignore) setOptionsLoading(false);
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
  const recommendedAsset = jurisdiction?.assets.includes('TNGN') ? 'TNGN' : jurisdiction?.assets[0] ?? '';
  const resolvedAssetCode = assetCode || recommendedAsset;
  const isSandbox = resolvedAssetCode === 'TNGN';

  function validTime(value: string) {
    return Boolean(value.trim()) && Number.isFinite(Date.parse(value));
  }

  async function submit() {
    if (working) return;
    setWorking(true);
    setError(null);

    try {
      const proposalPublicId = String(proposal.proposal_public_id ?? '');
      if (!proposalPublicId) throw new Error('Proposal reference is unavailable.');

      if (decision !== 'APPROVE') {
        if (reason.trim().length < 3) throw new Error('Enter a decision reason.');
        await decideAdminMarketProposalSimple({ proposalPublicId, decision, reason });
        await onCompleted(
          decision === 'REJECT'
            ? 'Market proposal rejected and recorded in the audit trail.'
            : 'Clarification requested from the market proposer.',
        );
        onClose();
        return;
      }

      if (!resolvedCountryCode || !resolvedAssetCode) throw new Error('Choose the market currency.');
      if (!title.trim() || !category.trim()) throw new Error('Title and category are required.');
      if (!validTime(opensAt) || !validTime(closesAt) || !validTime(resolvesAfter)) {
        throw new Error('Choose opening, closing and resolution dates and times.');
      }
      if (Date.parse(closesAt) <= Date.parse(opensAt)) throw new Error('Closing time must be after opening time.');
      if (Date.parse(resolvesAfter) < Date.parse(closesAt)) throw new Error('Resolution time cannot be before closing time.');

      const result = await approveAdminMarketProposalAutomatically({
        proposalPublicId,
        title,
        description,
        category,
        opensAt: new Date(opensAt).toISOString(),
        closesAt: new Date(closesAt).toISOString(),
        resolvesAfter: new Date(resolvesAfter).toISOString(),
        countryCode: resolvedCountryCode,
        assetCode: resolvedAssetCode,
      });

      const resolutionMode = String(result.resolution_mode ?? 'VAD_AUTO').replaceAll('_', ' ').toLowerCase();
      await onCompleted(
        Boolean(result.merged_existing)
          ? 'A matching market already exists, so this proposal was linked to it.'
          : `Proposal approved. VAD selected the ${resolutionMode} resolution path automatically.`,
      );
      onClose();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Market decision could not be completed.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: 2 }}>
        <VadText variant="heading">{String(proposal.question ?? 'Market proposal')}</VadText>
        <VadText variant="caption" tone="secondary">{String(proposal.context ?? 'No additional context supplied.')}</VadText>
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
        {(['APPROVE', 'NEEDS_CLARIFICATION', 'REJECT'] as const).map((value) => (
          <DecisionChoice
            key={value}
            label={value === 'APPROVE' ? 'Approve' : value === 'NEEDS_CLARIFICATION' ? 'Clarify' : 'Reject'}
            selected={decision === value}
            danger={value === 'REJECT'}
            onPress={() => {
              setDecision(value);
              setError(null);
            }}
          />
        ))}
      </View>

      {decision === 'APPROVE' ? (
        optionsLoading ? (
          <View style={{ gap: theme.spacing.sm }}>
            <VadSkeleton height={48} />
            <VadSkeleton height={48} />
            <VadSkeleton height={90} />
          </View>
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            <VadInput label="Market title" value={title} onChangeText={setTitle} />
            <VadInput label="Description" value={description} onChangeText={setDescription} multiline />

            <ChoiceSection title="Category">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {MARKET_CATEGORIES.map((item) => (
                  <DecisionChoice key={item} label={item} selected={category === item} onPress={() => setCategory(item)} />
                ))}
              </View>
            </ChoiceSection>

            {options && options.jurisdictions.length > 1 ? (
              <ChoiceSection title="Jurisdiction">
                {options.jurisdictions.map((item) => (
                  <Choice
                    key={item.countryCode}
                    label={item.name}
                    detail={item.countryCode}
                    selected={resolvedCountryCode === item.countryCode}
                    onPress={() => {
                      setCountryCode(item.countryCode);
                      setAssetCode('');
                    }}
                  />
                ))}
              </ChoiceSection>
            ) : null}

            {jurisdiction ? (
              <ChoiceSection title="Market currency">
                {jurisdiction.assets.map((asset) => (
                  <Choice
                    key={asset}
                    label={asset === 'TNGN' ? 'Test NGN · Sandbox' : asset}
                    detail={asset === 'TNGN' ? 'Recommended for tester launch · no cash value · cannot be withdrawn' : 'Real-money market currency'}
                    selected={resolvedAssetCode === asset}
                    onPress={() => setAssetCode(asset)}
                  />
                ))}
              </ChoiceSection>
            ) : null}

            {isSandbox ? (
              <VadCard variant="brand" style={{ gap: 4 }}>
                <VadText variant="bodyStrong" tone="brand">Sandbox market</VadText>
                <VadText variant="caption" tone="secondary">
                  This market uses Test NGN. Every current Nigerian tester has ₦T100,000 and new Nigerian accounts receive the same test balance automatically. Test NGN has no cash value and cannot use deposit or withdrawal rails.
                </VadText>
              </VadCard>
            ) : null}

            <VadDateTimeField label="Opens" value={opensAt} onChange={setOpensAt} hint="When users can begin trading." />
            <VadDateTimeField label="Closes" value={closesAt} onChange={setClosesAt} minDate={opensAt || undefined} hint="Trading stops at this time." />
            <VadDateTimeField label="Resolve after" value={resolvesAfter} onChange={setResolvesAfter} minDate={closesAt || opensAt || undefined} hint="Earliest time VAD should resolve the outcome." />

            <VadCard variant="muted" style={{ gap: 5, borderColor: theme.colors.yes }}>
              <VadText variant="bodyStrong" tone="yes">Resolution is automatic</VadText>
              <VadText variant="caption" tone="secondary">
                You do not need to choose Pyth, CoinGecko, a government source, or write a YES rule here. VAD reads the proposal, selects the configured resolver and oracle policy, and stores the structured resolution contract automatically.
              </VadText>
              <VadText variant="caption" tone="tertiary">
                If the market cannot be resolved safely by a deterministic provider, VAD routes it to the controlled oracle review queue instead of inventing an answer.
              </VadText>
            </VadCard>
          </View>
        )
      ) : (
        <VadInput
          label={decision === 'REJECT' ? 'Rejection reason' : 'Clarification required'}
          value={reason}
          onChangeText={(value) => {
            setReason(value);
            setError(null);
          }}
          multiline
          placeholder={decision === 'REJECT' ? 'Why should this proposal not proceed?' : 'What must the proposer clarify?'}
        />
      )}

      {error ? <VadErrorState title="Market decision blocked" message={error} /> : null}
      <VadButton
        label={decision === 'APPROVE' ? 'Approve market proposal' : decision === 'REJECT' ? 'Reject proposal' : 'Request clarification'}
        variant={decision === 'REJECT' ? 'danger' : 'primary'}
        loading={working}
        disabled={optionsLoading || (decision !== 'APPROVE' && reason.trim().length < 3)}
        onPress={() => void submit()}
      />
    </View>
  );
}

function normaliseCategory(value: string) {
  const match = MARKET_CATEGORIES.find((item) => item.toLowerCase() === value.trim().toLowerCase());
  return match ?? '';
}

function DecisionChoice({ label, selected, danger = false, onPress }: { label: string; selected: boolean; danger?: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor: selected ? (danger ? theme.colors.danger : theme.colors.brandPrimary) : theme.colors.border,
        backgroundColor: selected ? (danger ? theme.colors.noSoft : theme.colors.brandSoft) : theme.colors.surface,
        borderRadius: theme.radius.pill,
        paddingHorizontal: 14,
        paddingVertical: 9,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <VadText variant="caption" tone={selected ? (danger ? 'danger' : 'brand') : 'primary'}>{label}</VadText>
    </Pressable>
  );
}

function ChoiceSection({ title, children }: { title: string; children: ReactNode }) {
  const theme = useVadTheme();
  return <View style={{ gap: theme.spacing.sm }}><VadText variant="label">{title}</VadText>{children}</View>;
}

function Choice({ label, detail, selected, onPress }: { label: string; detail: string; selected: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.74 : 1 })}>
      <View style={{ borderWidth: 1, borderColor: selected ? theme.colors.brandPrimary : theme.colors.border, backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 3 }}>
        <VadText variant="bodyStrong" tone={selected ? 'brand' : 'primary'}>{label}</VadText>
        <VadText variant="caption" tone="secondary">{detail}</VadText>
      </View>
    </Pressable>
  );
}
