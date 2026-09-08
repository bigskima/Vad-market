import type {
  AssetCode,
  CountryCode,
  IsoTimestamp,
  RequestId,
} from "./primitives";

export const RUNTIME_CAPABILITY_KEYS = [
  "createPost",
  "submitMarketProposal",
  "viewPortfolio",
  "trade",
  "deposit",
  "withdraw",
] as const;

export type RuntimeCapabilityKey =
  (typeof RUNTIME_CAPABILITY_KEYS)[number];

export const RUNTIME_CAPABILITY_STATUSES = ["ready", "degraded"] as const;
export type RuntimeCapabilityStatus =
  (typeof RUNTIME_CAPABILITY_STATUSES)[number];

export type RuntimeCapabilityDecisions = Record<RuntimeCapabilityKey, boolean>;

export interface RuntimeCapabilityContext {
  countryCode: CountryCode;
  activeAssetCodes: AssetCode[];
}

/**
 * Version 1 of the server-authoritative capability snapshot.
 *
 * A false decision is authoritative for this snapshot. Clients may explain it
 * using `reasons`, but must never locally promote a false value to true.
 */
export interface RuntimeCapabilitiesResponse {
  version: 1;
  status: RuntimeCapabilityStatus;
  requestId: RequestId;
  evaluatedAt: IsoTimestamp;
  context: RuntimeCapabilityContext;
  capabilities: RuntimeCapabilityDecisions;
  reasons: Partial<Record<RuntimeCapabilityKey, string>>;
}
