import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type CryptoAdminStatus = 'ACTIVE' | 'DISABLED' | 'SUSPENDED';

export type AdminCryptoAsset = {
  code: string;
  name: string;
  assetType: string;
  status: 'ACTIVE' | 'DISABLED';
  metadata: Record<string, unknown>;
};

export type AdminJurisdictionAsset = {
  countryCode: string;
  assetCode: string;
  status: 'ACTIVE' | 'DISABLED';
};

export type AdminCryptoChain = {
  code: string;
  name: string;
  family: string;
  clientAdapter: string;
  evmChainId: number | string | null;
  nativeSymbol: string;
  explorerUrl: string | null;
  status: CryptoAdminStatus;
  metadata: Record<string, unknown>;
};

export type AdminCryptoAssetRepresentation = {
  chainCode: string;
  assetCode: string;
  tokenStandard: string;
  tokenAddress: string;
  decimals: number;
  representationType: string;
  issuer: string | null;
  status: CryptoAdminStatus;
  metadata: Record<string, unknown>;
};

export type AdminCryptoJurisdiction = {
  countryCode: string;
  chainCode: string;
  status: CryptoAdminStatus;
  metadata: Record<string, unknown>;
};

export type AdminCryptoDeployment = {
  chainCode: string;
  chainFamily: string;
  protocolKey: string;
  protocolVersion: number;
  contractAddress: string;
  status: 'ACTIVE' | 'DISABLED' | 'SUSPENDED' | 'RETIRED';
  deployedAt: string | null;
  metadata: Record<string, unknown>;
};

export type AdminCryptoMarketVenue = {
  venueId: string;
  instrumentPublicId: string;
  marketTitle: string;
  assetCode: string;
  chainCode: string;
  settlementType: string;
  protocolKey: string | null;
  protocolVersion: number | null;
  contractAddress: string | null;
  status: 'ACTIVE' | 'DISABLED' | 'SUSPENDED' | 'CLOSED';
  metadata: Record<string, unknown>;
};

export type AdminCryptoCatalog = {
  assets: AdminCryptoAsset[];
  jurisdictionAssets: AdminJurisdictionAsset[];
  chains: AdminCryptoChain[];
  assetRepresentations: AdminCryptoAssetRepresentation[];
  jurisdictions: AdminCryptoJurisdiction[];
  contractDeployments: AdminCryptoDeployment[];
  marketVenues: AdminCryptoMarketVenue[];
};

function fail(
  error: { message: string; code?: string; details?: string; hint?: string } | null,
  fallback: string,
) {
  if (error) throw userFacingError(error, 'admin', fallback);
}

function asCatalog(value: unknown): AdminCryptoCatalog {
  const row = (value ?? {}) as Partial<AdminCryptoCatalog>;
  return {
    assets: Array.isArray(row.assets) ? row.assets : [],
    jurisdictionAssets: Array.isArray(row.jurisdictionAssets) ? row.jurisdictionAssets : [],
    chains: Array.isArray(row.chains) ? row.chains : [],
    assetRepresentations: Array.isArray(row.assetRepresentations) ? row.assetRepresentations : [],
    jurisdictions: Array.isArray(row.jurisdictions) ? row.jurisdictions : [],
    contractDeployments: Array.isArray(row.contractDeployments) ? row.contractDeployments : [],
    marketVenues: Array.isArray(row.marketVenues) ? row.marketVenues : [],
  };
}

export async function getAdminCryptoCatalog() {
  const { data, error } = await supabase.rpc('admin_crypto_network_catalog');
  fail(error, 'We could not load crypto network controls right now.');
  return asCatalog(data);
}

export async function setAdminAssetStatus(input: {
  assetCode: string;
  status: 'ACTIVE' | 'DISABLED';
  sandboxOnly?: boolean | null;
}) {
  const { data, error } = await supabase.rpc('admin_set_asset_status', {
    p_asset_code: input.assetCode,
    p_status: input.status,
    p_sandbox_only: input.sandboxOnly ?? null,
  });
  fail(error, 'We could not update this asset availability gate.');
  return data as Record<string, unknown>;
}

export async function setAdminJurisdictionAssetStatus(input: {
  countryCode: string;
  assetCode: string;
  status: 'ACTIVE' | 'DISABLED';
}) {
  const { data, error } = await supabase.rpc('admin_set_jurisdiction_asset_status', {
    p_country_code: input.countryCode,
    p_asset_code: input.assetCode,
    p_status: input.status,
  });
  fail(error, 'We could not update this jurisdiction asset gate.');
  return data as Record<string, unknown>;
}

