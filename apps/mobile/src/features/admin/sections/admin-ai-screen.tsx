import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';

import { VadBottomSheet } from '@/components/ui/vad-bottom-sheet';
import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadSkeleton } from '@/components/ui/vad-skeleton';
import { VadText } from '@/components/ui/vad-text';
import { useAdminData } from '@/providers/admin-data-provider';
import { useVadTheme } from '@/providers/theme-provider';
import {
  getAdminAiProviderCatalog,
  upsertAdminAiProviderModel,
  type AiProviderAdapter,
  type AiProviderModelRow,
} from '@/services/ai-admin-api';

const ADAPTERS: { value: AiProviderAdapter; label: string; detail: string }[] = [
  {
    value: 'OPENAI_COMPATIBLE',
    label: 'OpenAI-compatible',
    detail: 'For services exposing a compatible chat-completions JSON interface.',
  },
  {
    value: 'GEMINI_GENERATE_CONTENT',
    label: 'GenerateContent',
    detail: 'For Gemini-style generate-content protocol endpoints.',
  },
  {
    value: 'ANTHROPIC_MESSAGES',
    label: 'Messages API',
    detail: 'For Anthropic-style Messages protocol endpoints.',
  },
  {
    value: 'CLOUDFLARE_WORKERS_AI',
    label: 'Workers AI',
    detail: 'For Cloudflare Workers AI message endpoints.',
  },
];

export function AdminAiScreen() {
  const theme = useVadTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const data = useAdminData();
  const isSuperAdmin = data.access.isSuperAdmin;
  const [models, setModels] = useState<AiProviderModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConfigure, setShowConfigure] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await getAdminAiProviderCatalog();
      setModels(rows);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'AI provider catalog could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const active = useMemo(
    () => models.filter((row) => ['ACTIVE', 'DEGRADED'].includes(row.provider_status) && ['ACTIVE', 'DEGRADED'].includes(row.model_status)),
    [models],
  );
  const admissionModels = useMemo(
    () => models.filter((row) => row.capabilities?.includes('MARKET_ADMISSION')),
    [models],
  );

  if (loading) {
    return (
      <View style={{ gap: theme.spacing.md }}>
        <VadSkeleton width="48%" height={32} />
        <VadSkeleton height={120} />
        <VadSkeleton height={82} />
        <VadSkeleton height={82} />
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.xxl }}>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: theme.spacing.xl, alignItems: wide ? 'flex-end' : 'stretch' }}>
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <VadText variant="label" tone="brand">AI CONTROL PLANE</VadText>
          <VadText variant="title">Intelligence without provider lock-in.</VadText>
          <VadText tone="secondary">
            VAD routes market-admission intelligence by capability and priority. Models can fail over across providers, while deterministic database rules remain the authority that permits publication.
          </VadText>
        </View>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: theme.spacing.sm }}>
          <VadButton
            label="Provider status controls"
            variant="secondary"
            fullWidth={!wide}
            onPress={() => router.push('/admin/providers')}
          />
          {isSuperAdmin ? (
            <VadButton
              label="Configure AI model"
              fullWidth={!wide}
              onPress={() => setShowConfigure(true)}
            />
          ) : null}
        </View>
      </View>

      {message ? (
        <View style={{ borderLeftWidth: 3, borderLeftColor: theme.colors.yes, backgroundColor: theme.colors.yesSoft, padding: theme.spacing.md, gap: 3 }}>
          <VadText variant="caption" tone="yes">AI CONFIGURATION SAVED</VadText>
          <VadText variant="caption" tone="secondary">{message}</VadText>
        </View>
      ) : null}

      {error ? <VadErrorState title="AI provider catalog unavailable" message={error} onRetry={() => void load()} /> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        <Metric label="Configured models" value={models.length} />
        <Metric label="Admission capable" value={admissionModels.length} />
        <Metric label="Currently routable" value={active.length} tone={active.length ? 'yes' : 'warning'} />
      </View>

      <VadCard variant="muted" style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: theme.spacing.md, justifyContent: 'space-between' }}>
          <View style={{ flex: 1, gap: 3 }}>
            <VadText variant="bodyStrong">Market admission routing</VadText>
            <VadText variant="caption" tone="secondary">
              A provider is considered only when its integration and model are active or degraded, it advertises MARKET_ADMISSION, and its configured protocol endpoint is usable. Lower priority numbers run first; failures fall through to the next eligible model.
            </VadText>
          </View>
          <VadChip label={active.length ? `${active.length} ROUTABLE` : 'NO ACTIVE MODEL'} tone={active.length ? 'yes' : 'warning'} />
        </View>
        <VadText variant="caption" tone="tertiary">
          Saving a model does not activate its provider. New provider integrations start disabled and still use the existing provider status approval controls.
        </VadText>
      </VadCard>

      {!models.length && !error ? (
        <VadEmptyState
          title="No AI model configured"
          body={isSuperAdmin
            ? 'Configure any supported protocol adapter and model. Until a real provider is activated, market admission fails closed to the human-review queue.'
            : 'No AI model has been configured for market admission yet. A Super Admin must configure one before it can be activated.'}
          actionLabel={isSuperAdmin ? 'Configure first model' : undefined}
          onAction={isSuperAdmin ? () => setShowConfigure(true) : undefined}
        />
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          <View style={{ gap: 2 }}>
            <VadText variant="heading">Configured models</VadText>
            <VadText variant="caption" tone="secondary">Provider identity is configuration, not application logic.</VadText>
          </View>
          {models.map((row) => (
            <AiModelRow key={row.ai_provider_id} row={row} />
          ))}
        </View>
      )}

      <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
        <VadText variant="bodyStrong">Credential boundary</VadText>
        <VadText variant="caption" tone="secondary">
          The admin app stores only a Supabase Edge Function secret reference such as VAD_AI_PRIMARY_API_KEY. It never stores or displays the API-key value. AI credential references are restricted to the VAD_AI_ namespace so a configured provider cannot request internal Supabase runtime secrets.
        </VadText>
      </VadCard>

      <ConfigureAiSheet
        visible={showConfigure}
        working={working}
        onClose={() => {
          if (!working) setShowConfigure(false);
        }}
        onSave={async (input) => {
          setWorking(true);
          setError(null);
          try {
            const modelId = await upsertAdminAiProviderModel(input);
            setShowConfigure(false);
            setMessage(`AI model ${modelId} is configured for MARKET_ADMISSION. Activate the provider through Provider status controls only after its referenced Edge Function secret exists.`);
            await load();
            await data.refresh();
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'AI model configuration failed.');
          } finally {
            setWorking(false);
          }
        }}
      />
    </View>
  );
}

