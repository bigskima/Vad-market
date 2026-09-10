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
  /** Present in the live v2 capability contract. Omitted by legacy v1 responses. */
  jurisdictionStatus?: string;
}

/**
 * Server-authoritative runtime capability snapshot.
 *
 * Version 2 adds jurisdiction status to the response context. The client keeps
 * accepting version 1 during staggered deployments so a frontend release does
 * not accidentally fail every capability closed while environments converge.
 *
 * A false decision is authoritative for the snapshot. Clients may explain it
 * using `reasons`, but must never locally promote a false value to true.
 */
export interface RuntimeCapabilitiesResponse {
  version: 1 | 2;
  status: RuntimeCapabilityStatus;
  requestId: RequestId;
  evaluatedAt: IsoTimestamp;
  context: RuntimeCapabilityContext;
  capabilities: RuntimeCapabilityDecisions;
  reasons: Partial<Record<RuntimeCapabilityKey, string>>;
}
