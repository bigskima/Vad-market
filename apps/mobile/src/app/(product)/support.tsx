import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { ProductRoute } from '@/features/navigation/product-route';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import { useProductDataContext } from '@/providers/product-data-provider';
import {
  createSupportTicket,
  getSupportMessages,
  listMySupportTickets,
  sendSupportMessage,
  type SupportCategory,
  type SupportMessage,
  type SupportTicket,
} from '@/services/support-api';
import {
  getAssistantThread,
  sendAssistantMessage,
  type AssistantAction,
  type AssistantMessageRow,
} from '@/services/user-assistant-api';

type SupportChatMessage = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
  actions?: AssistantAction[];
};

type SupportTab = 'AI' | 'REQUESTS';

const categories: { code: SupportCategory; label: string; icon: 'account' | 'wallet' | 'markets' | 'shieldCheck' | 'lifeBuoy' }[] = [
  { code: 'ACCOUNT', label: 'Account & verification', icon: 'account' },
  { code: 'WALLET', label: 'Deposits & withdrawals', icon: 'wallet' },
  { code: 'TRADING', label: 'Markets & trading', icon: 'markets' },
  { code: 'MARKET_RESOLUTION', label: 'Market result or dispute', icon: 'shieldCheck' },
  { code: 'BUG_REPORT', label: 'Technical problem', icon: 'lifeBuoy' },
  { code: 'GENERAL', label: 'Something else', icon: 'lifeBuoy' },
];

const starterQuestions: { label: string; prompt: string; category: SupportCategory }[] = [
  { label: 'Deposit is pending', prompt: 'My deposit is pending. Help me understand what to check and what information support may need.', category: 'WALLET' },
  { label: 'Withdrawal issue', prompt: 'I need help with a pending or failed withdrawal. Please guide me through the safe checks.', category: 'WALLET' },
  { label: 'Account verification', prompt: 'I need help with account verification or KYC.', category: 'ACCOUNT' },
  { label: 'A market or trade issue', prompt: 'I need help with a market or trade on VAD.', category: 'TRADING' },
  { label: 'Market result dispute', prompt: 'I have a question or dispute about a market result or resolution.', category: 'MARKET_RESOLUTION' },
  { label: 'Something is not working', prompt: 'Something is not working properly in the VAD app. Help me troubleshoot it.', category: 'BUG_REPORT' },
];

function welcomeMessage(): SupportChatMessage {
  return {
    id: 'support-welcome',
    role: 'ASSISTANT',
    createdAt: new Date().toISOString(),
    content: 'Hi! I’m VAD Support AI. Tell me what happened and I’ll try to help you resolve it first. For anything that needs an account-specific check or a human decision, I can pass the conversation to our support team.',
  };
}

