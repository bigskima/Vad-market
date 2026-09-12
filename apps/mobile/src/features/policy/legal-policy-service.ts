import { Platform } from 'react-native';

import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type LegalDocumentKey = 'TERMS' | 'PRIVACY';
export type LegalDocumentStatus = 'DRAFT' | 'PUBLISHED';

export type LegalDocument = {
  key: LegalDocumentKey;
  title: string;
  summary: string;
  version: string;
  effectiveDate: string;
  requiredAcceptance: boolean;
  status: LegalDocumentStatus;
  content: string;
  policyId?: number;
  policyVersionId?: number;
  versionNumber?: number;
  accepted?: boolean;
};

export type AdminLegalDocument = LegalDocument & {
  currentVersionId?: number | null;
  updatedAt?: string | null;
  canPublish: boolean;
};

export type PolicyGateState = {
  loading: boolean;
  enforcementReady: boolean;
  requiresAcceptance: boolean;
  requiredDocuments: LegalDocument[];
  documents: LegalDocument[];
  error: string | null;
};

type RawPolicyState = {
  enforcementReady?: boolean;
  requiresAcceptance?: boolean;
  documents?: LegalDocument[];
};

const changeListeners = new Set<() => void>();

export const VAD_POLICY_PUBLISHING_CONNECTED = true;

export const DEFAULT_LEGAL_DOCUMENTS: LegalDocument[] = [
  {
    key: 'TERMS',
    title: 'VAD Terms of Use',
    summary: 'The rules for using VAD, creating an account and participating in markets.',
    version: '2026.09-next',
    effectiveDate: new Date().toISOString().slice(0, 10),
    requiredAcceptance: true,
    status: 'DRAFT',
    content: '',
  },
  {
    key: 'PRIVACY',
    title: 'VAD Privacy Notice',
    summary: 'How VAD handles account, verification, payment, device and product-use information.',
    version: '2026.09-next',
    effectiveDate: new Date().toISOString().slice(0, 10),
    requiredAcceptance: true,
    status: 'DRAFT',
    content: '',
  },
];

function fail(
  error: { message: string; code?: string; details?: string; hint?: string } | null,
  fallback: string,
) {
  if (error) throw userFacingError(error, 'general', fallback);
}

function normalizeDocuments(value: unknown): LegalDocument[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is LegalDocument => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      ...item,
      policyId: item.policyId == null ? undefined : Number(item.policyId),
      policyVersionId: item.policyVersionId == null ? undefined : Number(item.policyVersionId),
      versionNumber: item.versionNumber == null ? undefined : Number(item.versionNumber),
      accepted: Boolean(item.accepted),
    }));
}

export function subscribeLegalPolicyChanges(listener: () => void) {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

function notifyLegalPolicyChanges() {
  changeListeners.forEach((listener) => listener());
}

export async function getPolicyWorkspace(): Promise<LegalDocument[]> {
  const state = await getPolicyGateState('current-user');
  return state.documents;
}

export async function getPolicyGateState(
  userId: string | null | undefined,
): Promise<PolicyGateState> {
  if (!userId) {
    return {
      loading: false,
      enforcementReady: false,
      requiresAcceptance: false,
      requiredDocuments: [],
      documents: [],
      error: null,
    };
  }

  const { data, error } = await supabase.rpc('my_legal_policy_state');
  fail(error, 'We could not confirm the policies for your account. Please try again.');

  const raw = (data ?? {}) as RawPolicyState;
  const documents = normalizeDocuments(raw.documents);
  const requiredDocuments = documents.filter(
    (document) => document.requiredAcceptance && !document.accepted,
  );

  return {
    loading: false,
    enforcementReady: Boolean(raw.enforcementReady),
    requiresAcceptance: Boolean(raw.requiresAcceptance),
    requiredDocuments,
    documents,
    error: null,
  };
}

export async function acceptLegalPolicies(documents: LegalDocument[]) {
  const versionIds = documents
    .map((document) => document.policyVersionId)
    .filter((value): value is number => Number.isFinite(value));

  if (versionIds.length !== documents.length || !versionIds.length) {
    throw new Error('These policies could not be confirmed. Refresh and try again.');
  }

  const { data, error } = await supabase.rpc('accept_current_legal_policies', {
    p_policy_version_ids: versionIds,
    p_source: Platform.OS === 'web' ? 'WEB' : 'APP',
  });
  fail(error, 'We could not save your policy agreement. Please try again.');
  if (!data) throw new Error('We could not save your policy agreement. Please try again.');
  notifyLegalPolicyChanges();
  return true;
}

export async function getAdminPolicyWorkspace(): Promise<AdminLegalDocument[]> {
  const { data, error } = await supabase.rpc('admin_legal_policy_workspace');
  fail(error, 'We could not load the policy workspace right now. Refresh and try again.');
  if (!Array.isArray(data)) return [];

  return data.map((item) => {
    const row = item as AdminLegalDocument;
    return {
      ...row,
      policyId: row.policyId == null ? undefined : Number(row.policyId),
      currentVersionId: row.currentVersionId == null ? null : Number(row.currentVersionId),
      canPublish: Boolean(row.canPublish),
    };
  });
}

export async function saveAdminPolicyDraft(document: LegalDocument) {
  const { data, error } = await supabase.rpc('admin_save_legal_policy_draft', {
    p_document_key: document.key,
    p_title: document.title.trim(),
    p_summary: document.summary.trim(),
    p_version_label: document.version.trim(),
    p_effective_date: document.effectiveDate,
    p_required_acceptance: document.requiredAcceptance,
    p_content: document.content,
  });
  fail(error, 'We could not save this policy draft. Check the document and try again.');
  return Boolean(data);
}

export async function publishAdminLegalPolicy(documentKey: LegalDocumentKey, reason: string) {
  const { data, error } = await supabase.rpc('admin_publish_legal_policy', {
    p_document_key: documentKey,
    p_reason: reason.trim(),
  });
  fail(error, 'We could not publish this policy version. Check the version and try again.');
  notifyLegalPolicyChanges();
  return Number(data);
}
