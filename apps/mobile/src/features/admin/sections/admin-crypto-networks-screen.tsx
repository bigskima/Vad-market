import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { hasAdminPermission } from '@/services/admin-control-api';
import {
  getAdminCryptoCatalog,
  registerAdminContractDeployment,
  setAdminAssetStatus,
  setAdminContractDeploymentStatus,
  setAdminCryptoAssetStatus,
  setAdminCryptoChainStatus,
  setAdminJurisdictionAssetStatus,
  setAdminJurisdictionChainStatus,
  setAdminOnchainVenueStatus,
  upsertAdminOnchainVenue,
  type AdminCryptoCatalog,
  type AdminCryptoChain,
  type AdminCryptoDeployment,
  type AdminCryptoMarketVenue,
} from '@/services/crypto-admin-api';

type Tab = 'networks' | 'deployments' | 'venues';

const emptyCatalog: AdminCryptoCatalog = {
  assets: [],
  jurisdictionAssets: [],
  chains: [],
  assetRepresentations: [],
  jurisdictions: [],
  contractDeployments: [],
  marketVenues: [],
};

export function AdminCryptoNetworksScreen() {
  const theme = useVadTheme();
  const admin = useAdminData();
  const canAssets = hasAdminPermission(admin.access, 'assets.manage');
  const canMarkets = hasAdminPermission(admin.access, 'markets.manage');
  const [catalog, setCatalog] = useState<AdminCryptoCatalog>(emptyCatalog);
  const [tab, setTab] = useState<Tab>('networks');
  const [loading, setLoading] = useState(true);
  const [workingKey, setWorkingKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCatalog(await getAdminCryptoCatalog());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Crypto controls could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const sandboxChains = useMemo(
    () => catalog.chains.filter((chain) => environmentOf(chain.metadata) === 'SANDBOX'),
    [catalog.chains],
  );
  const productionChains = useMemo(
    () => catalog.chains.filter((chain) => environmentOf(chain.metadata) !== 'SANDBOX'),
    [catalog.chains],
  );

  const usdcAsset = catalog.assets.find((asset) => asset.code === 'USDC') ?? null;
  const ngUsdcRoute = catalog.jurisdictionAssets.find(
    (row) => row.countryCode === 'NG' && row.assetCode === 'USDC',
  ) ?? null;
  const usdcSandboxOnly =
    String(usdcAsset?.metadata?.sandbox_only ?? 'false').toLowerCase() === 'true';

  async function perform(key: string, task: () => Promise<unknown>, success: string) {
    if (workingKey) return;
    setWorkingKey(key);
    setError(null);
    setMessage(null);
    try {
      await task();
      setMessage(success);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The crypto control action failed.');
    } finally {
      setWorkingKey('');
    }
  }

  if (loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton width="52%" height={34} />
        <VadSkeleton height={116} />
        <VadSkeleton height={82} />
        <VadSkeleton height={82} />
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: 4 }}>
        <VadText variant="label" tone="brand">CRYPTO CONTROL PLANE</VadText>
        <VadText variant="title">USDC networks & settlement</VadText>
        <VadText tone="secondary">
          Network, token, jurisdiction, deployment and market venue gates remain independent. NGN stays on the internal ledger.
        </VadText>
      </View>

      <VadCard variant="brand" style={{ gap: theme.spacing.sm }}>
        <VadText variant="bodyStrong">Native-first safety posture</VadText>
        <VadText variant="caption" tone="secondary">
          Dynamic embedded wallets are the primary native wallet. This screen stores only public deployment configuration and never accepts private keys or seed phrases.
        </VadText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
          <VadChip label={String(sandboxChains.length) + ' SANDBOX NETWORKS'} tone="brand" />
          <VadChip label={String(catalog.contractDeployments.length) + ' DEPLOYMENTS'} />
          <VadChip label={String(catalog.marketVenues.length) + ' VENUES'} />
          <VadChip
            label={'USDC ' + (usdcAsset?.status ?? 'UNAVAILABLE')}
            tone={usdcAsset?.status === 'ACTIVE' ? 'yes' : 'neutral'}
          />
          <VadChip
            label={'NG ROUTE ' + (ngUsdcRoute?.status ?? 'UNAVAILABLE')}
            tone={ngUsdcRoute?.status === 'ACTIVE' ? 'yes' : 'neutral'}
          />
          <VadChip
            label={usdcSandboxOnly ? 'SANDBOX ONLY' : 'PRODUCTION-CAPABLE'}
            tone={usdcSandboxOnly ? 'warning' : 'neutral'}
          />
        </View>

        {canAssets && usdcAsset ? (
          <View style={{ gap: theme.spacing.xs }}>
            <VadText variant="caption" tone="secondary">
              The sandbox toggle keeps USDC hidden from non-testers. Production release is intentionally not available from this control.
            </VadText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
              <VadButton
                label={usdcAsset.status === 'ACTIVE' ? 'Disable sandbox USDC' : 'Enable sandbox USDC'}
                size="small"
                variant={usdcAsset.status === 'ACTIVE' ? 'secondary' : 'primary'}
                fullWidth={false}
                loading={workingKey === 'asset:USDC'}
                disabled={Boolean(workingKey)}
                onPress={() => void perform(
                  'asset:USDC',
                  () => setAdminAssetStatus({
                    assetCode: 'USDC',
                    status: usdcAsset.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
                    sandboxOnly: true,
                  }),
                  usdcAsset.status === 'ACTIVE'
                    ? 'Sandbox USDC is disabled.'
                    : 'Sandbox USDC is active for approved tester access.',
                )}
              />
              {ngUsdcRoute ? (
                <VadButton
                  label={ngUsdcRoute.status === 'ACTIVE' ? 'Disable NG USDC' : 'Enable NG USDC'}
                  size="small"
                  variant="secondary"
                  fullWidth={false}
                  loading={workingKey === 'asset-route:NG:USDC'}
                  disabled={
                    Boolean(workingKey)
                    || (usdcAsset.status !== 'ACTIVE' && ngUsdcRoute.status !== 'ACTIVE')
                  }
                  onPress={() => void perform(
                    'asset-route:NG:USDC',
                    () => setAdminJurisdictionAssetStatus({
                      countryCode: 'NG',
                      assetCode: 'USDC',
                      status: ngUsdcRoute.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
                    }),
                    ngUsdcRoute.status === 'ACTIVE'
                      ? 'NG sandbox USDC route is disabled.'
                      : 'NG sandbox USDC route is active for approved testers.',
                  )}
                />
              ) : null}
            </View>
          </View>
        ) : null}
      </VadCard>

      {message ? (
        <VadCard variant="muted" style={{ gap: 3 }}>
          <VadText variant="caption" tone="yes">CONTROL UPDATED</VadText>
          <VadText variant="caption" tone="secondary">{message}</VadText>
        </VadCard>
      ) : null}

      {error ? (
        <VadErrorState
          title="Crypto control needs attention"
          message={error}
          onRetry={() => void load()}
        />
      ) : null}

      <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
        <TabButton label="Networks" selected={tab === 'networks'} onPress={() => setTab('networks')} />
        <TabButton label="Deployments" selected={tab === 'deployments'} onPress={() => setTab('deployments')} />
        <TabButton label="Venues" selected={tab === 'venues'} onPress={() => setTab('venues')} />
      </View>

      {tab === 'networks' ? (
        <View style={{ gap: theme.spacing.lg }}>
          <SectionTitle
            title="Sandbox networks"
            detail="Enabling a sandbox network alone does not expose USDC. Every downstream gate must also be active."
          />
          {sandboxChains.length ? (
            sandboxChains.map((chain) => (
              <NetworkRow
                key={chain.code}
                chain={chain}
                catalog={catalog}
                canManage={canAssets}
                workingKey={workingKey}
                perform={perform}
              />
            ))
          ) : (
            <VadText tone="secondary">No sandbox networks are registered.</VadText>
          )}

          <SectionTitle
            title="Production networks"
            detail="Production routes are visible here, but this screen intentionally has no one-tap production activation."
          />
          {productionChains.map((chain) => (
            <ReadOnlyNetwork key={chain.code} chain={chain} catalog={catalog} />
          ))}
        </View>
      ) : null}

      {tab === 'deployments' ? (
        <DeploymentsPanel
          catalog={catalog}
          canManage={canAssets}
          workingKey={workingKey}
          perform={perform}
        />
      ) : null}

      {tab === 'venues' ? (
        <VenuesPanel
          catalog={catalog}
          canManage={canAssets && canMarkets}
          workingKey={workingKey}
          perform={perform}
        />
      ) : null}
    </View>
  );
}

