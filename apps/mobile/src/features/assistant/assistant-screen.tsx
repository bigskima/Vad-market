import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
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
];

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
      id: `user-${Date.now()}`,
      role: 'USER',
      content: message,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setInput('');
    setSending(true);
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
    <View style={{ gap: theme.spacing.lg }}>
      <VadCard
        variant="brand"
        style={{
          gap: theme.spacing.md,
          padding: density.phone ? theme.spacing.lg : theme.spacing.xl,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.brandPrimary,
            }}
          >
            <VadText variant="heading" tone="inverse">V</VadText>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <VadText variant="caption" tone="brand">VAD ASSISTANT</VadText>
            <VadText variant="title">Ask about VAD</VadText>
            <VadText variant="caption" tone="secondary">
              Markets, your wallet, positions, fees, settlement, navigation and VAD terminology.
            </VadText>
          </View>
        </View>

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            paddingTop: theme.spacing.sm,
            gap: 2,
          }}
        >
          <VadText variant="caption" tone="warning">IMPORTANT</VadText>
          <VadText variant="caption" tone="secondary">
            VAD Assistant explains information. It does not decide market outcomes and it cannot guarantee returns.
          </VadText>
        </View>

        {initialMarketId ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            <VadChip label="Current market included" tone="brand" />
            <VadText variant="caption" tone="secondary">
              Questions can use the market you opened as context.
            </VadText>
          </View>
        ) : null}
      </VadCard>

      {error ? (
        <VadErrorState
          title="VAD Assistant needs a moment"
          message={error}
          onRetry={() => void loadThreads()}
        />
      ) : null}

      <View
        style={{
          flexDirection: density.desktop ? 'row' : 'column',
          gap: theme.spacing.lg,
          alignItems: 'flex-start',
        }}
      >
        <View
          style={{
            width: density.desktop ? 250 : '100%',
            gap: theme.spacing.sm,
          }}
        >
          <VadButton label="New conversation" variant="secondary" onPress={newConversation} />

          {loadingThreads ? (
            <VadText variant="caption" tone="secondary">Loading conversations…</VadText>
          ) : threads.length ? (
            <View style={{ gap: theme.spacing.xs }}>
              <VadText variant="caption" tone="tertiary">RECENT CONVERSATIONS</VadText>
              {threads.slice(0, density.desktop ? 12 : 5).map((thread) => (
                <Pressable
                  key={thread.thread_public_id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: thread.thread_public_id === threadId }}
                  onPress={() => void openThread(thread.thread_public_id)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
                >
                  <VadCard
                    variant={thread.thread_public_id === threadId ? 'brand' : 'raised'}
                    style={{ gap: 3, padding: theme.spacing.md }}
                  >
                    <VadText variant="bodyStrong" numberOfLines={1}>
                      {thread.title || 'VAD conversation'}
                    </VadText>
                    <VadText variant="caption" tone="secondary" numberOfLines={2}>
                      {thread.last_message || 'Open this conversation'}
                    </VadText>
                  </VadCard>
                </Pressable>
              ))}
            </View>
          ) : (
            <VadText variant="caption" tone="secondary">
              Your VAD Assistant conversations will appear here.
            </VadText>
          )}

          {activeThread ? (
            <VadButton label="Archive conversation" variant="plain" onPress={() => void archiveCurrent()} />
          ) : null}
        </View>

        <View style={{ flex: 1, width: density.desktop ? undefined : '100%', gap: theme.spacing.md }}>
          {!messages.length && !loadingConversation ? (
            <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
              <View style={{ gap: 3 }}>
                <VadText variant="heading">What would you like to understand?</VadText>
                <VadText variant="caption" tone="secondary">
                  Try one of these, or ask in your own words.
                </VadText>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                {STARTERS.map((starter) => (
                  <Pressable
                    key={starter}
                    accessibilityRole="button"
                    onPress={() => void send(starter)}
                    style={({ pressed }) => ({
                      maxWidth: '100%',
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radius.pill,
                      backgroundColor: theme.colors.surfaceRaised,
                      paddingHorizontal: theme.spacing.md,
                      paddingVertical: theme.spacing.sm,
                      opacity: pressed ? 0.72 : 1,
                    })}
                  >
                    <VadText variant="caption">{starter}</VadText>
                  </Pressable>
                ))}
              </View>
            </VadCard>
          ) : null}

          {loadingConversation ? (
            <View style={{ minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm }}>
              <ActivityIndicator color={theme.colors.brandPrimary} />
              <VadText variant="caption" tone="secondary">Opening conversation…</VadText>
            </View>
          ) : (
            <View style={{ gap: theme.spacing.sm }}>
              {messages.map((message) => (
                <AssistantBubble key={message.id} message={message} />
              ))}
              {sending ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.sm }}>
                  <ActivityIndicator color={theme.colors.brandPrimary} />
                  <VadText variant="caption" tone="secondary">VAD Assistant is thinking…</VadText>
                </View>
              ) : null}
            </View>
          )}

          <VadCard variant="raised" style={{ gap: theme.spacing.sm, padding: theme.spacing.md }}>
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
                minHeight: 74,
                maxHeight: 160,
                color: theme.colors.textPrimary,
                backgroundColor: theme.colors.background,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.lg,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.md,
                fontSize: 15,
                lineHeight: 22,
              }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <VadText variant="caption" tone="tertiary" style={{ flex: 1 }}>
                {input.length}/2000
              </VadText>
              <VadButton
                label="Send"
                size="small"
                loading={sending}
                disabled={!input.trim() || sending}
                onPress={() => void send()}
              />
            </View>
          </VadCard>
        </View>
      </View>
    </View>
  );
}

function AssistantBubble({ message }: { message: ChatMessage }) {
  const theme = useVadTheme();
  const user = message.role === 'USER';
  return (
    <View style={{ alignItems: user ? 'flex-end' : 'flex-start' }}>
      <View
        style={{
          width: '100%',
          maxWidth: user ? 560 : 680,
          borderWidth: 1,
          borderColor: user ? theme.colors.brandPrimary : theme.colors.border,
          borderRadius: theme.radius.xl,
          backgroundColor: user ? theme.colors.brandSoft : theme.colors.surfaceRaised,
          padding: theme.spacing.md,
          gap: theme.spacing.sm,
        }}
      >
        <VadText variant="caption" tone={user ? 'brand' : 'secondary'}>
          {user ? 'YOU' : 'VAD ASSISTANT'}
        </VadText>
        <VadText style={{ lineHeight: 23 }}>{message.content}</VadText>
        {message.notice ? (
          <VadText variant="caption" tone="warning">{message.notice}</VadText>
        ) : null}
        {message.actions?.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            {message.actions.map((action) => (
              <VadButton
                key={`${message.id}-${action.route}`}
                label={action.label}
                size="small"
                variant="secondary"
                onPress={() => router.push(action.route as never)}
              />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function toChatMessage(row: AssistantMessageRow): ChatMessage {
  return {
    id: row.message_public_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}
