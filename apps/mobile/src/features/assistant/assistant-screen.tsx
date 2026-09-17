import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadIcon } from '@/components/ui/vad-icon';
import { VadIconButton } from '@/components/ui/vad-icon-button';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import {
  archiveAssistantThread,
  getAssistantThread,
  listAssistantThreads,
  sendAssistantMessage,
  type AssistantAction,
  type AssistantMessageRow,
  type AssistantThreadRow,
} from '@/services/user-assistant-api';

const STARTERS = [
  'How do probabilities work on VAD?',
  'Explain my wallet balance.',
  'How do my positions work?',
  'How does VAD resolve a market?',
  'Where can I find my open orders?',
  'Explain the difference between market price and final outcome.',
] as const;

type ChatMessage = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
  actions?: AssistantAction[];
  notice?: string | null;
};

export function AssistantScreen({
  initialMarketId = null,
  initialPrompt = '',
  sourceRoute = '/assistant',
}: {
  initialMarketId?: string | null;
  initialPrompt?: string;
  sourceRoute?: string;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [threads, setThreads] = useState<AssistantThreadRow[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(initialPrompt);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const loadThreads = useCallback(async () => {
    try {
      setThreads(await listAssistantThreads());
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'We could not load your VAD Assistant conversations right now.',
      );
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadThreads();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadThreads]);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.thread_public_id === threadId) ?? null,
    [threadId, threads],
  );

  async function openThread(nextThreadId: string) {
    setHistoryOpen(false);
    setThreadId(nextThreadId);
    setLoadingConversation(true);
    setError(null);
    try {
      const rows = await getAssistantThread(nextThreadId);
      setMessages(rows.map(toChatMessage));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'We could not load this conversation right now.',
      );
    } finally {
      setLoadingConversation(false);
    }
  }

  function newConversation() {
    setHistoryOpen(false);
    setThreadId(null);
    setMessages([]);
    setInput('');
    setError(null);
  }

  async function archiveCurrent() {
    if (!threadId) return;
    try {
      await archiveAssistantThread(threadId);
      newConversation();
      await loadThreads();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'We could not archive this conversation right now.',
      );
    }
  }

  async function send(value = input) {
    const message = value.trim();
    if (!message || sending) return;

    const optimistic: ChatMessage = {
      id: `user-${threadId ?? 'new'}-${messages.length}`,
      role: 'USER',
      content: message,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setInput('');
    setSending(true);
    setSuggestionsOpen(false);
    setError(null);

    try {
      const reply = await sendAssistantMessage({
        message,
        threadId,
        marketId: initialMarketId,
        route: sourceRoute,
      });
      setThreadId(reply.threadId);
      setMessages((current) => [
        ...current,
        {
          id: reply.messageId,
          role: 'ASSISTANT',
          content: reply.answer,
          createdAt: new Date().toISOString(),
          actions: reply.actions,
          notice: reply.notice,
        },
      ]);
      await loadThreads();
    } catch (reason) {
      setMessages((current) => current.filter((item) => item.id !== optimistic.id));
      setInput(message);
      setError(
        reason instanceof Error
          ? reason.message
          : 'VAD Assistant could not answer right now. Please try again shortly.',
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={{ gap: density.compact ? theme.spacing.md : theme.spacing.lg }}>
      <VadCard
        variant="raised"
        style={{
          minHeight: 70,
          flexDirection: density.narrow ? 'column' : 'row',
          alignItems: density.narrow ? 'stretch' : 'center',
          gap: theme.spacing.sm,
          padding: theme.spacing.md,
          borderColor: theme.colors.borderStrong,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flex: 1 }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brandPrimary }}>
            <VadText variant="bodyStrong" tone="inverse">V</VadText>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <VadText variant="bodyStrong">VAD Assistant</VadText>
              <VadChip label="AI" tone="brand" />
              {initialMarketId ? <VadChip label="Market context" tone="yes" /> : null}
            </View>
            <VadText variant="caption" tone="secondary" numberOfLines={2}>
              Ask about markets, positions, wallet activity, settlement or how to use VAD.
            </VadText>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: density.narrow ? 'flex-end' : undefined }}>
          <VadIconButton icon="activity" label="Conversation history" variant="plain" size={42} onPress={() => setHistoryOpen(true)} />
          <VadIconButton icon="plus" label="New conversation" variant="plain" size={42} onPress={newConversation} />
        </View>
      </VadCard>

      <VadCard variant="brand" style={{ gap: theme.spacing.sm, padding: theme.spacing.md, borderColor: theme.colors.brandPrimary }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
          <View style={{ flex: 1, gap: 1 }}>
            <VadText variant="caption" tone="brand">SUGGESTED QUESTIONS</VadText>
            <VadText variant="caption" tone="secondary">Start with one tap, or write your own question below.</VadText>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSuggestionsOpen(true)}
            style={({ pressed }) => ({
              minHeight: 36,
              justifyContent: 'center',
              paddingHorizontal: 10,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.surface,
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <VadText variant="caption" tone="brand">More</VadText>
          </Pressable>
        </View>
        <View style={{ gap: 6 }}>
          {STARTERS.slice(0, 2).map((starter) => (
            <Suggestion key={starter} label={starter} disabled={sending} onPress={() => void send(starter)} />
          ))}
        </View>
      </VadCard>

      {error ? (
        <VadErrorState title="VAD Assistant needs a moment" message={error} onRetry={() => void loadThreads()} />
      ) : null}

      <View style={{ gap: theme.spacing.md }}>
        {activeThread ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <VadText variant="caption" tone="tertiary">CURRENT CONVERSATION</VadText>
              <VadText variant="bodyStrong" numberOfLines={1}>{activeThread.title || 'VAD conversation'}</VadText>
            </View>
            <VadButton label="Archive" variant="plain" size="small" fullWidth={false} onPress={() => void archiveCurrent()} />
          </View>
        ) : null}

        {loadingConversation ? (
          <View style={{ minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm }}>
            <ActivityIndicator color={theme.colors.brandPrimary} />
            <VadText variant="caption" tone="secondary">Opening conversation…</VadText>
          </View>
        ) : messages.length ? (
          <View style={{ gap: theme.spacing.sm }}>
            {messages.map((message) => <AssistantBubble key={message.id} message={message} />)}
          </View>
        ) : (
          <View style={{ minHeight: 170, alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: theme.spacing.lg }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
              <VadIcon name="activity" size={21} tone="brand" />
            </View>
            <VadText variant="heading" style={{ textAlign: 'center' }}>What do you want to understand?</VadText>
            <VadText variant="caption" tone="secondary" style={{ textAlign: 'center', maxWidth: 460 }}>
              VAD Assistant can explain what you are seeing, help you navigate the product and clarify market mechanics. It does not decide outcomes or guarantee returns.
            </VadText>
          </View>
        )}

        {sending ? (
          <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xs }}>
            <ActivityIndicator color={theme.colors.brandPrimary} />
            <VadText variant="caption" tone="secondary">VAD Assistant is thinking…</VadText>
          </View>
        ) : null}

        <VadCard variant="raised" style={{ gap: 8, padding: theme.spacing.sm, borderColor: theme.colors.borderStrong }}>
          <TextInput
            accessibilityLabel="Message VAD Assistant"
            value={input}
            onChangeText={setInput}
            editable={!sending}
            multiline
            maxLength={2000}
            placeholder="Ask VAD Assistant…"
            placeholderTextColor={theme.colors.textTertiary}
            selectionColor={theme.colors.brandPrimary}
            textAlignVertical="top"
            style={{
              minHeight: density.compact ? 58 : 66,
              maxHeight: 150,
              color: theme.colors.textPrimary,
              backgroundColor: theme.colors.background,
              borderRadius: theme.radius.lg,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: theme.spacing.sm,
              fontSize: 15,
              lineHeight: 22,
            }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <VadText variant="caption" tone="tertiary" style={{ flex: 1 }}>{input.length}/2000</VadText>
            <VadButton label="Send" size="small" fullWidth={false} loading={sending} disabled={!input.trim() || sending} onPress={() => void send()} />
          </View>
        </VadCard>
      </View>

      <VadBottomSheet visible={historyOpen} title="Conversation history" onClose={() => setHistoryOpen(false)}>
        <View style={{ gap: theme.spacing.sm }}>
          <VadButton label="New conversation" variant="secondary" onPress={newConversation} />
          {loadingThreads ? (
            <View style={{ minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <ActivityIndicator color={theme.colors.brandPrimary} />
              <VadText variant="caption" tone="secondary">Loading conversations…</VadText>
            </View>
          ) : threads.length ? (
            threads.slice(0, 20).map((thread) => (
              <Pressable
                key={thread.thread_public_id}
                accessibilityRole="button"
                accessibilityState={{ selected: thread.thread_public_id === threadId }}
                onPress={() => void openThread(thread.thread_public_id)}
                style={({ pressed }) => ({
                  minHeight: 58,
                  paddingVertical: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.border,
                  opacity: pressed ? 0.68 : 1,
                })}
              >
                <VadText variant="bodyStrong" tone={thread.thread_public_id === threadId ? 'brand' : 'primary'} numberOfLines={1}>
                  {thread.title || 'VAD conversation'}
                </VadText>
                <VadText variant="caption" tone="secondary" numberOfLines={1}>
                  {thread.last_message || 'Open this conversation'}
                </VadText>
              </Pressable>
            ))
          ) : (
            <VadText variant="caption" tone="secondary">Your VAD Assistant conversations will appear here.</VadText>
          )}
        </View>
      </VadBottomSheet>

      <VadBottomSheet visible={suggestionsOpen} title="Suggested questions" onClose={() => setSuggestionsOpen(false)}>
        <View style={{ gap: 7 }}>
          {STARTERS.map((starter) => (
            <Suggestion key={starter} label={starter} disabled={sending} onPress={() => void send(starter)} />
          ))}
        </View>
      </VadBottomSheet>
    </View>
  );
}

function Suggestion({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
      })}
    >
      <VadIcon name="activity" size={15} tone="brand" />
      <VadText variant="caption" style={{ flex: 1 }}>{label}</VadText>
      <VadIcon name="chevronRight" size={14} tone="tertiary" />
    </Pressable>
  );
}

