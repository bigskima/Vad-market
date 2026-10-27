import { userFacingError, type UserErrorContext } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type SupportCategory =
  | 'GENERAL'
  | 'TRADING'
  | 'WALLET'
  | 'ACCOUNT'
  | 'MARKET_RESOLUTION'
  | 'BUG_REPORT'
  | 'SAFETY';

export type SupportStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_USER' | 'RESOLVED' | 'CLOSED';

export type SupportTicket = {
  id: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  created_at: string;
  updated_at: string;
  last_message_at: string;
  last_message: string | null;
  user_id?: string;
  user_email?: string | null;
};

export type SupportMessage = {
  id: string;
  ticket_id: string;
  sender_role: 'USER' | 'ADMIN';
  body: string;
  created_at: string;
  sender_display_name: string;
};

function fail(error: { message: string; code?: string; details?: string; hint?: string } | null, fallback: string, context: UserErrorContext = 'profile'): never | void {
  if (error) throw userFacingError(error, context, fallback);
}

export async function listMySupportTickets(): Promise<SupportTicket[]> {
  const { data, error } = await supabase.rpc('list_my_vad_support_tickets');
  fail(error, 'Your support requests could not be loaded.');
  return (Array.isArray(data) ? data : []) as SupportTicket[];
}

export async function createSupportTicket(input: {
  subject: string;
  message: string;
  category: SupportCategory;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_vad_support_ticket', {
    p_subject: input.subject.trim(),
    p_message: input.message.trim(),
    p_category: input.category,
  });
  fail(error, 'Your support request could not be submitted.');
  if (typeof data !== 'string' || !data) throw new Error('VAD did not return a support request ID.');
  return data;
}

export async function getSupportMessages(ticketId: string): Promise<SupportMessage[]> {
  const { data, error } = await supabase.rpc('get_vad_support_messages', { p_ticket_id: ticketId });
  fail(error, 'This support conversation could not be loaded.');
  return (Array.isArray(data) ? data : []) as SupportMessage[];
}

export async function sendSupportMessage(ticketId: string, body: string): Promise<string> {
  const { data, error } = await supabase.rpc('send_vad_support_message', {
    p_ticket_id: ticketId,
    p_body: body.trim(),
  });
  fail(error, 'Your reply could not be sent.');
  if (typeof data !== 'string' || !data) throw new Error('VAD did not confirm the reply.');
  return data;
}

export async function adminListSupportTickets(status?: SupportStatus | 'ALL'): Promise<SupportTicket[]> {
  const { data, error } = await supabase.rpc('admin_list_vad_support_tickets', {
    p_status: status && status !== 'ALL' ? status : null,
  });
  fail(error, 'The support inbox could not be loaded.', 'admin');
  return (Array.isArray(data) ? data : []) as SupportTicket[];
}

export async function adminReplySupportTicket(input: {
  ticketId: string;
  body: string;
  status: Exclude<SupportStatus, 'OPEN'>;
}): Promise<string> {
  const { data, error } = await supabase.rpc('admin_reply_vad_support_ticket', {
    p_ticket_id: input.ticketId,
    p_body: input.body.trim(),
    p_status: input.status,
  });
  fail(error, 'The support reply could not be sent.', 'admin');
  if (typeof data !== 'string' || !data) throw new Error('VAD did not confirm the support reply.');
  return data;
}
