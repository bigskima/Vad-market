import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { AdminRouteContainer } from '@/features/admin/components/admin-route-container';
import { AdminPermissionGate } from '@/features/admin/components/admin-permission-gate';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import {
  adminListSupportTickets,
  adminReplySupportTicket,
  getSupportMessages,
  type SupportMessage,
  type SupportStatus,
  type SupportTicket,
} from '@/services/support-api';

const filters: Array<SupportStatus | 'ALL'> = ['OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED', 'ALL'];
const replyStatuses: Array<Exclude<SupportStatus, 'OPEN'>> = ['IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED'];

export default function AdminSupportScreen() {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [filter, setFilter] = useState<SupportStatus | 'ALL'>('OPEN');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState('');
  const [nextStatus, setNextStatus] = useState<Exclude<SupportStatus, 'OPEN'>>('WAITING_USER');
  const [loadedFilter, setLoadedFilter] = useState<SupportStatus | 'ALL' | null>(null);
  const loading = loadedFilter !== filter;
  const [messagesTicketId, setMessagesTicketId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeTicket = tickets.find((item) => item.id === activeTicketId) ?? null;
  const visibleMessages = messagesTicketId === activeTicketId ? messages : [];

  const reload = useCallback(async (preferredId?: string | null) => {
    const rows = await adminListSupportTickets(filter);
    setError(null);
    setTickets(rows);
    const nextId = preferredId ?? activeTicketId;
    const selected = rows.find((item) => item.id === nextId) ?? rows[0] ?? null;
    setActiveTicketId(selected?.id ?? null);
    if (!selected) {
      setMessages([]);
      setMessagesTicketId(null);
    }
    return selected;
  }, [activeTicketId, filter]);

  useEffect(() => {
    let active = true;
    setError(null);
    setNotice(null);
    void adminListSupportTickets(filter)
      .then((rows) => {
        if (!active) return;
        setError(null);
        setTickets(rows);
        setActiveTicketId(rows[0]?.id ?? null);
        if (!rows.length) {
          setMessages([]);
          setMessagesTicketId(null);
        }
      })
      .catch((value: unknown) => {
        if (!active) return;
        setTickets([]);
        setActiveTicketId(null);
        setMessages([]);
        setMessagesTicketId(null);
        setError(value instanceof Error ? value.message : 'Support inbox could not be loaded.');
      })
      .finally(() => { if (active) setLoadedFilter(filter); });
    return () => { active = false; };
  }, [filter]);

  useEffect(() => {
    if (!activeTicketId) return;
    let active = true;
    void getSupportMessages(activeTicketId)
      .then((rows) => { if (active) { setMessages(rows); setMessagesTicketId(activeTicketId); } })
      .catch((value: unknown) => { if (active) setError(value instanceof Error ? value.message : 'Conversation could not be loaded.'); });
    return () => { active = false; };
  }, [activeTicketId]);

  async function sendReply() {
    if (!activeTicket || working) return;
    if (!reply.trim()) return setError('Enter a reply before sending.');
    setWorking(true); setError(null); setNotice(null);
    try {
      await adminReplySupportTicket({ ticketId: activeTicket.id, body: reply, status: nextStatus });
      setReply('');
      await reload(activeTicket.id);
      setMessages(await getSupportMessages(activeTicket.id));
      setMessagesTicketId(activeTicket.id);
      setNotice('Reply sent and ticket status updated.');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Support reply could not be sent.');
    } finally { setWorking(false); }
  }

  return (
    <AdminPermissionGate permissions={['support.read']}>
      <AdminRouteContainer>
      <View style={{ gap: density.phone ? 12 : theme.spacing.lg, paddingBottom: theme.spacing.lg }}>
        <View style={{ gap: 4 }}>
          <VadText variant="label" tone="brand">ADMIN OPERATIONS</VadText>
          <VadText variant="title">Support inbox</VadText>
          <VadText variant="caption" tone="secondary">Respond to user questions, trading issues, wallet reports and resolution disputes.</VadText>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          {filters.map((value) => <VadChip key={value} label={value.replaceAll('_', ' ')} selected={filter === value} tone={filter === value ? 'brand' : 'neutral'} onPress={() => { setError(null); setNotice(null); setFilter(value); }} />)}
          <VadButton label="Refresh" size="small" variant="secondary" loading={loading} disabled={loading} onPress={() => { setLoadedFilter(null); void reload().catch((value: unknown) => setError(value instanceof Error ? value.message : 'Refresh failed.')).finally(() => setLoadedFilter(filter)); }} />
        </View>
        {notice ? <VadCard variant="muted"><VadText tone="yes">{notice}</VadText></VadCard> : null}
        {error ? <VadErrorState title="Support inbox error" message={error} onRetry={() => { setError(null); void reload().catch((value: unknown) => setError(value instanceof Error ? value.message : 'Refresh failed.')); }} /> : null}
        <View style={{ gap: 8 }}>
          {loading ? <VadText tone="secondary">Loading tickets…</VadText> : tickets.length ? tickets.map((ticket) => (
            <VadCard key={ticket.id} variant={activeTicketId === ticket.id ? 'raised' : 'surface'} style={{ gap: 4, borderColor: activeTicketId === ticket.id ? theme.colors.brandPrimary : theme.colors.border }}>
              <VadButton label={ticket.subject} variant="plain" size="small" onPress={() => { setActiveTicketId(ticket.id); setError(null); }} />
              <VadText variant="caption" tone="secondary">{ticket.user_email ?? ticket.user_id ?? 'User'} · {ticket.category.replaceAll('_', ' ')}</VadText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <VadChip label={ticket.status.replaceAll('_', ' ')} tone={ticket.status === 'OPEN' ? 'warning' : 'neutral'} />
                <VadChip label={ticket.priority} tone={ticket.priority === 'HIGH' ? 'no' : 'neutral'} />
              </View>
              {ticket.last_message ? <VadText variant="caption" tone="secondary">{ticket.last_message}</VadText> : null}
            </VadCard>
          )) : error ? null : <VadCard variant="muted"><VadText>No support tickets in this filter.</VadText></VadCard>}
        </View>
        {activeTicket ? (
          <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
            <View style={{ gap: 4 }}>
              <VadText variant="label" tone="brand">USER CONVERSATION</VadText>
              <VadText variant="heading">{activeTicket.subject}</VadText>
              <VadText variant="caption" tone="secondary">{activeTicket.user_email ?? activeTicket.user_id} · {activeTicket.category.replaceAll('_', ' ')} · {activeTicket.status.replaceAll('_', ' ')}</VadText>
            </View>
            <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ gap: 9 }}>
              {visibleMessages.map((message) => (
                <View key={message.id} style={{ alignSelf: message.sender_role === 'ADMIN' ? 'flex-end' : 'flex-start', maxWidth: '92%', padding: 10, gap: 4, borderRadius: 12, backgroundColor: message.sender_role === 'ADMIN' ? theme.colors.brandSoft : theme.colors.surfaceMuted, borderWidth: 1, borderColor: theme.colors.border }}>
                  <VadText variant="caption" tone="secondary">{message.sender_display_name || message.sender_role} · {new Date(message.created_at).toLocaleString()}</VadText>
                  <VadText>{message.body}</VadText>
                </View>
              ))}
            </ScrollView>
            <VadText variant="label">Update ticket status with your reply</VadText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {replyStatuses.map((value) => <VadChip key={value} label={value.replaceAll('_', ' ')} selected={nextStatus === value} tone={nextStatus === value ? 'brand' : 'neutral'} onPress={() => setNextStatus(value)} />)}
            </View>
            <VadInput label="Reply to user" value={reply} onChangeText={setReply} multiline numberOfLines={4} placeholder="Write a helpful response. This will be visible to the user." />
            <VadButton label={working ? 'Sending reply…' : 'Send reply'} loading={working} disabled={working} onPress={() => void sendReply()} />
          </VadCard>
        ) : null}
      </View>
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}