function NetworkRow({
  chain,
  catalog,
  canManage,
  workingKey,
  perform,
}: {
  chain: AdminCryptoChain;
  catalog: AdminCryptoCatalog;
  canManage: boolean;
  workingKey: string;
  perform: (key: string, task: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const theme = useVadTheme();
  const asset = catalog.assetRepresentations.find(
    (row) => row.chainCode === chain.code && row.assetCode === 'USDC',
  );
  const route = catalog.jurisdictions.find(
    (row) => row.chainCode === chain.code && row.countryCode === 'NG',
  );
  const deployment = catalog.contractDeployments.find(
    (row) => row.chainCode === chain.code && row.protocolKey === 'VAD_SETTLEMENT_V1',
  );
  const chainActive = chain.status === 'ACTIVE';
  const assetActive = asset?.status === 'ACTIVE';
  const routeActive = route?.status === 'ACTIVE';

  return (
    <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <VadText variant="bodyStrong">{chain.name}</VadText>
          <VadText variant="caption" tone="secondary">
            {chain.code + ' · ' + chain.family + ' · ' + String(chain.evmChainId ?? chain.clientAdapter)}
          </VadText>
        </View>
        <StatusChip status={chain.status} />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
        <VadChip label={asset ? 'USDC ' + asset.status : 'NO USDC'} tone={assetActive ? 'yes' : 'neutral'} />
        <VadChip label={route ? 'NG ' + route.status : 'NO NG ROUTE'} tone={routeActive ? 'yes' : 'neutral'} />
        <VadChip
          label={deployment ? 'SETTLEMENT ' + deployment.status : 'NO SETTLEMENT CONTRACT'}
          tone={deployment?.status === 'ACTIVE' ? 'yes' : 'neutral'}
        />
      </View>

      {canManage ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
          <VadButton
            label={chainActive ? 'Disable network' : 'Enable network'}
            size="small"
            variant={chainActive ? 'secondary' : 'primary'}
            fullWidth={false}
            loading={workingKey === 'chain:' + chain.code}
            disabled={Boolean(workingKey)}
            onPress={() => void perform(
              'chain:' + chain.code,
              () => setAdminCryptoChainStatus(chain, chainActive ? 'DISABLED' : 'ACTIVE'),
              chain.code + ' network is now ' + (chainActive ? 'disabled.' : 'active.'),
            )}
          />
          {asset ? (
            <VadButton
              label={assetActive ? 'Disable USDC' : 'Enable USDC'}
              size="small"
              variant="secondary"
              fullWidth={false}
              loading={workingKey === 'asset:' + chain.code}
              disabled={Boolean(workingKey) || (!chainActive && !assetActive)}
              onPress={() => void perform(
                'asset:' + chain.code,
                () => setAdminCryptoAssetStatus(asset, assetActive ? 'DISABLED' : 'ACTIVE'),
                chain.code + ' USDC representation is now ' + (assetActive ? 'disabled.' : 'active.'),
              )}
            />
          ) : null}
          {route ? (
            <VadButton
              label={routeActive ? 'Disable NG route' : 'Enable NG route'}
              size="small"
              variant="secondary"
              fullWidth={false}
              loading={workingKey === 'route:' + chain.code}
              disabled={Boolean(workingKey) || (!chainActive && !routeActive)}
              onPress={() => void perform(
                'route:' + chain.code,
                () => setAdminJurisdictionChainStatus({
                  countryCode: 'NG',
                  chainCode: chain.code,
                  status: routeActive ? 'DISABLED' : 'ACTIVE',
                }),
                chain.code + ' NG route is now ' + (routeActive ? 'disabled.' : 'active.'),
              )}
            />
          ) : null}
        </View>
      ) : null}

      {!deployment ? (
        <VadText variant="caption" tone="warning">
          Deploy and register VAD Settlement V1 before activating any market venue on this network.
        </VadText>
      ) : null}
    </VadCard>
  );
}

function ReadOnlyNetwork({
  chain,
  catalog,
}: {
  chain: AdminCryptoChain;
  catalog: AdminCryptoCatalog;
}) {
  const theme = useVadTheme();
  const asset = catalog.assetRepresentations.find(
    (row) => row.chainCode === chain.code && row.assetCode === 'USDC',
  );

  return (
    <VadCard variant="muted" style={{ gap: theme.spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <VadText variant="bodyStrong">{chain.name}</VadText>
          <VadText variant="caption" tone="tertiary">{chain.code + ' · ' + chain.family}</VadText>
        </View>
        <StatusChip status={chain.status} />
      </View>
      <VadText variant="caption" tone="secondary">
        {'USDC representation: ' + (asset?.status ?? 'not configured')}
      </VadText>
    </VadCard>
  );
}

function DeploymentsPanel({
  catalog,
  canManage,
  workingKey,
  perform,
}: {
  catalog: AdminCryptoCatalog;
  canManage: boolean;
  workingKey: string;
  perform: (key: string, task: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const theme = useVadTheme();
  const sandboxChains = catalog.chains.filter(
    (chain) => environmentOf(chain.metadata) === 'SANDBOX',
  );
  const [chainCode, setChainCode] = useState(sandboxChains[0]?.code ?? '');
  const selectedChain = sandboxChains.find((chain) => chain.code === chainCode) ?? null;
  const [contractAddress, setContractAddress] = useState('');
  const [quoteSigner, setQuoteSigner] = useState('');
  const [settlementSigner, setSettlementSigner] = useState('');
  const [resolver, setResolver] = useState('');
  const [treasury, setTreasury] = useState('');

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <SectionTitle
        title="Settlement deployments"
        detail="Registration records a contract or program that has already been deployed. New records default to DISABLED."
      />

      {catalog.contractDeployments.length ? (
        catalog.contractDeployments.map((deployment) => (
          <DeploymentRow
            key={deployment.chainCode + ':' + deployment.protocolKey + ':' + String(deployment.protocolVersion)}
            deployment={deployment}
            canManage={canManage}
            workingKey={workingKey}
            perform={perform}
          />
        ))
      ) : (
        <VadCard variant="muted">
          <VadText variant="caption" tone="secondary">
            No settlement deployment is registered yet. Base Sepolia is the recommended first EVM sandbox.
          </VadText>
        </VadCard>
      )}

      {canManage ? (
        <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
          <VadText variant="heading">Register test deployment</VadText>
          <VadText variant="caption" tone="secondary">
            Paste public addresses only. Never enter a private key or seed phrase into VAD Admin.
          </VadText>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            {sandboxChains.map((chain) => (
              <VadChip
                key={chain.code}
                label={chain.code}
                selected={chain.code === chainCode}
                tone={chain.code === chainCode ? 'brand' : 'neutral'}
                onPress={() => setChainCode(chain.code)}
              />
            ))}
          </View>

          <VadInput
            label="Contract / program address"
            value={contractAddress}
            onChangeText={setContractAddress}
            placeholder="Public deployment address"
          />

          {selectedChain?.family === 'SOLANA' ? (
            <>
              <VadInput label="VAD signer address" value={quoteSigner} onChangeText={setQuoteSigner} placeholder="Public Solana address" />
              <VadInput label="Resolver authority" value={resolver} onChangeText={setResolver} placeholder="Public Solana address" />
              <VadInput label="Treasury address" value={treasury} onChangeText={setTreasury} placeholder="Public Solana address" />
            </>
          ) : (
            <>
              <VadInput label="Quote signer address" value={quoteSigner} onChangeText={setQuoteSigner} placeholder="0x…" />
              <VadInput label="Settlement signer address" value={settlementSigner} onChangeText={setSettlementSigner} placeholder="0x…" />
              <VadInput label="Resolver address" value={resolver} onChangeText={setResolver} placeholder="0x…" />
              <VadInput label="Treasury address" value={treasury} onChangeText={setTreasury} placeholder="0x…" />
            </>
          )}

          <VadButton
            label="Register as disabled"
            loading={workingKey === 'deployment:new'}
            disabled={
              Boolean(workingKey)
              || !selectedChain
              || !contractAddress.trim()
              || !quoteSigner.trim()
              || !resolver.trim()
              || !treasury.trim()
              || (selectedChain.family !== 'SOLANA' && !settlementSigner.trim())
            }
            onPress={() => {
              if (!selectedChain) return;
              const metadata: Record<string, unknown> = {
                environment: 'SANDBOX',
                registered_from: 'VAD_ADMIN',
                treasury_address: treasury.trim(),
              };
              if (selectedChain.family === 'SOLANA') {
                metadata.vad_signer_address = quoteSigner.trim();
                metadata.resolver_authority = resolver.trim();
              } else {
                metadata.quote_signer_address = quoteSigner.trim();
                metadata.settlement_signer_address = settlementSigner.trim();
                metadata.resolver_address = resolver.trim();
              }

              void perform(
                'deployment:new',
                () => registerAdminContractDeployment({
                  chainCode: selectedChain.code,
                  contractAddress,
                  status: 'DISABLED',
                  deployedAt: new Date().toISOString(),
                  metadata,
                }),
                selectedChain.code + ' deployment registered as disabled.',
              );
            }}
          />
        </VadCard>
      ) : null}
    </View>
  );
}

function DeploymentRow({
  deployment,
  canManage,
  workingKey,
  perform,
}: {
  deployment: AdminCryptoDeployment;
  canManage: boolean;
  workingKey: string;
  perform: (key: string, task: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const theme = useVadTheme();
  const active = deployment.status === 'ACTIVE';

  return (
    <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <VadText variant="bodyStrong">{deployment.chainCode + ' · ' + deployment.protocolKey}</VadText>
          <VadText variant="caption" tone="tertiary" numberOfLines={1}>
            {shortRef(deployment.contractAddress) + ' · v' + String(deployment.protocolVersion)}
          </VadText>
        </View>
        <StatusChip status={deployment.status} />
      </View>

      {canManage && deployment.status !== 'RETIRED' ? (
        <VadButton
          label={active ? 'Disable deployment' : 'Activate deployment'}
          size="small"
          variant={active ? 'secondary' : 'primary'}
          fullWidth={false}
          loading={workingKey === 'deployment:' + deployment.chainCode}
          disabled={Boolean(workingKey)}
          onPress={() => void perform(
            'deployment:' + deployment.chainCode,
            () => setAdminContractDeploymentStatus(
              deployment,
              active ? 'DISABLED' : 'ACTIVE',
            ),
            deployment.chainCode + ' deployment is now ' + (active ? 'disabled.' : 'active.'),
          )}
        />
      ) : null}
    </VadCard>
  );
}

function VenuesPanel({
  catalog,
  canManage,
  workingKey,
  perform,
}: {
  catalog: AdminCryptoCatalog;
  canManage: boolean;
  workingKey: string;
  perform: (key: string, task: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const theme = useVadTheme();
  const sandboxDeployments = catalog.contractDeployments.filter((deployment) => {
    const chain = catalog.chains.find((row) => row.code === deployment.chainCode);
    return chain && environmentOf(chain.metadata) === 'SANDBOX';
  });
  const [instrumentPublicId, setInstrumentPublicId] = useState('');
  const [chainCode, setChainCode] = useState(sandboxDeployments[0]?.chainCode ?? '');

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <SectionTitle
        title="Market settlement venues"
        detail="A venue links one USDC market to one approved chain, token representation and VAD Settlement V1 deployment."
      />

      {catalog.marketVenues.length ? (
        catalog.marketVenues.map((venue) => (
          <VenueRow
            key={venue.venueId}
            venue={venue}
            canManage={canManage}
            workingKey={workingKey}
            perform={perform}
          />
        ))
      ) : (
        <VadCard variant="muted">
          <VadText variant="caption" tone="secondary">No on-chain market venues are configured yet.</VadText>
        </VadCard>
      )}

      {canManage ? (
        <VadCard variant="raised" style={{ gap: theme.spacing.md }}>
          <VadText variant="heading">Attach sandbox market</VadText>
          <VadText variant="caption" tone="secondary">
            The market must already settle in USDC. New venues are registered DISABLED until you explicitly activate them.
          </VadText>
          <VadInput
            label="Market instrument public ID"
            value={instrumentPublicId}
            onChangeText={setInstrumentPublicId}
            placeholder="UUID"
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            {sandboxDeployments.map((deployment) => (
              <VadChip
                key={deployment.chainCode + ':' + String(deployment.protocolVersion)}
                label={deployment.chainCode}
                selected={deployment.chainCode === chainCode}
                tone={deployment.chainCode === chainCode ? 'brand' : 'neutral'}
                onPress={() => setChainCode(deployment.chainCode)}
              />
            ))}
          </View>
          <VadButton
            label="Register venue as disabled"
            loading={workingKey === 'venue:new'}
            disabled={Boolean(workingKey) || !instrumentPublicId.trim() || !chainCode}
            onPress={() => void perform(
              'venue:new',
              () => upsertAdminOnchainVenue({
                instrumentPublicId: instrumentPublicId.trim(),
                chainCode,
                status: 'DISABLED',
                metadata: {
                  environment: 'SANDBOX',
                  registered_from: 'VAD_ADMIN',
                },
              }),
              chainCode + ' market venue registered as disabled.',
            )}
          />
        </VadCard>
      ) : null}
    </View>
  );
}

function VenueRow({
  venue,
  canManage,
  workingKey,
  perform,
}: {
  venue: AdminCryptoMarketVenue;
  canManage: boolean;
  workingKey: string;
  perform: (key: string, task: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const theme = useVadTheme();
  const active = venue.status === 'ACTIVE';

  return (
    <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <VadText variant="bodyStrong" numberOfLines={1}>{venue.marketTitle}</VadText>
          <VadText variant="caption" tone="tertiary">
            {venue.chainCode + ' · ' + venue.assetCode + ' · ' + shortRef(venue.instrumentPublicId)}
          </VadText>
        </View>
        <StatusChip status={venue.status} />
      </View>

      {canManage && venue.status !== 'CLOSED' ? (
        <VadButton
          label={active ? 'Disable venue' : 'Activate venue'}
          size="small"
          variant={active ? 'secondary' : 'primary'}
          fullWidth={false}
          loading={workingKey === 'venue:' + venue.venueId}
          disabled={Boolean(workingKey)}
          onPress={() => void perform(
            'venue:' + venue.venueId,
            () => setAdminOnchainVenueStatus(venue, active ? 'DISABLED' : 'ACTIVE'),
            venue.chainCode + ' venue is now ' + (active ? 'disabled.' : 'active.'),
          )}
        />
      ) : null}
    </VadCard>
  );
}

function TabButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useVadTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surfaceRaised,
        borderWidth: 1,
        borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <VadText variant="caption" tone={selected ? 'brand' : 'secondary'}>{label}</VadText>
    </Pressable>
  );
}

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={{ gap: 3 }}>
      <VadText variant="heading">{title}</VadText>
      <VadText variant="caption" tone="secondary">{detail}</VadText>
    </View>
  );
}

function StatusChip({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  return (
    <VadChip
      label={normalized}
      tone={normalized === 'ACTIVE' ? 'yes' : normalized === 'SUSPENDED' ? 'warning' : 'neutral'}
    />
  );
}

function environmentOf(metadata: Record<string, unknown> | null | undefined) {
  return String(metadata?.environment ?? 'PRODUCTION').toUpperCase();
}

function shortRef(value: string) {
  if (value.length <= 20) return value;
  return value.slice(0, 9) + '…' + value.slice(-7);
}
