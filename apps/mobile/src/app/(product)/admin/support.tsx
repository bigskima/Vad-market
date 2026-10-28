import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, TextInput, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadIcon } from '@/components/ui/vad-icon';
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

const filters: Array<SupportStatus | 'ALL'> = ['ALL', 'OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED'];
const replyStatuses: Array<Exclude<SupportStatus, 'OPEN'>> = ['IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED'];

export default function AdminSupportScreen() {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [filter, setFilter] = useState<SupportStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [messagesTicketId, setMessagesTicketId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [nextStatus, setNextStatus] = useState<Exclude<SupportStatus, 'OPEN'>>('WAITING_USER');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conversationOpen, setConversationOpen] = useState(false);

  const activeTicket = tickets.find((ticket) => ticket.id === activeTicketId) ?? null;
  const visibleMessages = messagesTicketId === activeTicketId ? messages : [];

  const filteredTickets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesStatus = filter === 'ALL' || ticket.status === filter;
      const matchesSearch = !query || [
        ticket.subject,
        ticket.user_email,
        ticket.category,
        ticket.priority,
        ticket.last_message,
      ].some((value) => String(value ?? '').toLowerCase().includes(query));
      return matchesStatus && matchesSearch;
    }).sort((a, b) => Date.parse(b.last_message_at || b.updated_at) - Date.parse(a.last_message_at || a.updated_at));
  }, [tickets, filter, search]);

  const openCount = tickets.filter((ticket) => ticket.status === 'OPEN').length;
  const inProgressCount = tickets.filter((ticket) => ticket.status === 'IN_PROGRESS').length;
  const waitingCount = tickets.filter((ticket) => ticket.status === 'WAITING_USER').length;
  const highPriorityCount = tickets.filter((ticket) => ticket.priority === 'HIGH' && !['RESOLVED', 'CLOSED'].includes(ticket.status)).length;

  async function reloadTickets(preferredId?: string | null) {
    setLoading(true);
    setError(null);
    try {
      const rows = await adminListSupportTickets('ALL');
      setTickets(rows);
      const target = preferredId ?? activeTicketId;
      const selected = rows.find((ticket) => ticket.id === target) ?? rows[0] ?? null;
      setActiveTicketId(selected?.id ?? null);
      if (!selected) {
        setMessages([]);
        setMessagesTicketId(null);
      }
      return selected;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The support inbox could not be loaded.');
      throw reason;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void adminListSupportTickets('ALL')
      .then((rows) => {
        if (!active) return;
        setTickets(rows);
        setActiveTicketId(rows[0]?.id ?? null);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'The support inbox could not be loaded.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!activeTicketId) return;
    let active = true;
    void getSupportMessages(activeTicketId)
      .then((rows) => {
        if (active) {
          setMessages(rows);
          setMessagesTicketId(activeTicketId);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'The conversation could not be loaded.');
      });
    return () => { active = false; };
  }, [activeTicketId]);

  function selectTicket(ticketId: string) {
    setActiveTicketId(ticketId);
    setError(null);
    setNotice(null);
    const ticket = tickets.find((row) => row.id === ticketId);
    setNextStatus(ticket?.status === 'CLOSED' ? 'IN_PROGRESS' : ticket?.status === 'RESOLVED' ? 'CLOSED' : 'WAITING_USER');
    if (density.phone) setConversationOpen(true);
  }

  async function sendReply() {
    if (!activeTicket || working) return;
    if (!reply.trim()) {
      setError('Enter a reply before sending.');
      return;
    }
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      await adminReplySupportTicket({ ticketId: activeTicket.id, body: reply, status: nextStatus });
      setReply('');
      await reloadTickets(activeTicket.id);
      const rows = await getSupportMessages(activeTicket.id);
      setMessages(rows);
      setMessagesTicketId(activeTicket.id);
      setNotice('Reply sent and ticket status updated.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The reply could not be sent.');
    } finally {
      setWorking(false);
    }
  }

  const conversationPanel = activeTicket ? (
    <View style={{ flex: 1, minWidth: 0, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandSoft }}>
          <VadIcon name="lifeBuoy" size={20} tone="brand" />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <VadText variant="heading">{activeTicket.subject}</VadText>
          <VadText variant="caption" tone="secondary">{activeTicket.user_email ?? activeTicket.user_id ?? 'VAD user'} · {activeTicket.category.replaceAll('_', ' ')}</VadText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <VadChip label={activeTicket.status.replaceAll('_', ' ')} tone={statusTone(activeTicket.status)} />
            <VadChip label={activeTicket.priority} tone={activeTicket.priority === 'HIGH' ? 'no' : 'neutral'} />
          </View>
        </View>
        {density.phone ? <VadButton label="Close" size="small" variant="secondary" fullWidth={false} onPress={() => setConversationOpen(false)} /> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.border, paddingVertical: 9 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <VadIcon name="activity" size={15} tone="brand" />
          <VadText variant="caption" tone="secondary">{visibleMessages.length} messages</VadText>
        </View>
        <VadButton label="Refresh" size="small" variant="plain" fullWidth={false} onPress={() => void reloadTickets(activeTicket.id).catch(() => undefined)} leading={<VadIcon name="activity" size={14} />} />
      </View>
      <ScrollView style={{ maxHeight: density.phone ? 400 : 520, minHeight: 180 }} contentContainerStyle={{ gap: 11, paddingVertical: 4 }} keyboardShouldPersistTaps="handled">
        {visibleMessages.length ? visibleMessages.map((message) => {
          const isAgent = message.sender_role === 'ADMIN';
          return (
            <View key={message.id} style={{ alignItems: isAgent ? 'flex-end' : 'flex-start' }}>
              <View style={{ maxWidth: '94%', borderRadius: 15, borderTopLeftRadius: isAgent ? 15 : 5, borderTopRightRadius: isAgent ? 5 : 15, borderWidth: 1, borderColor: isAgent ? theme.colors.brandPrimary : theme.colors.border, backgroundColor: isAgent ? theme.colors.brandSoft : theme.colors.surfaceRaised, padding: 12, gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <VadText variant="caption" tone={isAgent ? 'brand' : 'secondary'}>{isAgent ? (message.sender_display_name || 'Support agent') : 'Customer'}</VadText>
                  <VadText variant="caption" tone="tertiary">· {new Date(message.created_at).toLocaleString()}</VadText>
                </View>
                <VadText style={{ lineHeight: 22 }}>{message.body}</VadText>
              </View>
            </View>
          );
        }) : (
          <View style={{ alignItems: 'center', gap: 8, padding: 16 }}>
            <ActivityIndicator color={theme.colors.brandPrimary} />
            <VadText variant="caption" tone="secondary">Loading conversation messages…</VadText>
          </View>
        )}
      </ScrollView>

      {activeTicket.status === 'CLOSED' ? (
        <VadCard variant="muted" style={{ gap: 5 }}>
          <VadText variant="bodyStrong">This ticket is closed</VadText>
          <VadText variant="caption" tone="secondary">Send a reply with In progress or Waiting user selected to reopen the conversation.</VadText>
        </VadCard>
      ) : null}
      <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 12, gap: 10 }}>
        <VadText variant="label">Reply & update status</VadText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {replyStatuses.map((status) => (
            <VadChip key={status} label={status.replaceAll('_', ' ')} selected={nextStatus === status} tone={nextStatus === status ? 'brand' : 'neutral'} onPress={() => setNextStatus(status)} />
          ))}
        </View>
        <VadInput
          label="Message to customer"
          value={reply}
          onChangeText={setReply}
          multiline
          numberOfLines={4}
          placeholder="Write a clear answer or the next steps the customer should take."
          hint="The customer will see this reply in their support conversation."
        />
        <VadButton label={working ? 'Sending reply…' : 'Send reply'} loading={working} disabled={working || !reply.trim()} onPress={() => void sendReply()} leading={<VadIcon name="reply" size={16} tone="inverse" />} />
      </View>
    </View>
  ) : (
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: 8, padding: 30, flex: 1 }}>
      <VadIcon name="lifeBuoy" size={28} tone="secondary" />
      <VadText variant="bodyStrong">Select a conversation</VadText>
      <VadText variant="caption" tone="secondary" style={{ textAlign: 'center' }}>Choose a ticket from the inbox to read the conversation and reply.</VadText>
    </View>
  );

  return (
    <AdminPermissionGate permissions={['support.read']}>
      <AdminRouteContainer>
        <View style={{ gap: density.phone ? 12 : theme.spacing.lg, paddingBottom: theme.spacing.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: theme.colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
              <VadIcon name="lifeBuoy" size={23} tone="brand" />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <VadText variant="label" tone="brand">ADMIN OPERATIONS</VadText>
              <VadText variant="title">Support workspace</VadText>
              <VadText variant="caption" tone="secondary">Customer conversations, AI handoffs and urgent reports in one queue.</VadText>
            </View>
            <VadButton label="Refresh" size="small" variant="secondary" fullWidth={false} loading={loading} disabled={loading} onPress={() => void reloadTickets().catch(() => undefined)} />
          </View>

          {notice ? <VadCard variant="muted"><VadText tone="yes">{notice}</VadText></VadCard> : null}
          {error ? <VadErrorState title="Support workspace issue" message={error} onRetry={() => { setError(null); void reloadTickets().catch(() => undefined); }} /> : null}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <MetricCard label="Open" value={openCount} tone="warning" />
            <MetricCard label="In progress" value={inProgressCount} tone="brand" />
            <MetricCard label="Waiting user" value={waitingCount} tone="neutral" />
            <MetricCard label="Urgent" value={highPriorityCount} tone="no" />
          </View>

          <View style={{ flexDirection: density.phone ? 'column' : 'row', alignItems: 'stretch', gap: 12 }}>
            <View style={{ flex: density.phone ? undefined : 0.95, minWidth: 0, gap: 10 }}>
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <VadText variant="heading" style={{ flex: 1 }}>Inbox</VadText>
                  <VadChip label={`${filteredTickets.length} shown`} tone="neutral" />
                </View>
                <View style={{ minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 13, backgroundColor: theme.colors.surface }}>
                  <VadIcon name="search" size={17} tone="secondary" />
                  <TextInput
                    accessibilityLabel="Search support conversations"
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search subject, email or message"
                    placeholderTextColor={theme.colors.textTertiary}
                    style={{ flex: 1, minWidth: 0, color: theme.colors.textPrimary, paddingVertical: 10, fontSize: 14 }}
                  />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingVertical: 2 }}>
                  {filters.map((value) => <VadChip key={value} label={value.replaceAll('_', ' ')} selected={filter === value} tone={filter === value ? 'brand' : 'neutral'} onPress={() => setFilter(value)} />)}
                </ScrollView>
              </View>

              {loading ? (
                <View style={{ minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <ActivityIndicator color={theme.colors.brandPrimary} />
                  <VadText variant="caption" tone="secondary">Loading your inbox…</VadText>
                </View>
              ) : filteredTickets.length ? (
                <View style={{ gap: 7 }}>
                  {filteredTickets.map((ticket) => {
                    const selected = ticket.id === activeTicketId;
                    return (
                      <Pressable key={ticket.id} accessibilityRole="button" onPress={() => void selectTicket(ticket.id)} style={({ pressed }) => ({ opacity: pressed ? 0.76 : 1 })}>
                        <VadCard variant={selected ? 'raised' : 'surface'} style={{ padding: density.phone ? 11 : 13, gap: 8, borderColor: selected ? theme.colors.brandPrimary : theme.colors.border, borderLeftWidth: selected ? 3 : 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                            <View style={{ width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceRaised }}>
                              <VadIcon name="account" size={16} tone={selected ? 'brand' : 'secondary'} />
                            </View>
                            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                              <VadText variant="bodyStrong" numberOfLines={2}>{ticket.subject}</VadText>
                              <VadText variant="caption" tone="secondary" numberOfLines={1}>{ticket.user_email ?? 'VAD customer'}</VadText>
                            </View>
                            <VadText variant="caption" tone="tertiary">{formatRelativeTime(ticket.last_message_at || ticket.updated_at)}</VadText>
                          </View>
                          {ticket.last_message ? <VadText variant="caption" tone="secondary" numberOfLines={2}>{ticket.last_message}</VadText> : null}
                          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                            <VadChip label={ticket.status.replaceAll('_', ' ')} tone={statusTone(ticket.status)} />
                            <VadChip label={ticket.priority} tone={ticket.priority === 'HIGH' ? 'no' : 'neutral'} />
                            <VadText variant="caption" tone="tertiary">{ticket.category.replaceAll('_', ' ')}</VadText>
                          </View>
                        </VadCard>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <VadCard variant="muted" style={{ alignItems: 'center', padding: 20, gap: 7 }}>
                  <VadIcon name="search" size={23} tone="secondary" />
                  <VadText variant="bodyStrong">{search ? 'No matching conversations' : 'Inbox is clear'}</VadText>
                  <VadText variant="caption" tone="secondary" style={{ textAlign: 'center' }}>{search ? 'Try another search phrase or status filter.' : 'New customer requests will appear here when they arrive.'}</VadText>
                </VadCard>
              )}
            </View>

            {!density.phone ? (
              <VadCard variant="surface" style={{ flex: 1.25, minWidth: 0, padding: 15, gap: 12, borderColor: theme.colors.borderStrong }}>
                {conversationPanel}
              </VadCard>
            ) : null}
          </View>
        </View>

        <Modal visible={Boolean(density.phone && conversationOpen && activeTicket)} transparent animationType="slide" onRequestClose={() => setConversationOpen(false)}>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.58)' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close conversation" onPress={() => setConversationOpen(false)} style={{ flex: 1 }} />
            <View style={{ maxHeight: '90%', padding: 14, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
              <View style={{ alignItems: 'center', paddingBottom: 10 }}><View style={{ width: 38, height: 4, borderRadius: 4, backgroundColor: theme.colors.border }} /></View>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 20 }}>
                {conversationPanel}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </AdminRouteContainer>
    </AdminPermissionGate>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: 'warning' | 'brand' | 'neutral' | 'no' }) {
  const theme = useVadTheme();
  const color = tone === 'warning' ? theme.colors.warning : tone === 'no' ? theme.colors.no : tone === 'brand' ? theme.colors.brandPrimary : theme.colors.textSecondary;
  return (
    <View style={{ flexGrow: 1, flexBasis: 110, minWidth: 85, paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, backgroundColor: theme.colors.surface, gap: 4 }}>
      <VadText variant="caption" tone="secondary">{label}</VadText>
      <VadText variant="heading" style={{ color }}>{value.toLocaleString()}</VadText>
    </View>
  );
}

function statusTone(status: SupportStatus): 'warning' | 'brand' | 'yes' | 'neutral' {
  if (status === 'OPEN') return 'warning';
  if (status === 'IN_PROGRESS') return 'brand';
  if (status === 'RESOLVED' || status === 'CLOSED') return 'yes';
  return 'neutral';
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return date.toLocaleDateString();
}
