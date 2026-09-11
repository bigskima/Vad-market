import { getProductLocalItem, setProductLocalItem } from '@/services/product-local-storage';

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
};

export type PolicyGateState = {
  loading: boolean;
  enforcementReady: boolean;
  requiresAcceptance: boolean;
  requiredDocuments: LegalDocument[];
};

const WORKSPACE_KEY = 'vad.policy.workspace.preview.v1';
const ACCEPTANCE_PREFIX = 'vad.policy.acceptance.preview.v1';

// This remains false until the VAD Supabase project is reconnected. The UI and
// adapter are intentionally ready without writing anything to another project.
export const VAD_POLICY_PUBLISHING_CONNECTED = false;

export const DEFAULT_LEGAL_DOCUMENTS: LegalDocument[] = [
  {
    key: 'TERMS',
    title: 'VAD Terms of Use',
    summary: 'The rules for using VAD, creating an account and participating in markets.',
    version: '2026.09-draft',
    effectiveDate: '2026-09-11',
    requiredAcceptance: true,
    status: 'DRAFT',
    content: `VAD TERMS OF USE

1. ABOUT THESE TERMS
These Terms of Use explain the rules that apply when you access or use VAD. By agreeing to these terms, you confirm that you have read them, understand them and agree to follow them while using VAD.

2. YOUR ACCOUNT
You are responsible for keeping your sign-in details secure and for activity carried out through your account. Information you provide to VAD should be accurate and kept up to date. Some features may require identity verification before they become available.

3. MARKETS AND DECISIONS
VAD presents markets about future events and outcomes. Market prices can change and do not guarantee what will happen. You are responsible for reviewing the market question, closing time, resolution information and your own financial position before taking part.

4. FUNDS AND TRANSACTIONS
Available currencies, payment methods, limits, fees and processing times may vary. Money committed to an open order may not be available for another action until that order is filled, cancelled or otherwise released. A withdrawal may remain pending while it is being processed.

5. FAIR USE
You must not use VAD to mislead other people, manipulate markets, interfere with the service, abuse another account, evade restrictions or carry out unlawful activity. VAD may limit or stop access where needed to protect users, markets or the platform.

6. MARKET RESOLUTION
Each market has its own resolution information. Outcomes may depend on approved sources and the rules shown for that market. Where an event is postponed, cancelled, unclear or disputed, the applicable market rules determine what happens next.

7. CONTENT AND COMMUNITY
When you post content, you are responsible for what you share. Do not post unlawful, deceptive, abusive or privacy-invasive material. VAD may moderate content to keep the community useful and safe.

8. CHANGES TO VAD
Features, available markets and service providers may change over time. Important changes that require a new agreement should be presented to you before you continue using affected parts of VAD.

9. LIMITATION AND RESPONSIBILITY
Use VAD carefully and make decisions based on your own assessment. Service interruptions, delayed information or third-party failures can occur. Nothing displayed in VAD should be treated as a guarantee of an outcome or return.

10. CONTACT AND QUESTIONS
If you have a question about these terms or your account, use the support options made available in VAD.

This draft is provided to complete the product experience while the final published policy is being prepared.`,
  },
  {
    key: 'PRIVACY',
    title: 'VAD Privacy Notice',
    summary: 'How VAD handles account, verification, payment, device and product-use information.',
    version: '2026.09-draft',
    effectiveDate: '2026-09-11',
    requiredAcceptance: true,
    status: 'DRAFT',
    content: `VAD PRIVACY NOTICE

1. WHAT THIS NOTICE COVERS
This notice explains the information VAD may use to provide the product, protect accounts, operate markets, process payments and improve the experience.

2. INFORMATION YOU PROVIDE
This can include your email address, phone number, profile information, support messages and information required for identity verification. If you create community content, that content and the profile information you choose to show may be visible to other people.

3. ACCOUNT AND PRODUCT ACTIVITY
VAD may record sign-ins, device and session information, market views, orders, positions, payment activity, settings and actions you take in the product. This helps VAD operate your account, show the correct information and investigate errors or abuse.

4. IDENTITY VERIFICATION
When verification is required, VAD may use a verification provider to check identity information. The information shown to VAD and the information retained by a verification provider can differ. The verification experience should explain what is requested before you continue.

5. PAYMENTS
Payment and withdrawal information may be shared with payment providers when needed to complete a transaction, resolve a payment issue, meet legal requirements or prevent fraud.

6. WHY INFORMATION IS USED
Information may be used to provide VAD, authenticate users, keep balances and positions accurate, process transactions, meet compliance obligations, prevent abuse, communicate important updates, provide support and improve reliability.

7. WHEN INFORMATION MAY BE SHARED
Information may be shared with service providers that help VAD deliver a feature, with authorities where legally required, or as needed to investigate fraud, security incidents or harmful activity. VAD should not expose private account information to other users unless you choose to make information public through a product feature.

8. RETENTION
Information should be kept only for as long as needed for the purpose it was collected, including account operation, dispute handling, security, compliance and legal recordkeeping.

9. YOUR CHOICES
Where available, you can update profile information, manage product settings and contact support about privacy questions. Some records may need to be retained even after an account change when required for security, financial records or legal obligations.

10. POLICY UPDATES
If this notice changes in a way that requires your agreement, VAD should show the updated version and ask you to review it before continuing.

This draft is provided to complete the product experience while the final published privacy notice is being prepared.`,
  },
];

export async function getPolicyWorkspace(): Promise<LegalDocument[]> {
  try {
    const stored = await getProductLocalItem(WORKSPACE_KEY);
    if (!stored) return DEFAULT_LEGAL_DOCUMENTS.map((document) => ({ ...document }));
    const parsed = JSON.parse(stored) as LegalDocument[];
    return Array.isArray(parsed) && parsed.length
      ? parsed
      : DEFAULT_LEGAL_DOCUMENTS.map((document) => ({ ...document }));
  } catch {
    return DEFAULT_LEGAL_DOCUMENTS.map((document) => ({ ...document }));
  }
}

export async function savePolicyPreviewDraft(documents: LegalDocument[]) {
  await setProductLocalItem(WORKSPACE_KEY, JSON.stringify(documents));
}

export async function getPolicyGateState(userId: string | null | undefined): Promise<PolicyGateState> {
  const documents = await getPolicyWorkspace();
  if (!userId || !VAD_POLICY_PUBLISHING_CONNECTED) {
    return {
      loading: false,
      enforcementReady: false,
      requiresAcceptance: false,
      requiredDocuments: documents.filter((document) => document.requiredAcceptance),
    };
  }

  const accepted = await readLocalAcceptance(userId);
  const requiredDocuments = documents.filter(
    (document) => document.status === 'PUBLISHED' && document.requiredAcceptance,
  );
  const requiresAcceptance = requiredDocuments.some(
    (document) => accepted[document.key] !== document.version,
  );

  return {
    loading: false,
    enforcementReady: true,
    requiresAcceptance,
    requiredDocuments,
  };
}

export async function recordPreviewAcceptance(userId: string, documents: LegalDocument[]) {
  const versions = Object.fromEntries(documents.map((document) => [document.key, document.version]));
  await setProductLocalItem(`${ACCEPTANCE_PREFIX}.${userId}`, JSON.stringify(versions));
}

async function readLocalAcceptance(userId: string): Promise<Record<string, string>> {
  try {
    const stored = await getProductLocalItem(`${ACCEPTANCE_PREFIX}.${userId}`);
    return stored ? JSON.parse(stored) as Record<string, string> : {};
  } catch {
    return {};
  }
}
