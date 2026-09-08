export const USER_STATUSES = [
  "ACTIVE",
  "RESTRICTED",
  "SUSPENDED",
  "BANNED",
  "DEACTIVATED",
  "UNDER_REVIEW",
] as const;

export type UserStatus = (typeof USER_STATUSES)[number];

export const ADMIN_ROLES = [
  "SUPER_ADMIN",
  "FINANCE_ADMIN",
  "MARKET_ADMIN",
  "ORACLE_REVIEWER",
  "RISK_ADMIN",
  "COMPLIANCE_ADMIN",
  "CONTENT_MODERATOR",
  "SUPPORT_AGENT",
  "READ_ONLY_AUDITOR",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const POLICY_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "ACTIVE",
  "SUPERSEDED",
  "EXPIRED",
  "REVOKED",
] as const;

export type PolicyStatus = (typeof POLICY_STATUSES)[number];

export const POLICY_DOMAINS = [
  "ASSETS",
  "PROVIDERS",
  "KYC",
  "FEES",
  "MARKETS",
  "ORACLE",
  "RISK",
  "LIMITS",
  "DISPUTES",
  "AI_ROUTING",
  "ALGORITHMS",
  "CREATOR_CAPABILITIES",
  "FEATURE_FLAGS",
] as const;

export type PolicyDomain = (typeof POLICY_DOMAINS)[number];

export const ASSET_TYPES = ["FIAT", "STABLECOIN", "CRYPTO"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_STATUSES = ["ACTIVE", "DISABLED", "SUSPENDED"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const LEDGER_ACCOUNT_TYPES = [
  "USER_AVAILABLE",
  "USER_RESERVED",
  "MARKET_COLLATERAL",
  "WITHDRAWAL_PENDING",
  "PROVIDER_CLEARING",
  "PLATFORM_TRADING_FEE_REVENUE",
  "PLATFORM_SETTLEMENT_FEE_REVENUE",
  "PLATFORM_WITHDRAWAL_REVENUE",
  "REFUND_PAYABLE",
  "CREATOR_REWARD_PAYABLE",
  "TREASURY",
  "SUSPENSE",
  "CHARGEBACK_RECEIVABLE",
] as const;

export type LedgerAccountType = (typeof LEDGER_ACCOUNT_TYPES)[number];

export const LEDGER_ACCOUNT_STATUSES = ["ACTIVE", "FROZEN", "CLOSED"] as const;
export type LedgerAccountStatus = (typeof LEDGER_ACCOUNT_STATUSES)[number];

export const PROVIDER_TYPES = [
  "PAYMENT",
  "IDENTITY_VERIFICATION",
  "ORACLE",
  "AI",
  "NOTIFICATION",
] as const;

export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const PROVIDER_STATUSES = [
  "ACTIVE",
  "DISABLED",
  "DEGRADED",
  "UNAVAILABLE",
] as const;

export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

export const PROVIDER_ENVIRONMENTS = ["SANDBOX", "PRODUCTION"] as const;
export type ProviderEnvironment = (typeof PROVIDER_ENVIRONMENTS)[number];

export const PHASE_ONE_DOMAIN_EVENTS = [
  "USER_REGISTERED",
  "PROFILE_UPDATED",
  "ADMIN_ROLE_ASSIGNED",
  "ADMIN_ROLE_REVOKED",
  "POLICY_CREATED",
  "POLICY_ACTIVATED",
  "ASSET_STATUS_CHANGED",
  "LEDGER_ACCOUNT_CREATED",
  "PROVIDER_STATUS_CHANGED",
] as const;

export type PhaseOneDomainEvent = (typeof PHASE_ONE_DOMAIN_EVENTS)[number];