function Metric({ label, value, tone = 'brand' }: { label: string; value: number; tone?: 'brand' | 'yes' | 'warning' }) {
  const theme = useVadTheme();
  return (
    <View style={{ minWidth: 150, flex: 1, borderTopWidth: 2, borderTopColor: tone === 'yes' ? theme.colors.yes : tone === 'warning' ? theme.colors.warning : theme.colors.brandPrimary, paddingTop: theme.spacing.sm, gap: 2 }}>
      <VadText variant="caption" tone="secondary">{label.toUpperCase()}</VadText>
      <VadText variant="heading">{value}</VadText>
    </View>
  );
}

function AiModelRow({ row }: { row: AiProviderModelRow }) {
  const theme = useVadTheme();
  const routable = ['ACTIVE', 'DEGRADED'].includes(row.provider_status) && ['ACTIVE', 'DEGRADED'].includes(row.model_status);
  return (
    <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <VadText variant="bodyStrong">{row.provider_name} · {row.model_code}</VadText>
          <VadText variant="caption" tone="secondary">
            {row.provider_code} · {row.environment} · Priority {row.priority}
          </VadText>
        </View>
        <VadChip label={routable ? 'ROUTABLE' : row.provider_status} tone={routable ? 'yes' : 'warning'} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
        <VadChip label={row.adapter?.replaceAll('_', ' ') ?? 'NO ADAPTER'} />
        <VadChip label={row.model_status} tone={row.model_status === 'ACTIVE' ? 'yes' : 'warning'} />
        {row.capabilities?.map((capability) => <VadChip key={capability} label={capability.replaceAll('_', ' ')} tone="brand" />)}
      </View>
      <VadText variant="caption" tone="tertiary" numberOfLines={2}>
        Endpoint: {row.endpoint ?? 'not configured'} · Secret reference: {row.secret_reference ?? 'not configured'}
      </VadText>
    </VadCard>
  );
}

