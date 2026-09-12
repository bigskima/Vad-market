import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadDateTimeField } from '@/components/ui/vad-date-time-field';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import {
  approveAdminMarketProposal,
  decideAdminMarketProposal,
  getAdminMarketApprovalOptions,
  type AdminMarketApprovalOptions,
} from '@/services/admin-control-api';

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
    <VadBottomSheet
      visible={Boolean(proposal)}
      title="Market proposal review"
      onClose={onClose}
    >
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
  const [options, setOptions] = useState<AdminMarketApprovalOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [reason, setReason] = useState('');
  const [title, setTitle] = useState(() => String(proposal.question ?? proposal.title ?? ''));
  const [description, setDescription] = useState(() => String(proposal.context ?? ''));
  const [category, setCategory] = useState(() => normaliseCategory(String(proposal.category ?? '')));
  const [templateCode, setTemplateCode] = useState('');
  const [oraclePolicyId, setOraclePolicyId] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [assetCode, setAssetCode] = useState('');
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [resolvesAfter, setResolvesAfter] = useState('');
  const [resolutionSource, setResolutionSource] = useState('');
  const [resolutionCriterion, setResolutionCriterion] = useState('');
  const [minNotional, setMinNotional] = useState('100');
  const [precision, setPrecision] = useState('4');

  useEffect(() => {
    let ignore = false;
    void getAdminMarketApprovalOptions()
      .then((next) => {
        if (!ignore) setOptions(next);
      })
      .catch((value) => {
        if (!ignore) setError(value instanceof Error ? value.message : 'Market approval options could not be loaded.');
      })
      .finally(() => {
        if (!ignore) setOptionsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const resolvedTemplateCode = templateCode || (options?.templates.length === 1 ? options.templates[0].code : '');
  const resolvedOraclePolicyId = oraclePolicyId || (options?.oraclePolicies.length === 1 ? options.oraclePolicies[0].publicId : '');
  const resolvedCountryCode = countryCode || (options?.jurisdictions.length === 1 ? options.jurisdictions[0].countryCode : '');

  const jurisdiction = useMemo(
    () => options?.jurisdictions.find((item) => item.countryCode === resolvedCountryCode) ?? null,
    [options, resolvedCountryCode],
  );

  const resolvedAssetCode = assetCode || (jurisdiction?.assets.length === 1 ? jurisdiction.assets[0] : '');

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
        await decideAdminMarketProposal({ proposalPublicId, decision, reason });
        await onCompleted(
          decision === 'REJECT'
            ? 'Market proposal rejected and recorded in the audit trail.'
            : 'Clarification requested from the market proposer.',
        );
        onClose();
        return;
      }

      if (!options?.oraclePolicies.length) {
        throw new Error('No active oracle policy exists. A market cannot be approved until a resolution policy is available.');
      }
      if (!resolvedTemplateCode || !resolvedOraclePolicyId || !resolvedCountryCode || !resolvedAssetCode) {
        throw new Error('Template, oracle policy, jurisdiction and currency are required.');
      }
      if (!title.trim() || !category.trim()) throw new Error('Title and category are required.');
      if (!resolutionSource.trim() || !resolutionCriterion.trim()) {
        throw new Error('Choose a resolution source and explain the YES condition in plain language.');
      }
      if (!validTime(opensAt) || !validTime(closesAt) || !validTime(resolvesAfter)) {
        throw new Error('Choose opening, closing and resolution dates and times.');
      }
      if (Date.parse(closesAt) <= Date.parse(opensAt)) throw new Error('Closing time must be after opening time.');
      if (Date.parse(resolvesAfter) < Date.parse(closesAt)) throw new Error('Resolution time cannot be before closing time.');

      const minimum = Number(minNotional);
      const pricingPrecision = Number(precision);
      if (!Number.isFinite(minimum) || minimum <= 0) throw new Error('Minimum order value must be positive.');
      if (!Number.isInteger(pricingPrecision) || pricingPrecision < 0 || pricingPrecision > 10) {
        throw new Error('Price precision must be a whole number from 0 to 10.');
      }

      const result = await approveAdminMarketProposal({
        proposalPublicId,
        templateCode: resolvedTemplateCode,
        title,
        description,
        category,
        normalizedParameters: {
          subject: title.trim(),
          time_scope: new Date(closesAt).toISOString(),
          category,
        },
        resolutionScope: {
          source: resolutionSource.trim(),
          criterion: resolutionCriterion.trim(),
          category,
        },
        opensAt: new Date(opensAt).toISOString(),
        closesAt: new Date(closesAt).toISOString(),
        resolvesAfter: new Date(resolvesAfter).toISOString(),
        oraclePolicyPublicId: resolvedOraclePolicyId,
        countryCode: resolvedCountryCode,
        assetCode: resolvedAssetCode,
        minOrderNotional: minimum,
        pricingPrecision,
      });

      await onCompleted(
        Boolean(result.merged_existing)
          ? 'A matching market already exists, so the proposal was linked to it.'
          : 'Proposal approved and market configuration created.',
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
            {!options?.oraclePolicies.length ? (
              <View style={{ borderLeftWidth: 3, borderLeftColor: theme.colors.warning, backgroundColor: theme.colors.warningSoft, padding: theme.spacing.md, gap: 2 }}>
                <VadText variant="caption" tone="warning">ORACLE POLICY REQUIRED</VadText>
                <VadText variant="caption" tone="secondary">There is currently no active oracle policy. Approval is blocked until a valid resolution policy is available.</VadText>
              </View>
            ) : null}

            <VadInput label="Market title" value={title} onChangeText={setTitle} />
            <VadInput label="Description" value={description} onChangeText={setDescription} multiline />

            <ChoiceSection title="Category">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {MARKET_CATEGORIES.map((item) => (
                  <DecisionChoice key={item} label={item} selected={category === item} onPress={() => setCategory(item)} />
                ))}
              </View>
            </ChoiceSection>

            <ChoiceSection title="Template">
              {options?.templates.map((item) => (
                <Choice key={item.code} label={item.name} detail={item.code} selected={resolvedTemplateCode === item.code} onPress={() => setTemplateCode(item.code)} />
              ))}
            </ChoiceSection>

            <ChoiceSection title="Oracle policy">
              {options?.oraclePolicies.map((item) => (
                <Choice key={item.publicId} label={item.name} detail={`Version ${item.version}`} selected={resolvedOraclePolicyId === item.publicId} onPress={() => setOraclePolicyId(item.publicId)} />
              ))}
            </ChoiceSection>

            <ChoiceSection title="Jurisdiction">
              {options?.jurisdictions.map((item) => (
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

            {jurisdiction ? (
              <ChoiceSection title="Market currency">
                {jurisdiction.assets.map((asset) => (
                  <Choice key={asset} label={asset} detail="Available for this jurisdiction" selected={resolvedAssetCode === asset} onPress={() => setAssetCode(asset)} />
                ))}
              </ChoiceSection>
            ) : null}

            <VadDateTimeField label="Opens" value={opensAt} onChange={setOpensAt} hint="When users can begin trading this market." />
            <VadDateTimeField label="Closes" value={closesAt} onChange={setClosesAt} minDate={opensAt || undefined} hint="Trading stops at this time." />
            <VadDateTimeField label="Resolve after" value={resolvesAfter} onChange={setResolvesAfter} minDate={closesAt || opensAt || undefined} hint="Earliest time VAD should resolve the outcome." />

            <View style={{ gap: theme.spacing.sm, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.xl, padding: theme.spacing.md, backgroundColor: theme.colors.surfaceRaised }}>
              <View style={{ gap: 2 }}>
                <VadText variant="bodyStrong">How should this market be resolved?</VadText>
                <VadText variant="caption" tone="secondary">No JSON is required. Describe the source and the exact condition that makes YES win. VAD stores the structured configuration for you.</VadText>
              </View>
              <VadInput
                label="Resolution source"
                value={resolutionSource}
                onChangeText={setResolutionSource}
                placeholder={category === 'Politics' ? 'e.g. INEC official result or another named official source' : 'e.g. official league result, CoinGecko, Pyth, government source'}
                hint="Name the source VAD should trust for the final outcome."
              />
              <VadInput
                label="YES outcome rule"
                value={resolutionCriterion}
                onChangeText={setResolutionCriterion}
                multiline
                placeholder="Example: Resolve YES if the official source confirms the stated outcome by the resolution time."
                hint="Write this exactly as a normal person should understand it."
              />
              <VadText variant="caption" tone={category === 'Crypto' || category === 'Sports' ? 'yes' : 'warning'}>
                {category === 'Crypto' || category === 'Sports'
                  ? 'This category can use the configured automated oracle path when its source details match the supported resolver.'
                  : 'This category currently uses VAD oracle/admin review unless an automated resolver is configured for it.'}
              </VadText>
            </View>

            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <VadInput label="Minimum order value" value={minNotional} onChangeText={setMinNotional} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <VadInput label="Price precision" value={precision} onChangeText={setPrecision} keyboardType="number-pad" />
              </View>
            </View>
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
        disabled={optionsLoading || (decision !== 'APPROVE' && reason.trim().length < 3) || (decision === 'APPROVE' && !options?.oraclePolicies.length)}
        onPress={() => void submit()}
      />
    </View>
  );
}

function normaliseCategory(value: string) {
  const match = MARKET_CATEGORIES.find((item) => item.toLowerCase() === value.trim().toLowerCase());
  return match ?? '';
}

function DecisionChoice({ label, selected, danger, onPress }: { label: string; selected: boolean; danger?: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: selected ? danger ? theme.colors.danger : theme.colors.brandPrimary : theme.colors.border,
        backgroundColor: selected ? danger ? theme.colors.noSoft : theme.colors.brandSoft : theme.colors.surfaceRaised,
        borderRadius: theme.radius.lg,
        paddingHorizontal: theme.spacing.md,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <VadText variant="caption" tone={selected ? danger ? 'danger' : 'brand' : 'secondary'}>{label}</VadText>
    </Pressable>
  );
}

function ChoiceSection({ title, children }: { title: string; children: ReactNode }) {
  const theme = useVadTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <VadText variant="bodyStrong">{title}</VadText>
      {children}
    </View>
  );
}

function Choice({ label, detail, selected, onPress }: { label: string; detail: string; selected: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
        backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surfaceRaised,
        borderRadius: theme.radius.lg,
        padding: theme.spacing.md,
        gap: 2,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <VadText variant="bodyStrong" tone={selected ? 'brand' : 'primary'}>{label}</VadText>
      <VadText variant="caption" tone="secondary">{detail}</VadText>
    </Pressable>
  );
}
