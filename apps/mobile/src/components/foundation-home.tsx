import type { RuntimeCapabilityKey } from '@vad/types';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette } from '@/constants/palette';
import type { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';

interface FoundationHomeProps {
  email: string;
  runtime: ReturnType<typeof useRuntimeCapabilities>;
  onRefresh(): Promise<void>;
  onSignOut(): Promise<void>;
}

const actions: {
  key: RuntimeCapabilityKey;
  label: string;
  phase: string;
}[] = [
  { key: 'deposit', label: 'Deposit NGN', phase: 'Phase 2' },
  { key: 'submitMarketProposal', label: 'Propose a market', phase: 'Phase 3' },
  { key: 'trade', label: 'Take a position', phase: 'Phase 4' },
];

function explainReason(reason?: string) {
  if (!reason) return 'Backend policy has not enabled this action.';
  if (reason.startsWith('PHASE_')) return `Planned for ${reason.slice(6, 7)} of the build.`;
  if (reason === 'ACCOUNT_NOT_ACTIVE') return 'Your account is not currently active.';
  return 'Unavailable until backend policy confirms access.';
}

export function FoundationHome({
  email,
  runtime,
  onRefresh,
  onSignOut,
}: FoundationHomeProps) {
  const { snapshot, isRefreshing } = runtime;
  const isConnected = snapshot.status === 'ready';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void onRefresh()}
            tintColor={palette.signal}
          />
        }>
        <View style={styles.header}>
          <View style={styles.brandMark}>
            <Text style={styles.brandLetter}>V</Text>
          </View>
          <View>
            <Text style={styles.brand}>VAD</Text>
            <Text numberOfLines={1} style={styles.identity}>{email}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => void onSignOut()} style={styles.signOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View style={styles.liveRow}>
            <View style={[styles.dot, !isConnected && styles.dotWarning]} />
            <Text style={styles.liveText}>
              {isConnected ? 'BACKEND POLICY CONNECTED' : 'FAIL-CLOSED MODE'}
            </Text>
          </View>
          <Text style={styles.eyebrow}>OPEN CONVICTION</Text>
          <Text style={styles.title}>Markets begin with a better question.</Text>
          <Text style={styles.subtitle}>
            VAD is laying the identity, policy, audit, provider, asset, and ledger
            foundations before financial activity is switched on.
          </Text>
        </View>

        <View style={styles.contextGrid}>
          <ContextItem label="Launch market" value="Nigeria" />
          <ContextItem label="Settlement asset" value={snapshot.context.activeAssetCodes.includes('NGN') ? 'NGN · Active' : 'Policy pending'} />
          <ContextItem label="Build state" value="Phase 1" />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionEyebrow}>WHAT COMES NEXT</Text>
          <Text style={styles.sectionTitle}>Capability controlled. Never guessed.</Text>
        </View>

        <View style={styles.actionList}>
          {actions.map((action) => {
            const enabled = snapshot.capabilities[action.key];
            return (
              <View key={action.key} style={styles.actionCard}>
                <View style={styles.actionCopy}>
                  <Text style={styles.actionPhase}>{action.phase}</Text>
                  <Text style={styles.actionLabel}>{action.label}</Text>
                  <Text style={styles.actionReason}>
                    {enabled ? 'Enabled by current backend policy.' : explainReason(snapshot.reasons[action.key])}
                  </Text>
                </View>
                <View style={[styles.statusBadge, enabled && styles.statusBadgeEnabled]}>
                  <Text style={[styles.statusText, enabled && styles.statusTextEnabled]}>
                    {enabled ? 'AVAILABLE' : 'LOCKED'}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.truthCard}>
          <Text style={styles.truthIndex}>01</Text>
          <View style={styles.truthCopy}>
            <Text style={styles.truthLabel}>CONTROLLED TRUTH</Text>
            <Text style={styles.truthTitle}>The client does not make the rules.</Text>
            <Text style={styles.truthBody}>
              Eligibility, assets, fees, balances, market state, oracle resolution,
              and settlement are decisions made and audited by the backend.
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          {isRefreshing ? <ActivityIndicator color={palette.signal} /> : null}
          <Text style={styles.footerText}>Request {snapshot.requestId}</Text>
          <Text style={styles.footerText}>
            Evaluated {new Date(snapshot.evaluatedAt).toLocaleTimeString()}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ContextItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.contextItem}>
      <Text style={styles.contextLabel}>{label}</Text>
      <Text style={styles.contextValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: palette.ink, flex: 1 },
  content: { alignSelf: 'center', maxWidth: 920, paddingBottom: 52, paddingHorizontal: 20, width: '100%' },
  header: { alignItems: 'center', borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: 'row', paddingVertical: 16 },
  brandMark: { alignItems: 'center', backgroundColor: palette.signal, borderRadius: 10, height: 36, justifyContent: 'center', marginRight: 10, width: 36 },
  brandLetter: { color: palette.ink, fontSize: 19, fontWeight: '900' },
  brand: { color: palette.text, fontSize: 17, fontWeight: '900' },
  identity: { color: palette.textMuted, fontSize: 11, maxWidth: 190 },
  signOut: { borderColor: palette.line, borderRadius: 999, borderWidth: 1, marginLeft: 'auto', paddingHorizontal: 14, paddingVertical: 9 },
  signOutText: { color: palette.textMuted, fontSize: 12, fontWeight: '700' },
  hero: { backgroundColor: palette.inkRaised, borderColor: palette.line, borderRadius: 26, borderWidth: 1, marginTop: 24, overflow: 'hidden', paddingHorizontal: 24, paddingVertical: 30 },
  liveRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 34 },
  dot: { backgroundColor: palette.signal, borderRadius: 99, height: 8, marginRight: 8, width: 8 },
  dotWarning: { backgroundColor: palette.warning },
  liveText: { color: palette.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  eyebrow: { color: palette.signal, fontSize: 11, fontWeight: '900', letterSpacing: 2.2 },
  title: { color: palette.text, fontSize: 40, fontWeight: '900', letterSpacing: -1.4, lineHeight: 43, marginTop: 12, maxWidth: 650 },
  subtitle: { color: palette.textMuted, fontSize: 15, lineHeight: 24, marginTop: 16, maxWidth: 650 },
  contextGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  contextItem: { backgroundColor: palette.panel, borderColor: palette.line, borderRadius: 16, borderWidth: 1, flexGrow: 1, minWidth: 160, padding: 16 },
  contextLabel: { color: palette.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' },
  contextValue: { color: palette.text, fontSize: 17, fontWeight: '800', marginTop: 6 },
  sectionHeader: { marginBottom: 14, marginTop: 38 },
  sectionEyebrow: { color: palette.signal, fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  sectionTitle: { color: palette.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.6, marginTop: 8 },
  actionList: { gap: 10 },
  actionCard: { alignItems: 'center', backgroundColor: palette.inkRaised, borderColor: palette.line, borderRadius: 18, borderWidth: 1, flexDirection: 'row', padding: 18 },
  actionCopy: { flex: 1, paddingRight: 12 },
  actionPhase: { color: palette.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  actionLabel: { color: palette.text, fontSize: 17, fontWeight: '800', marginTop: 5 },
  actionReason: { color: palette.textMuted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  statusBadge: { backgroundColor: palette.panelSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  statusBadgeEnabled: { backgroundColor: palette.signal },
  statusText: { color: palette.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  statusTextEnabled: { color: palette.ink },
  truthCard: { backgroundColor: palette.signal, borderRadius: 22, flexDirection: 'row', marginTop: 34, padding: 22 },
  truthIndex: { color: palette.ink, fontSize: 12, fontWeight: '900', marginRight: 18, opacity: 0.55 },
  truthCopy: { flex: 1 },
  truthLabel: { color: palette.ink, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  truthTitle: { color: palette.ink, fontSize: 21, fontWeight: '900', marginTop: 8 },
  truthBody: { color: palette.ink, fontSize: 13, lineHeight: 20, marginTop: 8, opacity: 0.78 },
  footer: { alignItems: 'center', gap: 6, marginTop: 26 },
  footerText: { color: palette.textMuted, fontSize: 10 },
});
