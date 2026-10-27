import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { ProductRoute } from '@/features/navigation/product-route';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import {
  createSupportTicket,
  getSupportMessages,
  listMySupportTickets,
  sendSupportMessage,
  type SupportCategory,
  type SupportMessage,
  type SupportTicket,
} from '@/services/support-api';

const categories: Array<{ code: SupportCategory; label: string }> = [
  { code: 'GENERAL', label: 'General' },
  { code: 'TRADING', label: 'Trading' },
  { code: 'WALLET', label: 'Wallet' },
  { code: 'ACCOUNT', label: 'Account' },
  { code: 'MARKET_RESOLUTION', label: 'Market result' },
  { code: 'BUG_REPORT', label: 'Report a bug' },
  { code: 'SAFETY', label: 'Safety' },
];

export default function SupportScreen() {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [messagesTicketId, setMessagesTicketId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [composeNew, setComposeNew] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportCategory>('GENERAL');
  const [body, setBody] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeTicket = tickets.find((item) => item.id === activeTicketId) ?? null;
  const visibleMessages = messagesTicketId === activeTicketId ? messages : [];

  const reloadTickets = useCallback(async (preferredId?: string | null) => {
    const rows = await listMySupportTickets();
    setTickets(rows);
    const nextId = preferredId ?? activeTicketId;
    const selected = rows.find((row) => row.id === nextId) ?? rows[0] ?? null;
    setActiveTicketId(selected?.id ?? null);
    if (!selected) { setMessages([]); setMessagesTicketId(null); }
    return selected;
  }, [activeTicketId]);

  useEffect(() => {
    let active = true;
    void listMySupportTickets()
      .then((rows) => {
        if (!active) return;
        setTickets(rows);
        setActiveTicketId(rows[0]?.id ?? null);
      })
      .catch((value: unknown) => {
        if (active) setError(value instanceof Error ? value.message : 'Support requests could not be loaded.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!activeTicketId) return;
    let active = true;
    void getSupportMessages(activeTicketId)
      .then((rows) => { if (active) { setMessages(rows); setMessagesTicketId(activeTicketId); } })
      .catch((value: unknown) => { if (active) setError(value instanceof Error ? value.message : 'Conversation could not be loaded.'); });
    return () => { active = false; };
  }, [activeTicketId]);

  async function submitNewTicket() {
    if (working) return;
    if (subject.trim().length < 5) return setError('Enter a subject with at least 5 characters.');
    if (!body.trim()) return setError('Describe the question or issue you need help with.');
    setWorking(true); setError(null); setNotice(null);
    try {
      const id = await createSupportTicket({ subject, message: body, category });
      setSubject(''); setBody(''); setComposeNew(false);
      await reloadTickets(id);
      setNotice('Your request was sent. You can continue the conversation here.');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Your support request could not be sent.');
    } finally { setWorking(false); }
  }

  async function submitReply() {
    if (!activeTicket || working) return;
    if (!reply.trim()) return setError('Write a message before sending.');
    setWorking(true); setError(null); setNotice(null);
    try {
      await sendSupportMessage(activeTicket.id, reply);
      setReply('');
      setMessages(await getSupportMessages(activeTicket.id));
      setMessagesTicketId(activeTicket.id);
      await reloadTickets(activeTicket.id);
      setNotice('Reply sent.');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Your reply could not be sent.');
    } finally { setWorking(false); }
  }

  return (
    <ProductRoute active="Account" hideTopBar>
      <View style={{ gap: density.phone ? 12 : theme.spacing.lg, paddingBottom: theme.spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flex: 1, gap: 3 }}>
            <VadText variant="title">Help & Support</VadText>
            <VadText variant="caption" tone="secondary">Ask a question or report a problem. VAD Support replies here.</VadText>
          </View>
          <VadButton label="Back" size="small" variant="secondary" onPress={() => router.back()} />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <VadButton label={composeNew ? 'Cancel request' : 'New support request'} variant={composeNew ? 'secondary' : 'primary'} onPress={() => { setComposeNew((value) => !value); setError(null); setNotice(null); }} />
          <VadButton label="Refresh" variant="secondary" loading={loading} disabled={loading} onPress={() => { setLoading(true); void reloadTickets().catch((value: unknown) => setError(value instanceof Error ? value.message : 'Refresh failed.')).finally(() => setLoading(false)); }} />
        </View>

        {composeNew ? (
          <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
            <VadText variant="heading">Create support request</VadText>
            <VadInput label="Subject" value={subject} onChangeText={setSubject} placeholder="e.g. My order review fails" />
            <VadText variant="label">What do you need help with?</VadText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {categories.map((item) => <VadChip key={item.code} label={item.label} selected={category === item.code} tone={category === item.code ? 'brand' : 'neutral'} onPress={() => setCategory(item.code)} />)}
            </View>
            <VadInput label="Message" value={body} onChangeText={setBody} multiline numberOfLines={5} placeholder="Describe what happened and what you were trying to do." />
            <VadButton label={working ? 'Sending…' : 'Send request'} loading={working} disabled={working} onPress={() => void submitNewTicket()} />
          </VadCard>
        ) : null}

        {notice ? <VadCard variant="muted"><VadText tone="yes">{notice}</VadText></VadCard> : null}
        {error ? <VadErrorState title="Support could not complete this action" message={error} onRetry={() => { setError(null); void reloadTickets().catch((value: unknown) => setError(value instanceof Error ? value.message : 'Refresh failed.')); }} /> : null}

        <View style={{ gap: 8 }}>
          <VadText variant="heading">Your requests</VadText>
          {loading ? <VadText tone="secondary">Loading your requests…</VadText> : tickets.length ? (
            tickets.map((ticket) => (
              <VadCard key={ticket.id} variant={activeTicketId === ticket.id ? 'raised' : 'surface'} style={{ gap: 5, borderColor: activeTicketId === ticket.id ? theme.colors.brandPrimary : theme.colors.border }}>
                <VadButton label={ticket.subject} variant="plain" size="small" onPress={() => { setActiveTicketId(ticket.id); setComposeNew(false); setError(null); }} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  <VadChip label={ticket.status.replaceAll('_', ' ')} tone={ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' ? 'yes' : 'neutral'} />
                  <VadChip label={ticket.category.replaceAll('_', ' ')} tone="neutral" />
                </View>
                {ticket.last_message ? <VadText variant="caption" tone="secondary">{ticket.last_message}</VadText> : null}
              </VadCard>
            ))
          ) : <VadCard variant="muted" style={{ gap: 5 }}><VadText variant="bodyStrong">No requests yet</VadText><VadText variant="caption" tone="secondary">Create a request and our support team can reply here.</VadText></VadCard>}
        </View>

        {activeTicket && !composeNew ? (
          <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
            <View style={{ gap: 4 }}>
              <VadText variant="label" tone="brand">SUPPORT CONVERSATION</VadText>
              <VadText variant="heading">{activeTicket.subject}</VadText>
              <VadText variant="caption" tone="secondary">{activeTicket.category.replaceAll('_', ' ')} · {activeTicket.status.replaceAll('_', ' ')}</VadText>
            </View>
            <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 9 }}>
              {visibleMessages.map((message) => (
                <View key={message.id} style={{ alignSelf: message.sender_role === 'USER' ? 'flex-end' : 'flex-start', maxWidth: '92%', padding: 10, gap: 4, borderRadius: 12, backgroundColor: message.sender_role === 'USER' ? theme.colors.brandSoft : theme.colors.surfaceMuted, borderWidth: 1, borderColor: theme.colors.border }}>
                  <VadText variant="caption" tone="secondary">{message.sender_role === 'USER' ? 'You' : 'VAD Support'} · {new Date(message.created_at).toLocaleString()}</VadText>
                  <VadText>{message.body}</VadText>
                </View>
              ))}
            </ScrollView>
            {activeTicket.status !== 'CLOSED' ? (
              <>
                <VadInput label="Reply" value={reply} onChangeText={setReply} multiline numberOfLines={3} placeholder="Add more details or reply to support." />
                <VadButton label={working ? 'Sending…' : 'Send reply'} loading={working} disabled={working} onPress={() => void submitReply()} />
              </>
            ) : <VadText variant="caption" tone="secondary">This request is closed. Create a new request if you still need help.</VadText>}
          </VadCard>
        ) : null}
      </View>
    </ProductRoute>
  );
}
