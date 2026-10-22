import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type MarketPresentationProfile =
  | 'EVENT'
  | 'CRYPTO'
  | 'SPORTS'
  | 'MUSIC'
  | 'AI'
  | 'STOCKS'
  | 'ECONOMICS'
  | 'ENTERTAINMENT'
  | 'PUBLIC_EVENTS';

export type MarketCategoryExperience = {
  code: string;
  name: string;
  description: string;
  display_order: number;
  presentation_profile: MarketPresentationProfile;
  group_field: string;
};

export type CryptoMarketQuote = {
  id: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  currentPrice: number;
  marketCap: number | null;
  marketCapRank: number | null;
  totalVolume: number | null;
  change24hPercent: number | null;
  sparkline7d: number[];
  sourceUpdatedAt: string | null;
};

export type CryptoMarketDataPage = {
  source: 'COINGECKO';
  dataPurpose: 'DISPLAY_ONLY';
  quoteCurrency: string;
  page: number;
  perPage: number;
  query: string | null;
  hasMore: boolean;
  fetchedAt: string;
  cacheSeconds?: number;
  cached?: boolean;
  stale?: boolean;
  coins: CryptoMarketQuote[];
};

export type AdminMarketDataSource = {
  code: string;
  name: string;
  base_url: string;
  status: 'ACTIVE' | 'DISABLED';
  quote_currency: string;
  default_page_size: number;
  cache_seconds: number;
  updated_at: string;
};

export async function getMarketCategoryExperiences(): Promise<MarketCategoryExperience[]> {
  const { data, error } = await supabase.rpc('get_market_category_experiences');
  if (error) throw userFacingError(error, 'markets', 'Market categories could not be loaded.');
  return (data ?? []) as MarketCategoryExperience[];
}

export async function getCryptoMarketPrices(input: {
  page?: number;
  perPage?: number;
  query?: string;
} = {}): Promise<CryptoMarketDataPage> {
  const { data, error } = await supabase.functions.invoke('crypto-market-data', {
    body: {
      page: Math.max(1, Math.floor(input.page ?? 1)),
      ...(input.perPage == null ? {} : {
        perPage: Math.max(1, Math.min(100, Math.floor(input.perPage))),
      }),
      query: input.query?.trim() || null,
    },
  });
  if (error) {
    throw userFacingError(error, 'markets', 'Crypto market prices are temporarily unavailable.');
  }
  const payload = data as Partial<CryptoMarketDataPage> & { error?: string };
  if (payload?.error || !Array.isArray(payload?.coins)) {
    throw new Error(payload?.error || 'Crypto market prices are temporarily unavailable.');
  }
  return payload as CryptoMarketDataPage;
}

export async function getAdminMarketDataSources(): Promise<AdminMarketDataSource[]> {
  const { data, error } = await supabase.rpc('admin_market_data_source_config');
  if (error) throw userFacingError(error, 'admin', 'Market-data controls could not be loaded.');
  return (data ?? []) as AdminMarketDataSource[];
}

export async function updateAdminMarketDataSourceSettings(input: {
  code: string;
  quoteCurrency: string;
  defaultPageSize: number;
  cacheSeconds: number;
  reason: string;
}) {
  const { data, error } = await supabase.rpc('admin_update_market_data_source_settings', {
    p_code: input.code,
    p_quote_currency: input.quoteCurrency.trim().toUpperCase(),
    p_default_page_size: input.defaultPageSize,
    p_cache_seconds: input.cacheSeconds,
    p_reason: input.reason.trim(),
  });
  if (error) throw userFacingError(error, 'admin', 'Market-data source settings could not be updated.');
  return data === true;
}

export async function setAdminMarketDataSourceStatus(input: {
  code: string;
  status: 'ACTIVE' | 'DISABLED';
  reason: string;
}) {
  const { data, error } = await supabase.rpc('admin_set_market_data_source_status', {
    p_code: input.code,
    p_status: input.status,
    p_reason: input.reason.trim(),
  });
  if (error) throw userFacingError(error, 'admin', 'Market-data source status could not be updated.');
  return data === true;
}


export type CryptoOracleAssetCheck = {
  supported: boolean;
  symbol: string;
  quote: 'USD';
  provider: 'PYTH';
  feedSymbol?: string;
  feedId?: string;
  reason?: string;
};

export async function checkCryptoOracleAsset(symbol: string): Promise<CryptoOracleAssetCheck> {
  const normalized = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,20}$/.test(normalized)) {
    throw new Error('Select a valid crypto asset symbol.');
  }
  const { data, error } = await supabase.functions.invoke('crypto-oracle-asset-check', {
    body: { symbol: normalized, quote: 'USD' },
  });
  if (error) throw userFacingError(error, 'admin', 'Oracle support for this crypto asset could not be checked.');
  const payload = data as Partial<CryptoOracleAssetCheck> & { error?: string };
  if (payload?.error) throw new Error(payload.error);
  if (payload?.symbol !== normalized || typeof payload?.supported !== 'boolean') {
    throw new Error('The crypto Oracle support check returned an invalid response.');
  }
  return payload as CryptoOracleAssetCheck;
}


export async function registerCryptoOracleAsset(input: {
  symbol: string;
  coinGeckoId: string;
  pythFeedSymbol: string;
  reason: string;
}) {
  const { data, error } = await supabase.rpc('admin_register_crypto_oracle_asset', {
    p_symbol: input.symbol.trim().toUpperCase(),
    p_coin_gecko_id: input.coinGeckoId.trim().toLowerCase(),
    p_pyth_feed_symbol: input.pythFeedSymbol.trim(),
    p_reason: input.reason.trim(),
  });
  if (error) throw userFacingError(error, 'admin', 'This asset could not be registered for Oracle resolution.');
  const payload = data as { registered?: boolean; symbol?: string; coin_gecko_id?: string; pyth_feed_symbol?: string } | null;
  if (payload?.registered !== true) throw new Error('The Oracle asset registration did not return confirmation.');
  return payload;
}
