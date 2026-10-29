import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getAdminPlayOperations,
  type PlayAdminOperations,
} from '@/services/admin-play-api';

const empty: PlayAdminOperations = { entryOrders: [], draws: [], settlements: [] };

function money(value: number | string, currency: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return currency + ' —';
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: currency === 'USDC' ? 4 : 2 }).format(amount);
  } catch {
    return currency + ' ' + amount.toLocaleString('en-NG', { maximumFractionDigits: 4 });
  }
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ').toLowerCase();
}

function Meta({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === '') return null;
  return (
    <View style={{ gap: 2 }}>
      <VadText variant="caption" tone="secondary">{label}</VadText>
      <VadText variant="caption" selectable>{String(value)}</VadText>
    </View>
  );
}

function OperationsSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const theme = useVadTheme();
  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ gap: 4 }}>
        <VadText variant="heading">{title}</VadText>
        <VadText variant="caption" tone="secondary">{description}</VadText>
      </View>
      {children}
    </View>
  );
}

export function AdminPlayOperationsPanel() {
  const theme = useVadTheme();
  const [data, setData] = useState<PlayAdminOperations>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getAdminPlayOperations());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'VAD Play operation records could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => { active = false; };
  }, [load]);

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: 5 }}>
        <VadText variant="heading">Play activity</VadText>
        <VadText tone="secondary">
          Latest orders, draw results and settlements. Each section shows up to 30 records; counts reflect only the records shown here.
        </VadText>
      </View>
      {error ? (
        <VadCard>
          <View style={{ padding: theme.spacing.md, gap: 8 }}>
            <VadText variant="caption" tone="danger">{error}</VadText>
            <VadButton label="Try again" variant="secondary" onPress={() => void load()} loading={loading} />
          </View>
        </VadCard>
      ) : null}
      {loading ? <VadText tone="secondary">Loading Play activity…</VadText> : null}

      {!loading && !error ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {[
              ['Orders loaded', data.entryOrders.length],
              ['Draws loaded', data.draws.length],
              ['Settlements loaded', data.settlements.length],
            ].map(([label, value]) => (
              <View key={String(label)} style={{ flexGrow: 1, minWidth: 120, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 4 }}>
                <VadText variant="caption" tone="secondary">{String(label)}</VadText>
                <VadText variant="title">{String(value)}</VadText>
              </View>
            ))}
          </View>

          <OperationsSection title="Entry orders" description="Ticket payments, refunds and references.">
            {data.entryOrders.length ? data.entryOrders.slice(0, 30).map((item) => (
              <VadCard key={item.id}>
                <View style={{ padding: theme.spacing.md, gap: theme.spacing.sm }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
                    <VadText variant="label">{item.campaign_title}</VadText>
                    <VadText variant="caption" tone={item.status === 'PAID' ? 'yes' : item.status === 'REFUNDED' ? 'secondary' : 'warning'}>{statusLabel(item.status)}</VadText>
                  </View>
                  <Meta label="Entry reference" value={item.id} />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.lg }}>
                    <Meta label="Tickets" value={item.ticket_count} />
                    <Meta label="Total" value={money(item.total_amount, item.currency_code)} />
                    <Meta label="Created" value={new Date(item.created_at).toLocaleString()} />
                  </View>
                  <Meta label="Payment reference" value={item.ledger_journal_id} />
                  <Meta label="Refund reference" value={item.refund_journal_id} />
                  {item.refund_reason ? <Meta label="Refund reason" value={item.refund_reason} /> : null}
                </View>
              </VadCard>
            )) : <VadText tone="secondary">No ticket orders recorded.</VadText>}
          </OperationsSection>

          <OperationsSection title="Draw records" description="Draw approvals, recorded results and winners.">
            {data.draws.length ? data.draws.slice(0, 30).map((item) => (
              <VadCard key={item.id}>
                <View style={{ padding: theme.spacing.md, gap: theme.spacing.sm }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
                    <VadText variant="label">{item.campaign_title}</VadText>
                    <VadText variant="caption" tone={item.status === 'DRAWN' ? 'yes' : item.status === 'VOIDED' ? 'secondary' : 'warning'}>{statusLabel(item.status)}</VadText>
                  </View>
                  <Meta label="Draw reference" value={item.id} />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.lg }}>
                    <Meta label="Tickets in draw" value={item.ticket_count_snapshot} />
                    <Meta label="Winner ticket" value={item.winning_ticket_code} />
                    <Meta label="Selection counter" value={item.selection_counter} />
                  </View>
                  <Meta label="Seed commitment" value={item.seed_commitment} />
                  <Meta label="Ticket-set digest" value={item.entries_digest} />
                  <Meta label="Result digest" value={item.result_digest} />
                  <Meta label="Authorized by / at" value={item.authorized_by + ' · ' + new Date(item.authorized_at).toLocaleString()} />
                  {item.executed_by && item.executed_at ? <Meta label="Executed by / at" value={item.executed_by + ' · ' + new Date(item.executed_at).toLocaleString()} /> : null}
                  {item.voided_by && item.voided_at ? <Meta label="Voided by / at" value={item.voided_by + ' · ' + new Date(item.voided_at).toLocaleString()} /> : null}
                  {item.void_reason ? <Meta label="Void reason" value={item.void_reason} /> : null}
                </View>
              </VadCard>
            )) : <VadText tone="secondary">No draw results yet.</VadText>}
          </OperationsSection>

          <OperationsSection title="Settlements" description="Recoveries, prize costs and profit allocations.">
            {data.settlements.length ? data.settlements.slice(0, 30).map((item) => (
              <VadCard key={item.id}>
                <View style={{ padding: theme.spacing.md, gap: theme.spacing.sm }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
                    <VadText variant="label">{item.campaign_title}</VadText>
                    <VadText variant="caption" tone="yes">settled</VadText>
                  </View>
                  <Meta label="Settlement ID" value={item.id} />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.lg }}>
                    <Meta label="Qualifying funds" value={money(item.qualifying_funds_amount, item.currency_code)} />
                    <Meta label="Prize cost recovered" value={money(item.prize_cost_recovered, item.currency_code)} />
                    <Meta label="Campaign costs recovered" value={money(item.campaign_costs_recovered, item.currency_code)} />
                    <Meta label="Configured profit target" value={money(item.profit_target_amount, item.currency_code)} />
                    <Meta label="Excess collection" value={money(item.excess_amount, item.currency_code)} />
                  </View>
                  <Meta label="Prize ledger journal" value={item.prize_journal_id} />
                  <Meta label="Costs ledger journal" value={item.costs_journal_id} />
                  <Meta label="Profit ledger journal" value={item.profit_journal_id} />
                  <Meta label="Delivery evidence reference" value={item.delivery_evidence_reference} />
                  <Meta label="Settled at" value={new Date(item.settled_at).toLocaleString()} />
                </View>
              </VadCard>
            )) : <VadText tone="secondary">No settlements recorded.</VadText>}
          </OperationsSection>

          <VadButton label="Refresh" variant="secondary" onPress={() => void load()} loading={loading} />
        </>
      ) : null}
    </View>
  );
}