export async function setAdminCryptoChainStatus(
  chain: AdminCryptoChain,
  status: CryptoAdminStatus,
) {
  const { data, error } = await supabase.rpc('admin_upsert_crypto_chain', {
    p_code: chain.code,
    p_name: chain.name,
    p_chain_family: chain.family,
    p_client_adapter: chain.clientAdapter,
    p_evm_chain_id: chain.evmChainId == null ? null : Number(chain.evmChainId),
    p_native_symbol: chain.nativeSymbol,
    p_explorer_url: chain.explorerUrl,
    p_status: status,
    p_metadata: chain.metadata ?? {},
  });
  fail(error, 'We could not update this crypto network.');
  return data as Record<string, unknown>;
}

export async function setAdminCryptoAssetStatus(
  representation: AdminCryptoAssetRepresentation,
  status: CryptoAdminStatus,
) {
  const { data, error } = await supabase.rpc('admin_upsert_chain_asset', {
    p_chain_code: representation.chainCode,
    p_asset_code: representation.assetCode,
    p_token_standard: representation.tokenStandard,
    p_token_address: representation.tokenAddress,
    p_decimals: representation.decimals,
    p_representation_type: representation.representationType,
    p_issuer: representation.issuer,
    p_status: status,
    p_metadata: representation.metadata ?? {},
  });
  fail(error, 'We could not update this chain-specific asset.');
  return data as Record<string, unknown>;
}

export async function setAdminJurisdictionChainStatus(input: {
  countryCode: string;
  chainCode: string;
  status: CryptoAdminStatus;
}) {
  const { data, error } = await supabase.rpc('admin_set_jurisdiction_chain_status', {
    p_country_code: input.countryCode,
    p_chain_code: input.chainCode,
    p_status: input.status,
  });
  fail(error, 'We could not update this jurisdiction network route.');
  return data as Record<string, unknown>;
}

export async function registerAdminContractDeployment(input: {
  chainCode: string;
  contractAddress: string;
  status?: 'ACTIVE' | 'DISABLED' | 'SUSPENDED' | 'RETIRED';
  deployedAt?: string | null;
  metadata: Record<string, unknown>;
}) {
  const { data, error } = await supabase.rpc('admin_upsert_contract_deployment', {
    p_chain_code: input.chainCode,
    p_protocol_key: 'VAD_SETTLEMENT_V1',
    p_protocol_version: 1,
    p_contract_address: input.contractAddress.trim(),
    p_status: input.status ?? 'DISABLED',
    p_deployed_at: input.deployedAt ?? null,
    p_metadata: input.metadata,
  });
  fail(error, 'We could not register this settlement deployment.');
  return data as Record<string, unknown>;
}

export async function setAdminContractDeploymentStatus(
  deployment: AdminCryptoDeployment,
  status: AdminCryptoDeployment['status'],
) {
  return registerAdminContractDeployment({
    chainCode: deployment.chainCode,
    contractAddress: deployment.contractAddress,
    status,
    deployedAt: deployment.deployedAt,
    metadata: deployment.metadata ?? {},
  });
}

export async function upsertAdminOnchainVenue(input: {
  instrumentPublicId: string;
  chainCode: string;
  status?: 'ACTIVE' | 'DISABLED' | 'SUSPENDED' | 'CLOSED';
  tokenAddress?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await supabase.rpc('admin_upsert_instrument_onchain_venue', {
    p_instrument_public_id: input.instrumentPublicId,
    p_chain_code: input.chainCode,
    p_protocol_key: 'VAD_SETTLEMENT_V1',
    p_protocol_version: 1,
    p_status: input.status ?? 'DISABLED',
    p_token_address: input.tokenAddress?.trim() || null,
    p_metadata: input.metadata ?? {},
  });
  fail(error, 'We could not configure this market settlement venue.');
  return data as Record<string, unknown>;
}

export async function setAdminOnchainVenueStatus(
  venue: AdminCryptoMarketVenue,
  status: AdminCryptoMarketVenue['status'],
) {
  return upsertAdminOnchainVenue({
    instrumentPublicId: venue.instrumentPublicId,
    chainCode: venue.chainCode,
    status,
    metadata: venue.metadata ?? {},
  });
}