function ConfigureAiSheet({
  visible,
  working,
  onClose,
  onSave,
}: {
  visible: boolean;
  working: boolean;
  onClose: () => void;
  onSave: (input: {
    providerCode: string;
    providerName: string;
    environment: 'SANDBOX' | 'PRODUCTION';
    adapter: AiProviderAdapter;
    endpoint: string;
    modelCode: string;
    secretReference: string;
    priority: number;
    apiVersion?: string | null;
  }) => Promise<void>;
}) {
  const theme = useVadTheme();
  const [providerCode, setProviderCode] = useState('');
  const [providerName, setProviderName] = useState('');
  const [environment, setEnvironment] = useState<'SANDBOX' | 'PRODUCTION'>('SANDBOX');
  const [adapter, setAdapter] = useState<AiProviderAdapter>('OPENAI_COMPATIBLE');
  const [endpoint, setEndpoint] = useState('');
  const [modelCode, setModelCode] = useState('');
  const [secretReference, setSecretReference] = useState('VAD_AI_');
  const [priority, setPriority] = useState('100');
  const [apiVersion, setApiVersion] = useState('');

  const priorityValue = Number(priority);
  const secretReady = /^VAD_AI_[A-Z0-9_]+$/.test(secretReference.trim().toUpperCase());
  const ready = providerCode.trim().length > 0 && providerName.trim().length >= 2 && endpoint.trim().startsWith('https://') && modelCode.trim().length > 0 && secretReady && Number.isInteger(priorityValue) && priorityValue >= 0 && priorityValue <= 10000 && (adapter !== 'ANTHROPIC_MESSAGES' || apiVersion.trim().length > 0);

  return (
    <VadBottomSheet visible={visible} title="Configure AI model" onClose={onClose}>
      <View style={{ gap: theme.spacing.lg }}>
        <View style={{ gap: 2 }}>
          <VadText variant="bodyStrong">Provider-neutral model registration</VadText>
          <VadText variant="caption" tone="secondary">
            Choose the API protocol this model speaks. The provider brand itself is not hardcoded into market-admission logic.
          </VadText>
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <VadButton label="Sandbox" size="small" variant={environment === 'SANDBOX' ? 'primary' : 'secondary'} onPress={() => setEnvironment('SANDBOX')} style={{ flex: 1 }} />
          <VadButton label="Production" size="small" variant={environment === 'PRODUCTION' ? 'primary' : 'secondary'} onPress={() => setEnvironment('PRODUCTION')} style={{ flex: 1 }} />
        </View>

        <VadInput label="Provider code" value={providerCode} onChangeText={setProviderCode} autoCapitalize="characters" placeholder="MY_AI_PROVIDER" hint="Stable internal identifier; do not reuse a code belonging to another provider type." />
        <VadInput label="Provider name" value={providerName} onChangeText={setProviderName} placeholder="Provider display name" />

        <View style={{ gap: theme.spacing.xs }}>
          <VadText variant="caption" tone="tertiary">API PROTOCOL</VadText>
          {ADAPTERS.map((item) => {
            const selected = adapter === item.value;
            return (
              <Pressable
                key={item.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setAdapter(item.value)}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: selected ? theme.colors.brandPrimary : theme.colors.border,
                  backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
                  borderRadius: theme.radius.md,
                  padding: theme.spacing.md,
                  gap: 2,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <VadText variant="bodyStrong" tone={selected ? 'brand' : 'primary'}>{item.label}</VadText>
                <VadText variant="caption" tone="secondary">{item.detail}</VadText>
              </Pressable>
            );
          })}
        </View>

        <VadInput label="HTTPS endpoint" value={endpoint} onChangeText={setEndpoint} autoCapitalize="none" autoCorrect={false} placeholder="https://…/{model}" hint="Use {model} where the model code belongs in the URL. The endpoint is configuration, not a vendor-specific code path." />
        <VadInput label="Model code" value={modelCode} onChangeText={setModelCode} autoCapitalize="none" autoCorrect={false} placeholder="model-name-or-id" />
        {adapter === 'ANTHROPIC_MESSAGES' ? <VadInput label="API version header" value={apiVersion} onChangeText={setApiVersion} autoCapitalize="none" placeholder="Provider API version" /> : null}
        <VadInput label="Edge Function secret reference" value={secretReference} onChangeText={(value) => setSecretReference(value.toUpperCase())} autoCapitalize="characters" autoCorrect={false} placeholder="VAD_AI_PRIMARY_API_KEY" hint="Reference only. The API-key value belongs in Supabase Edge Function secrets and is never stored here." error={secretReference.length > 0 && !secretReady ? 'Use only the VAD_AI_ secret namespace.' : undefined} />
        <VadInput label="Priority" value={priority} onChangeText={setPriority} keyboardType="number-pad" placeholder="100" hint="Lower number = attempted earlier. Another configured model is used automatically when this one fails." />

        <View style={{ borderLeftWidth: 3, borderLeftColor: theme.colors.warning, backgroundColor: theme.colors.warningSoft, padding: theme.spacing.md, gap: 2 }}>
          <VadText variant="caption" tone="warning">ACTIVATION IS SEPARATE</VadText>
          <VadText variant="caption" tone="secondary">
            This saves the provider/model configuration but does not make a new provider routable. Use Provider status controls afterward; normal provider activation still requires its existing independent approval path.
          </VadText>
        </View>

        <VadButton
          label="Save AI model"
          loading={working}
          disabled={!ready}
          onPress={() => void onSave({
            providerCode,
            providerName,
            environment,
            adapter,
            endpoint,
            modelCode,
            secretReference,
            priority: priorityValue,
            apiVersion: apiVersion.trim() || null,
          })}
        />
      </View>
    </VadBottomSheet>
  );
}
