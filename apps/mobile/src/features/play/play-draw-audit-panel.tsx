import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getPlayDrawAudit,
  getPlayDrawAuditTicketPage,
  type PlayDrawAudit,
  type PlayDrawAuditTicket,
} from '@/services/play-api';

function dateLabel(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function DigestRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  const theme = useVadTheme();
  if (value == null || value === '') return null;
  return (
    <View style={{ gap: 3 }}>
      <VadText variant="caption" tone="secondary">{label}</VadText>
      <View style={{ padding: theme.spacing.sm, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceMuted }}>
        <VadText variant="caption" selectable>{String(value)}</VadText>
      </View>
    </View>
  );
}

export function PlayDrawAuditPanel({ campaignId }: { campaignId: string }) {
  const theme = useVadTheme();
  const [audit, setAudit] = useState<PlayDrawAudit | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<PlayDrawAuditTicket[]>([]);
  const [nextAfterTicketId, setNextAfterTicketId] = useState<number | string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [showTickets, setShowTickets] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAudit(await getPlayDrawAudit(campaignId));
    } catch {
      setAudit(null);
      setError('The draw audit is not available in this environment yet.');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => { active = false; };
  }, [load]);

  const loadTicketPage = useCallback(async (reset = false) => {
    if (!campaignId) return;
    setLoadingTickets(true);
    setTicketError(null);
    try {
      const cursor = reset ? null : nextAfterTicketId;
      const page = await getPlayDrawAuditTicketPage(campaignId, cursor, 50);
      setTickets((current) => reset ? page.tickets : [...current, ...page.tickets]);
      setNextAfterTicketId(page.nextAfterTicketId);
      setHasMore(page.hasMore);
      setShowTickets(true);
    } catch {
      setTicketError('We could not load the public ticket-evidence page. Try again.');
    } finally {
      setLoadingTickets(false);
    }
  }, [campaignId, nextAfterTicketId]);

  if (loading) return null;
  if (error || !audit) return null;
  if (!['DRAWN', 'VOIDED', 'AUTHORIZED'].includes(audit.status)) return null;

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.md, gap: theme.spacing.md }}>
      <View style={{ gap: 4 }}>
        <VadText variant="heading">Public draw audit</VadText>
        <VadText variant="caption" tone="secondary">
          {audit.status === 'DRAWN'
            ? 'Recorded result and reproducible evidence for the completed draw.'
            : audit.status === 'VOIDED'
              ? 'This draw authorization was voided before a winner was selected.'
              : 'A draw has been authorized. The seed remains hidden until execution or a recorded void.'}
        </VadText>
      </View>

      {audit.status === 'DRAWN' ? (
        <View style={{ gap: theme.spacing.md }}>
          <View style={{ padding: theme.spacing.md, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.yes, gap: 4 }}>
            <VadText variant="caption" tone="yes">Winning ticket</VadText>
            <VadText variant="title">{audit.winningTicketCode ?? 'Recorded'}</VadText>
            {dateLabel(audit.executedAt) ? <VadText variant="caption" tone="secondary">Drawn {dateLabel(audit.executedAt)}</VadText> : null}
          </View>
          <DigestRow label="Ticket count snapshot" value={audit.ticketCount} />
          <DigestRow label="Eligible ticket-set digest" value={audit.entriesDigest} />
          <DigestRow label="Seed commitment (published before draw)" value={audit.seedCommitment} />
          <DigestRow label="Revealed seed" value={audit.seedReveal} />
          <DigestRow label="Selection counter" value={audit.selectionCounter} />
          <DigestRow label="Result digest" value={audit.resultDigest} />
          <DigestRow label="Selection method" value={audit.algorithm} />
          <VadText variant="caption" tone="secondary">
            The seed reveal can be hashed to verify its commitment. The ordered ticket-set evidence can be checked in the paginated ticket audit below.
          </VadText>

          {!showTickets ? (
            <VadButton label="View eligible ticket evidence" variant="secondary" loading={loadingTickets} onPress={() => void loadTicketPage(true)} />
          ) : (
            <View style={{ gap: theme.spacing.sm }}>
              <VadText variant="label">Eligible ticket codes</VadText>
              {tickets.map((ticket) => (
                <View key={ticket.ticketId} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                  <VadText variant="caption">{ticket.ticketCode}</VadText>
                  <VadText variant="caption" tone={ticket.status === 'WINNER' ? 'yes' : 'secondary'}>{ticket.status === 'WINNER' ? 'Winner' : 'Eligible'}</VadText>
                </View>
              ))}
              {hasMore ? <VadButton label="Load next ticket page" variant="secondary" loading={loadingTickets} onPress={() => void loadTicketPage(false)} /> : null}
              {tickets.length > 0 && !hasMore ? <VadText variant="caption" tone="secondary">End of the public ticket list.</VadText> : null}
            </View>
          )}
          {ticketError ? <VadText variant="caption" tone="danger">{ticketError}</VadText> : null}
        </View>
      ) : audit.status === 'VOIDED' ? (
        <View style={{ gap: theme.spacing.md }}>
          <VadText variant="label" tone="warning">Authorization voided</VadText>
          <DigestRow label="Reason" value={audit.voidReason} />
          <DigestRow label="Seed commitment" value={audit.seedCommitment} />
          <DigestRow label="Revealed seed" value={audit.seedReveal} />
          <DigestRow label="Ticket-set digest" value={audit.entriesDigest} />
          {dateLabel(audit.voidedAt) ? <VadText variant="caption" tone="secondary">Voided {dateLabel(audit.voidedAt)}</VadText> : null}
        </View>
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          <VadText variant="label">Awaiting execution</VadText>
          <DigestRow label="Ticket count snapshot" value={audit.ticketCount} />
          <DigestRow label="Ticket-set digest" value={audit.entriesDigest} />
          <DigestRow label="Seed commitment" value={audit.seedCommitment} />
          {dateLabel(audit.authorizedAt) ? <VadText variant="caption" tone="secondary">Authorized {dateLabel(audit.authorizedAt)}</VadText> : null}
        </View>
      )}

      <VadButton label="Refresh public audit" variant="plain" loading={loading} onPress={() => void load()} />
    </View>
  );
}