function AssistantBubble({ message }: { message: ChatMessage }) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const user = message.role === 'USER';
  return (
    <View style={{ alignItems: user ? 'flex-end' : 'flex-start' }}>
      <View
        style={{
          width: user ? (density.phone ? '88%' : '74%') : '100%',
          maxWidth: user ? 600 : 760,
          borderWidth: 1,
          borderColor: user ? theme.colors.brandPrimary : theme.colors.border,
          borderRadius: theme.radius.xl,
          backgroundColor: user ? theme.colors.brandSoft : theme.colors.surfaceRaised,
          padding: theme.spacing.md,
          gap: theme.spacing.sm,
        }}
      >
        {!user ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: theme.colors.brandPrimary, alignItems: 'center', justifyContent: 'center' }}>
              <VadText variant="caption" tone="inverse">V</VadText>
            </View>
            <VadText variant="caption" tone="brand">VAD ASSISTANT</VadText>
          </View>
        ) : null}
        <VadText style={{ lineHeight: 23 }}>{message.content}</VadText>
        {message.notice ? <VadText variant="caption" tone="warning">{message.notice}</VadText> : null}
        {message.actions?.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            {message.actions.map((action) => (
              <VadButton
                key={`${message.id}-${action.route}`}
                label={action.label}
                size="small"
                variant="secondary"
                fullWidth={false}
                onPress={() => router.push(action.route as never)}
              />
            ))}
          </View>
        ) : null}
        <VadText variant="caption" tone="tertiary">{formatMessageTime(message.createdAt)}</VadText>
      </View>
    </View>
  );
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

function toChatMessage(row: AssistantMessageRow): ChatMessage {
  return {
    id: row.message_public_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}
