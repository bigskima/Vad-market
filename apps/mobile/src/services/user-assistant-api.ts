import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type AssistantThreadRow = {
  thread_public_id: string;
  title: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  last_message: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AssistantMessageRow = {
  message_public_id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  created_at: string;
};

export type AssistantAction = {
  label: string;
  route: string;
};

export type AssistantReply = {
  threadId: string;
  messageId: string;
  answer: string;
  actions: AssistantAction[];
  notice: string | null;
};

function fail(
  error: { message: string; code?: string; details?: string; hint?: string } | null,
  fallback: string,
) {
  if (error) throw userFacingError(error, 'general', fallback);
}

export async function listAssistantThreads(limit = 20) {
  const { data, error } = await supabase.rpc('my_ai_assistant_threads', {
    p_limit: limit,
  });
  fail(error, 'We could not load your VAD Assistant conversations right now.');
  return (data ?? []) as AssistantThreadRow[];
}

export async function getAssistantThread(threadPublicId: string, limit = 60) {
  const { data, error } = await supabase.rpc('my_ai_assistant_thread', {
    p_thread_public_id: threadPublicId,
    p_limit: limit,
  });
  fail(error, 'We could not load this conversation right now.');
  return (data ?? []) as AssistantMessageRow[];
}

export async function archiveAssistantThread(threadPublicId: string) {
  const { data, error } = await supabase.rpc('archive_my_ai_assistant_thread', {
    p_thread_public_id: threadPublicId,
  });
  fail(error, 'We could not archive this conversation right now.');
  return Boolean(data);
}

export async function sendAssistantMessage(input: {
  message: string;
  threadId?: string | null;
  marketId?: string | null;
  route?: string | null;
}) {
  const { data, error } = await supabase.functions.invoke('user-assistant', {
    body: {
      message: input.message.trim(),
      threadId: input.threadId ?? null,
      marketId: input.marketId ?? null,
      route: input.route ?? '/assistant',
    },
  });

  if (error) {
    throw userFacingError(
      error,
      'general',
      'VAD Assistant could not answer right now. Please try again shortly.',
    );
  }

  const payload = data as Partial<AssistantReply> & {
    error?: string;
    message?: string;
  };
  if (payload.error || !payload.answer || !payload.threadId) {
    throw new Error(
      payload.message ??
        'VAD Assistant could not answer right now. Please try again shortly.',
    );
  }

  return {
    threadId: payload.threadId,
    messageId: payload.messageId ?? `assistant-${Date.now()}`,
    answer: payload.answer,
    actions: Array.isArray(payload.actions) ? payload.actions : [],
    notice: payload.notice ?? null,
  } as AssistantReply;
}
