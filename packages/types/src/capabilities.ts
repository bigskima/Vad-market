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
  /** Present in the live v2+ capability contract. Omitted by legacy v1 responses. */
  jurisdictionStatus?: string;
  /** v3: emergency/service-control state. Maintenance is read-only, not a webhook/reconciliation shutdown. */
  platformStatus?: "READY" | "MAINTENANCE";
  platformReasonCode?: string;
  platformMessage?: string;
  platformPauseScope?: "GLOBAL" | "USER";
  platformResumesAt?: IsoTimestamp | null;
}

/**
 * Server-authoritative runtime capability snapshot.
 *
 * Version 2 added jurisdiction status. Version 3 adds canonical emergency
 * service-control context and human-readable pause messages. Older contracts
 * remain accepted during staggered deployments.
 *
 * A false decision is authoritative for the snapshot. Clients may explain it
 * using `reasons`/`messages`, but must never locally promote a false value to true.
 */
export interface RuntimeCapabilitiesResponse {
  version: 1 | 2 | 3;
  status: RuntimeCapabilityStatus;
  requestId: RequestId;
  evaluatedAt: IsoTimestamp;
  context: RuntimeCapabilityContext;
  capabilities: RuntimeCapabilityDecisions;
  reasons: Partial<Record<RuntimeCapabilityKey, string>>;
  messages?: Partial<Record<RuntimeCapabilityKey, string>>;
}
