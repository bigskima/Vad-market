export type JsonRecord = Record<string, unknown>;

export type OracleResource = {
  id: number;
  resourceType: 'CRYPTO_PAIR' | 'CANONICAL_EVENT' | 'SPORTS_COMPETITION' | 'PUBLIC_EVENT';
  canonicalKey: string;
  externalKey: string;
  status: 'ACTIVE' | 'DISABLED';
  metadata: JsonRecord;
};

export type OracleProvider = {
  id: number;
  code: string;
  name: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  status: 'ACTIVE' | 'DISABLED' | 'DEGRADED' | 'UNAVAILABLE';
  priority: number;
  capabilities: string[];
  configured: boolean;
  adapter?: string | null;
  baseUrl?: string | null;
  secretReference?: string | null;
  publicMetadata: JsonRecord;
  resources: OracleResource[];
};

export type DueOracleEvent = {
  eventId: number;
  eventPublicId: string;
  title: string;
  category: string;
  status: string;
  normalizedParameters: JsonRecord;
  resolutionScope: JsonRecord;
  closesAt: string;
  resolvesAfter?: string | null;
  oraclePolicyId: number;
  oraclePolicyPublicId: string;
  capabilityCode: string;
  sourceHierarchy: unknown;
  consensusRule: JsonRecord;
  outcomes: Array<{ code: string; label: string }>;
};

export type CryptoThresholdSpec = {
  resolverType: 'CRYPTO_PRICE_THRESHOLD_V1';
  asset: string;
  quote: string;
  operator: 'GT' | 'GTE' | 'LT' | 'LTE';
  threshold: number;
  observationTime: Date;
};

export type FootballResultSpec = {
  resolverType: 'FOOTBALL_MATCH_RESULT_V1';
  condition: 'HOME_WIN' | 'AWAY_WIN' | 'DRAW';
};

export type ResolverSpec = CryptoThresholdSpec | FootballResultSpec;

export type ProviderObservation = {
  observedOutcome: 'YES' | 'NO';
  observedAt: Date;
  evidenceReference: string;
  payload: JsonRecord;
};

export type ProviderResolutionResult =
  | { kind: 'observation'; observation: ProviderObservation }
  | { kind: 'skipped'; code: string; detail?: string };

export class OracleRuntimeError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'OracleRuntimeError';
    this.code = code;
    this.status = status;
  }
}