export default function SupportScreen() {
  const theme = useVadTheme();
  const density = useProductDensity();
  const productData = useProductDataContext();
  const params = useLocalSearchParams<{ supportThread?: string }>();
  const routeThreadId = Array.isArray(params.supportThread) ? params.supportThread[0] : params.supportThread;
  const [tab, setTab] = useState<SupportTab>('AI');
  const [chatMessages, setChatMessages] = useState<SupportChatMessage[]>([welcomeMessage()]);
  const [aiThreadId, setAiThreadId] = useState<string | null>(routeThreadId ?? null);
  const [chatInput, setChatInput] = useState('');
  const [aiSending, setAiSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<SupportCategory>('GENERAL');
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffSubject, setHandoffSubject] = useState('');
  const [handoffBusy, setHandoffBusy] = useState(false);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [ticketMessages, setTicketMessages] = useState<SupportMessage[]>([]);
  const [ticketMessagesId, setTicketMessagesId] = useState<string | null>(null);
  const [ticketReply, setTicketReply] = useState('');
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeTicket = tickets.find((ticket) => ticket.id === activeTicketId) ?? null;
  const visibleTicketMessages = ticketMessagesId === activeTicketId ? ticketMessages : [];
  const hasUserAsked = chatMessages.some((message) => message.role === 'USER');
  const hasAiReplied = chatMessages.some((message) => message.role === 'ASSISTANT' && message.id !== 'support-welcome');
  const latestUserMessage = [...chatMessages].reverse().find((message) => message.role === 'USER')?.content ?? '';
  const resolvedSubject = handoffSubject.trim() || subjectFromMessage(latestUserMessage);

  const sortedTickets = useMemo(
    () => [...tickets].sort((a, b) => Date.parse(b.last_message_at || b.updated_at) - Date.parse(a.last_message_at || a.updated_at)),
    [tickets],
  );

  const refreshTickets = useCallback(async (preferredId?: string | null) => {
    const rows = await listMySupportTickets();
    setTickets(rows);
    const target = preferredId ?? activeTicketId;
    const selected = rows.find((ticket) => ticket.id === target) ?? rows[0] ?? null;
    setActiveTicketId(selected?.id ?? null);
    if (!selected) {
      setTicketMessages([]);
      setTicketMessagesId(null);
    }
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
      .catch((reason: unknown) => {
        if (active) setTicketError(reason instanceof Error ? reason.message : 'Your support requests could not be loaded.');
      })
      .finally(() => { if (active) setTicketsLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!routeThreadId) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (active) setAiLoading(true);
      return getAssistantThread(routeThreadId);
    })
      .then((rows) => {
        if (!active) return;
        setAiThreadId(routeThreadId);
        const restored = rows.map(toSupportChatMessage);
        setChatMessages(restored.length ? restored : [welcomeMessage()]);
      })
      .catch((reason: unknown) => {
        if (active) setAiError(reason instanceof Error ? reason.message : 'This AI support conversation could not be reopened.');
      })
      .finally(() => { if (active) setAiLoading(false); });
    return () => { active = false; };
  }, [routeThreadId]);

  useEffect(() => {
    if (!activeTicketId) return;
    let active = true;
    void getSupportMessages(activeTicketId)
      .then((rows) => {
        if (active) {
          setTicketMessages(rows);
          setTicketMessagesId(activeTicketId);
        }
      })
      .catch((reason: unknown) => {
        if (active) setTicketError(reason instanceof Error ? reason.message : 'The support conversation could not be loaded.');
      });
    return () => { active = false; };
  }, [activeTicketId]);

  async function sendToAi(value = chatInput) {
    const message = value.trim();
    if (!message || aiSending || message.length > 2000) return;
    const optimisticId = `support-user-${Date.now()}`;
    const optimistic: SupportChatMessage = {
      id: optimisticId,
      role: 'USER',
      content: message,
      createdAt: new Date().toISOString(),
    };
    setChatMessages((current) => [...current, optimistic]);
    setChatInput('');
    setAiSending(true);
    setAiError(null);
    setNotice(null);
    try {
      const response = await sendAssistantMessage({
        message,
        threadId: aiThreadId,
        route: '/support',
        activeAssetCodes: productData.activeAssetCodes,
        countryCode: productData.countryCode,
        mode: 'SUPPORT',
      });
      setAiThreadId(response.threadId);
      router.setParams({ supportThread: response.threadId });
      setChatMessages((current) => [
        ...current,
        {
          id: response.messageId,
          role: 'ASSISTANT',
          content: response.answer,
          createdAt: new Date().toISOString(),
          actions: response.actions,
        },
      ]);
      setSelectedCategory(categoryFromText(message, selectedCategory));
    } catch (reason) {
      setChatMessages((current) => current.filter((item) => item.id !== optimisticId));
      setChatInput(message);
      setAiError(reason instanceof Error ? reason.message : 'VAD Support AI could not answer. Please try again.');
    } finally {
      setAiSending(false);
    }
  }

  function startNewAiConversation() {
    setAiThreadId(null);
    setChatMessages([welcomeMessage()]);
    setChatInput('');
    setAiError(null);
    router.setParams({ supportThread: undefined });
  }

  async function handOffToHuman() {
    if (handoffBusy || !resolvedSubject || resolvedSubject.length < 5) {
      setTicketError('Enter a short subject so the support team can identify your issue.');
      return;
    }
    setHandoffBusy(true);
    setTicketError(null);
    setNotice(null);
    try {
      const transcript = chatMessages
        .filter((message) => message.role === 'USER' || (message.role === 'ASSISTANT' && message.id !== 'support-welcome'))
        .slice(-10)
        .map((message) => `${message.role === 'USER' ? 'Customer' : 'VAD AI Support'}: ${message.content}`)
        .join('\n\n')
        .slice(-4700);
      const message = [
        'Human support requested after AI-first troubleshooting.',
        `Category: ${categories.find((item) => item.code === selectedCategory)?.label ?? 'General'}.`,
        'Please review the customer conversation below before asking them to repeat information.',
        '',
        'Conversation transcript:',
        transcript || latestUserMessage,
      ].join('\n');
      const id = await createSupportTicket({
        subject: resolvedSubject.slice(0, 160),
        message: message.slice(0, 5900),
        category: selectedCategory,
      });
      setHandoffOpen(false);
      setHandoffSubject('');
      await refreshTickets(id);
      setTab('REQUESTS');
      setNotice('Your conversation has been passed to the VAD support team. They can continue from the transcript above.');
      setTicketError(null);
    } catch (reason) {
      setTicketError(reason instanceof Error ? reason.message : 'Your conversation could not be passed to a human agent.');
    } finally {
      setHandoffBusy(false);
    }
  }

  async function replyToHuman() {
    if (!activeTicket || ticketBusy || !ticketReply.trim()) return;
    setTicketBusy(true);
    setTicketError(null);
    setNotice(null);
    try {
      await sendSupportMessage(activeTicket.id, ticketReply);
      setTicketReply('');
      const rows = await getSupportMessages(activeTicket.id);
      setTicketMessages(rows);
      setTicketMessagesId(activeTicket.id);
      await refreshTickets(activeTicket.id);
      setNotice('Reply sent to VAD Support.');
    } catch (reason) {
      setTicketError(reason instanceof Error ? reason.message : 'Your reply could not be sent.');
    } finally {
      setTicketBusy(false);
    }
  }

  return (
    <ProductRoute active="Account" hideTopBar>
      <View style={{ gap: density.phone ? 12 : theme.spacing.lg, paddingBottom: theme.spacing.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={({ pressed }) => ({
              width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
              backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <VadIcon name="back" size={18} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <VadText variant="title">Help Centre</VadText>
            <VadText variant="caption" tone="secondary">AI first. A human when you need one.</VadText>
          </View>
          <VadButton
            label={`My requests${tickets.length ? ` (${tickets.length})` : ''}`}
            size="small"
            variant={tab === 'REQUESTS' ? 'primary' : 'secondary'}
            onPress={() => { setTab('REQUESTS'); setNotice(null); }}
          />
        </View>

        <View style={{
          borderRadius: 22,
          overflow: 'hidden',
          padding: density.phone ? 16 : 22,
          gap: 12,
          backgroundColor: theme.colors.brandSoft,
          borderWidth: 1,
          borderColor: theme.colors.brandPrimary,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandPrimary }}>
              <VadIcon name="lifeBuoy" size={22} tone="inverse" />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <VadText variant="heading">VAD Support</VadText>
                <VadChip label="AI assistant" tone="brand" />
              </View>
              <VadText variant="caption" tone="secondary">Get a quick answer, or ask our team to take over.</VadText>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <VadIcon name="shieldCheck" size={15} tone="brand" />
            <VadText variant="caption" tone="secondary">Never share passwords, OTPs or wallet recovery phrases.</VadText>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 7 }}>
          <View style={{ flex: 1 }}>
            <VadButton label="AI help" size="small" variant={tab === 'AI' ? 'primary' : 'secondary'} onPress={() => setTab('AI')} />
          </View>
          <View style={{ flex: 1 }}>
            <VadButton label={`Human requests · ${tickets.length}`} size="small" variant={tab === 'REQUESTS' ? 'primary' : 'secondary'} onPress={() => setTab('REQUESTS')} />
          </View>
        </View>

        {notice ? (
          <VadCard variant="muted" style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <VadIcon name="shieldCheck" tone="yes" size={18} />
            <View style={{ flex: 1 }}>
              <VadText>{notice}</VadText>
            </View>
          </VadCard>
        ) : null}

        {tab === 'AI' ? (
          <View style={{ gap: theme.spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <VadText variant="heading">How can we help?</VadText>
                <VadText variant="caption" tone="secondary">Choose a common issue or explain it in your own words.</VadText>
              </View>
              <VadButton label="New chat" variant="secondary" size="small" fullWidth={false} onPress={startNewAiConversation} />
            </View>

            {!hasUserAsked ? (
              <View style={{ gap: 8 }}>
                {starterQuestions.map((item) => (
                  <Pressable
                    key={item.label}
                    accessibilityRole="button"
                    disabled={aiSending}
                    onPress={() => { setSelectedCategory(item.category); void sendToAi(item.prompt); }}
                    style={({ pressed }) => ({
                      minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, paddingVertical: 10,
                      borderWidth: 1, borderColor: theme.colors.border, borderRadius: 15, backgroundColor: theme.colors.surface,
                      opacity: aiSending ? 0.55 : pressed ? 0.75 : 1,
                    })}
                  >
                    <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceRaised }}>
                      <VadIcon name={item.category === 'WALLET' ? 'wallet' : item.category === 'ACCOUNT' ? 'account' : item.category === 'TRADING' ? 'markets' : item.category === 'MARKET_RESOLUTION' ? 'shieldCheck' : 'lifeBuoy'} size={17} tone="brand" />
                    </View>
                    <VadText variant="bodyStrong" style={{ flex: 1 }}>{item.label}</VadText>
                    <VadIcon name="chevronRight" size={16} tone="secondary" />
                  </Pressable>
                ))}
              </View>
            ) : null}

            <VadCard variant="raised" style={{ gap: 12, padding: density.phone ? 12 : 16 }}>
              <ScrollView
                style={{ maxHeight: density.phone ? 430 : 560 }}
                contentContainerStyle={{ gap: 11, paddingVertical: 2 }}
                keyboardShouldPersistTaps="handled"
              >
                {aiLoading ? (
                  <View style={{ padding: 18, alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator color={theme.colors.brandPrimary} />
                    <VadText variant="caption" tone="secondary">Restoring your conversation…</VadText>
                  </View>
                ) : null}
                {chatMessages.map((message) => (
                  <View key={message.id} style={{ alignItems: message.role === 'USER' ? 'flex-end' : 'flex-start' }}>
                    <View style={{
                      maxWidth: message.role === 'USER' ? '90%' : '100%',
                      width: message.role === 'USER' ? 'auto' : '100%',
                      padding: 12, gap: 7, borderRadius: 16, borderWidth: 1,
                      borderColor: message.role === 'USER' ? theme.colors.brandPrimary : theme.colors.border,
                      backgroundColor: message.role === 'USER' ? theme.colors.brandSoft : theme.colors.surfaceRaised,
                    }}>
                      {message.role === 'ASSISTANT' ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                          <View style={{ width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandPrimary }}>
                            <VadIcon name="lifeBuoy" size={14} tone="inverse" />
                          </View>
                          <VadText variant="caption" tone="brand">VAD AI SUPPORT</VadText>
                        </View>
                      ) : null}
                      <VadText style={{ lineHeight: 22 }}>{message.content}</VadText>
                      {message.actions?.length ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {message.actions.map((action) => (
                            <VadButton key={action.route + action.label} label={action.label} size="small" variant="secondary" fullWidth={false} onPress={() => router.push(action.route as never)} />
                          ))}
                        </View>
                      ) : null}
                      <VadText variant="caption" tone="tertiary">{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</VadText>
                    </View>
                  </View>
                ))}
                {aiSending ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 9 }}>
                    <ActivityIndicator color={theme.colors.brandPrimary} />
                    <VadText variant="caption" tone="secondary">VAD AI is checking how to help…</VadText>
                  </View>
                ) : null}
              </ScrollView>
              <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 10 }}>
                <TextInput
                  accessibilityLabel="Message VAD Support AI"
                  value={chatInput}
                  onChangeText={setChatInput}
                  editable={!aiSending}
                  multiline
                  maxLength={2000}
                  placeholder="Describe what happened…"
                  placeholderTextColor={theme.colors.textTertiary}
                  selectionColor={theme.colors.brandPrimary}
                  textAlignVertical="top"
                  style={{
                    minHeight: 56, maxHeight: 140, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border,
                    backgroundColor: theme.colors.background, color: theme.colors.textPrimary, padding: 12, fontSize: 15, lineHeight: 21,
                  }}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <VadText variant="caption" tone="tertiary" style={{ flex: 1 }}>{chatInput.length}/2000</VadText>
                  <VadButton label="Send message" size="small" fullWidth={false} loading={aiSending} disabled={!chatInput.trim() || aiSending} leading={<VadIcon name="reply" size={14} tone="inverse" />} onPress={() => void sendToAi()} />
                </View>
              </View>
            </VadCard>

            {hasAiReplied ? (
              <VadCard variant="muted" style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <VadIcon name="lifeBuoy" size={18} tone="brand" />
                  <VadText variant="bodyStrong" style={{ flex: 1 }}>Still need help?</VadText>
                </View>
                <VadText variant="caption" tone="secondary">Pass this chat to a human agent. Your recent AI conversation will be included so you do not have to explain everything again.</VadText>
                <VadButton label="Talk to a human agent" variant="secondary" onPress={() => { setHandoffSubject(subjectFromMessage(latestUserMessage)); setTicketError(null); setHandoffOpen(true); }} leading={<VadIcon name="lifeBuoy" size={16} />} />
              </VadCard>
            ) : null}

            {aiError ? <VadErrorState title="AI support could not reply" message={aiError} onRetry={() => void sendToAi(chatInput)} /> : null}
          </View>
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            <View style={{ gap: 2 }}>
              <VadText variant="heading">Your support requests</VadText>
              <VadText variant="caption" tone="secondary">A human agent can pick up where your AI conversation ended.</VadText>
            </View>
            {ticketError ? <VadErrorState title="Support requests" message={ticketError} onRetry={() => void refreshTickets().catch((reason: unknown) => setTicketError(reason instanceof Error ? reason.message : 'Refresh failed.'))} /> : null}
            {ticketsLoading ? (
              <View style={{ alignItems: 'center', padding: 22, gap: 8 }}>
                <ActivityIndicator color={theme.colors.brandPrimary} />
                <VadText variant="caption" tone="secondary">Loading support requests…</VadText>
              </View>
            ) : sortedTickets.length ? (
              <View style={{ gap: 8 }}>
                {sortedTickets.map((ticket) => (
                  <Pressable key={ticket.id} accessibilityRole="button" onPress={() => { setActiveTicketId(ticket.id); setTicketError(null); }} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
                    <VadCard variant={ticket.id === activeTicketId ? 'raised' : 'surface'} style={{ gap: 7, borderColor: ticket.id === activeTicketId ? theme.colors.brandPrimary : theme.colors.border }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
                        <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceRaised }}>
                          <VadIcon name={ticket.status === 'CLOSED' || ticket.status === 'RESOLVED' ? 'shieldCheck' : 'lifeBuoy'} tone={ticket.status === 'CLOSED' || ticket.status === 'RESOLVED' ? 'yes' : 'brand'} size={17} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                          <VadText variant="bodyStrong" numberOfLines={2}>{ticket.subject}</VadText>
                          <VadText variant="caption" tone="secondary" numberOfLines={1}>{ticket.category.replaceAll('_', ' ')} · Updated {new Date(ticket.last_message_at || ticket.updated_at).toLocaleDateString()}</VadText>
                        </View>
                        <VadIcon name="chevronRight" tone="secondary" size={16} />
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        <VadChip label={ticket.status.replaceAll('_', ' ')} tone={['RESOLVED', 'CLOSED'].includes(ticket.status) ? 'yes' : ticket.status === 'OPEN' ? 'warning' : 'brand'} />
                        <VadChip label={ticket.priority} tone={ticket.priority === 'HIGH' ? 'no' : 'neutral'} />
                      </View>
                      {ticket.last_message ? <VadText variant="caption" tone="secondary" numberOfLines={2}>{ticket.last_message}</VadText> : null}
                    </VadCard>
                  </Pressable>
                ))}
              </View>
            ) : (
              <VadCard variant="muted" style={{ alignItems: 'center', gap: 8, padding: 20 }}>
                <VadIcon name="lifeBuoy" size={26} tone="brand" />
                <VadText variant="bodyStrong">No human support requests yet</VadText>
                <VadText variant="caption" tone="secondary" style={{ textAlign: 'center' }}>Start with VAD Support AI. If it cannot fully resolve your issue, you can bring the conversation to a human agent.</VadText>
                <VadButton label="Start AI support" onPress={() => setTab('AI')} size="small" />
              </VadCard>
            )}

            {activeTicket ? (
              <VadCard variant="raised" style={{ gap: 11 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <VadText variant="caption" tone="brand">HUMAN SUPPORT CONVERSATION</VadText>
                    <VadText variant="heading">{activeTicket.subject}</VadText>
                    <VadText variant="caption" tone="secondary">{activeTicket.category.replaceAll('_', ' ')} · {activeTicket.status.replaceAll('_', ' ')}</VadText>
                  </View>
                  <VadButton label="Refresh" size="small" variant="secondary" fullWidth={false} onPress={() => void refreshTickets(activeTicket.id)} />
                </View>
                <ScrollView style={{ maxHeight: density.phone ? 350 : 460 }} contentContainerStyle={{ gap: 9, paddingVertical: 2 }}>
                  {visibleTicketMessages.map((message) => (
                    <View key={message.id} style={{ alignItems: message.sender_role === 'USER' ? 'flex-end' : 'flex-start' }}>
                      <View style={{ maxWidth: '94%', padding: 10, borderRadius: 13, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: message.sender_role === 'USER' ? theme.colors.brandSoft : theme.colors.surfaceRaised, gap: 4 }}>
                        <VadText variant="caption" tone="secondary">{message.sender_role === 'USER' ? 'You' : 'VAD Support'} · {new Date(message.created_at).toLocaleString()}</VadText>
                        <VadText>{message.body}</VadText>
                      </View>
                    </View>
                  ))}
                </ScrollView>
                {activeTicket.status !== 'CLOSED' ? (
                  <View style={{ gap: 8 }}>
                    <TextInput
                      accessibilityLabel="Reply to human support"
                      value={ticketReply}
                      onChangeText={setTicketReply}
                      multiline
                      maxLength={6000}
                      placeholder="Reply to your support agent…"
                      placeholderTextColor={theme.colors.textTertiary}
                      textAlignVertical="top"
                      style={{ minHeight: 56, maxHeight: 140, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.background, color: theme.colors.textPrimary, fontSize: 15, lineHeight: 21 }}
                    />
                    <VadButton label="Send reply" loading={ticketBusy} disabled={!ticketReply.trim() || ticketBusy} onPress={() => void replyToHuman()} />
                  </View>
                ) : (
                  <VadText variant="caption" tone="secondary">This request is closed. Start a new AI support chat if you need more help.</VadText>
                )}
              </VadCard>
            ) : null}
          </View>
        )}

        <Modal visible={handoffOpen} transparent animationType="slide" onRequestClose={() => setHandoffOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.58)' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close human support handoff" onPress={() => setHandoffOpen(false)} style={{ flex: 1 }} />
            <View style={{ maxHeight: '88%', backgroundColor: theme.colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: theme.colors.border, padding: 16, gap: 12 }}>
              <View style={{ alignItems: 'center' }}><View style={{ width: 40, height: 4, borderRadius: 4, backgroundColor: theme.colors.border }} /></View>
              <View style={{ gap: 3 }}>
                <VadText variant="heading">Talk to a human agent</VadText>
                <VadText variant="caption" tone="secondary">We will attach the recent AI conversation to the ticket for context.</VadText>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10 }}>
                <VadText variant="label">What is this about?</VadText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                  {categories.map((item) => <VadChip key={item.code} label={item.label} selected={selectedCategory === item.code} tone={selectedCategory === item.code ? 'brand' : 'neutral'} onPress={() => setSelectedCategory(item.code)} />)}
                </View>
                <VadText variant="label">Ticket subject</VadText>
                <TextInput
                  accessibilityLabel="Human support ticket subject"
                  value={handoffSubject}
                  onChangeText={setHandoffSubject}
                  maxLength={160}
                  placeholder="Briefly describe the issue"
                  placeholderTextColor={theme.colors.textTertiary}
                  style={{ minHeight: 48, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, backgroundColor: theme.colors.background, color: theme.colors.textPrimary, paddingHorizontal: 12, fontSize: 15 }}
                />
                {ticketError ? <VadErrorState title="Could not create the handoff" message={ticketError} /> : null}
                <VadButton label="Send conversation to support" loading={handoffBusy} disabled={handoffBusy || !resolvedSubject || resolvedSubject.length < 5} onPress={() => void handOffToHuman()} leading={<VadIcon name="lifeBuoy" size={16} tone="inverse" />} />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </ProductRoute>
  );
}

function toSupportChatMessage(row: AssistantMessageRow): SupportChatMessage {
  return {
    id: row.message_public_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

function subjectFromMessage(message: string) {
  const compact = message.replace(/\s+/g, ' ').trim();
  if (!compact) return 'Help needed with my VAD account';
  return compact.length > 118 ? compact.slice(0, 115).trimEnd() + '…' : compact;
}

function categoryFromText(message: string, fallback: SupportCategory): SupportCategory {
  const value = message.toLowerCase();
  if (/withdraw|deposit|fund|balance|wallet|payment/.test(value)) return 'WALLET';
  if (/kyc|verify|verification|login|password|account|profile/.test(value)) return 'ACCOUNT';
  if (/resolve|resolved|settle|settlement|result|oracle|dispute/.test(value)) return 'MARKET_RESOLUTION';
  if (/trade|market|order|position|price|pool/.test(value)) return 'TRADING';
  if (/bug|error|crash|not working|failed|failure/.test(value)) return 'BUG_REPORT';
  return fallback;
}
