import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { palette } from '@/constants/palette';
import {
  getAdminMarketQueue,
  getAdminOracleQueue,
  getAdminRuntimeSummary,
  getMyProposals,
  getOpenOrders,
  getPositions,
  getWalletSummary,
  listMarkets,
  placeOrder,
  quoteTrade,
  submitMarketProposal,
  type MarketCatalogItem,
  type TradeQuote,
} from '@/services/market-api';

type Tab = 'Home' | 'Markets' | 'Portfolio' | 'Create' | 'Admin';

type Props = {
  email: string;
  canTrade: boolean;
  canSubmitProposal: boolean;
  onSignOut: () => Promise<void> | void;
};

const money = (value: unknown) => `₦${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const pricePct = (value: unknown) => `${Math.round(Number(value ?? 0) * 100)}%`;

export function VadProductShell({ email, canTrade, canSubmitProposal, onSignOut }: Props) {
  const [tab, setTab] = useState<Tab>('Home');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markets, setMarkets] = useState<MarketCatalogItem[]>([]);
  const [wallet, setWallet] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [adminSummary, setAdminSummary] = useState<Record<string, number | string> | null>(null);
  const [adminMarkets, setAdminMarkets] = useState<Record<string, unknown>[]>([]);
  const [adminOracle, setAdminOracle] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<MarketCatalogItem | null>(null);
  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [price, setPrice] = useState('0.50');
  const [quantity, setQuantity] = useState('100');
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [working, setWorking] = useState(false);
  const [proposalQuestion, setProposalQuestion] = useState('');
  const [proposalContext, setProposalContext] = useState('');
  const [proposalCategory, setProposalCategory] = useState('Sports');

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      listMarkets(),
      getWalletSummary(),
      getPositions(),
      getOpenOrders(),
      getMyProposals(),
      getAdminRuntimeSummary(),
      getAdminMarketQueue(),
      getAdminOracleQueue(),
    ]);
    if (results[0].status === 'fulfilled') setMarkets(results[0].value);
    if (results[1].status === 'fulfilled') setWallet(results[1].value);
    if (results[2].status === 'fulfilled') setPositions(results[2].value);
    if (results[3].status === 'fulfilled') setOrders(results[3].value);
    if (results[4].status === 'fulfilled') setProposals(results[4].value);
    if (results[5].status === 'fulfilled') setAdminSummary(results[5].value);
    if (results[6].status === 'fulfilled') setAdminMarkets(results[6].value);
    if (results[7].status === 'fulfilled') setAdminOracle(results[7].value);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const ngnWallet = useMemo(() => wallet.find((row) => row.asset_code === 'NGN') ?? wallet[0], [wallet]);
  const tabs: Tab[] = adminSummary ? ['Home', 'Markets', 'Portfolio', 'Create', 'Admin'] : ['Home', 'Markets', 'Portfolio', 'Create'];

  async function previewTrade() {
    if (!selected) return;
    setWorking(true);
    try {
      const next = await quoteTrade({
        instrumentPublicId: selected.instrument_public_id,
        outcomeCode: outcome,
        side,
        price: Number(price),
        quantity: Number(quantity),
      });
      setQuote(next);
    } catch (error) {
      Alert.alert('Could not quote trade', error instanceof Error ? error.message : 'Please check the order details.');
    } finally {
      setWorking(false);
    }
  }

  async function executeTrade() {
    if (!quote) return;
    setWorking(true);
    try {
      await placeOrder(quote);
      Alert.alert('Order placed', 'Your order is now in the VAD market and may fill immediately if matching liquidity exists.');
      setQuote(null);
      setSelected(null);
      await load();
    } catch (error) {
      Alert.alert('Order not placed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorking(false);
    }
  }

  async function createProposal() {
    setWorking(true);
    try {
      await submitMarketProposal({ question: proposalQuestion, context: proposalContext, category: proposalCategory });
      setProposalQuestion('');
      setProposalContext('');
      Alert.alert('Proposal submitted', 'VAD will check duplication, clarity, oracle resolvability and market governance before financial activation.');
      await load();
    } catch (error) {
      Alert.alert('Proposal not submitted', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color={palette.signal} size="large" /></View>;
  }

  return (
    <View style={styles.root}>
      <View style={styles.topbar}>
        <View><Text style={styles.brand}>VAD</Text><Text style={styles.subtle}>Value Asset Depot</Text></View>
        <Pressable onPress={() => void onSignOut()}><Text style={styles.signOut}>Sign out</Text></Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.signal} />}
      >
        {tab === 'Home' && <>
          <Text style={styles.eyebrow}>OPEN CONVICTION · CONTROLLED TRUTH</Text>
          <Text style={styles.hero}>Markets built around what people believe next.</Text>
          <Text style={styles.subtle}>{email}</Text>
          <View style={styles.balanceCard}>
            <Text style={styles.subtle}>Available NGN</Text>
            <Text style={styles.balance}>{money(ngnWallet?.available_balance)}</Text>
            <Text style={styles.subtle}>Reserved {money(ngnWallet?.reserved_balance)}</Text>
          </View>
          <SectionTitle title="Live conviction" action={`${markets.length} markets`} />
          {markets.slice(0, 4).map((market) => <MarketCard key={market.instrument_public_id} market={market} onPress={() => { setSelected(market); setTab('Markets'); }} />)}
          {!markets.length && <Empty text="No financial market is live yet. Approved canonical markets will appear here automatically." />}
        </>}

        {tab === 'Markets' && <>
          <SectionTitle title="Markets" action="NGN launch" />
          {selected ? <>
            <Pressable onPress={() => { setSelected(null); setQuote(null); }}><Text style={styles.back}>← All markets</Text></Pressable>
            <Text style={styles.marketTitle}>{selected.title}</Text>
            <Text style={styles.subtle}>{selected.category ?? 'General'} · closes {selected.closes_at ? new Date(selected.closes_at).toLocaleString() : 'by policy'}</Text>
            <View style={styles.outcomeRow}>
              <Choice active={outcome === 'YES'} label={`YES ${pricePct(selected.yes_price)}`} onPress={() => { setOutcome('YES'); setPrice(String(Number(selected.yes_price ?? 0.5))); setQuote(null); }} />
              <Choice active={outcome === 'NO'} label={`NO ${pricePct(selected.no_price)}`} onPress={() => { setOutcome('NO'); setPrice(String(Number(selected.no_price ?? 0.5))); setQuote(null); }} />
            </View>
            <View style={styles.outcomeRow}>
              <Choice active={side === 'BUY'} label="Buy" onPress={() => { setSide('BUY'); setQuote(null); }} />
              <Choice active={side === 'SELL'} label="Sell" onPress={() => { setSide('SELL'); setQuote(null); }} />
            </View>
            <Field label="Limit price (₦ per share)" value={price} onChangeText={(v) => { setPrice(v); setQuote(null); }} keyboardType="decimal-pad" />
            <Field label="Shares" value={quantity} onChangeText={(v) => { setQuantity(v); setQuote(null); }} keyboardType="decimal-pad" />
            {!canTrade && <Text style={styles.warning}>Trading is currently disabled for this account by runtime policy.</Text>}
            <Primary label={working ? 'Working…' : 'Preview order'} disabled={working || !canTrade} onPress={() => void previewTrade()} />
            {quote && <View style={styles.quoteCard}>
              <Text style={styles.cardTitle}>Order preview</Text>
              <Row label="Notional" value={money(quote.notional)} />
              <Row label="Maker fee" value={money(quote.makerFee)} />
              <Row label="Taker fee" value={money(quote.takerFee)} />
              {quote.side === 'BUY' && <Row label="Max cash reserved" value={money(quote.maximumCashReservation)} />}
              {quote.side === 'SELL' && <Row label="Shares available" value={String(quote.availableSharesToSell)} />}
              <Row label="Gross if correct" value={money(quote.potentialGrossSettlement)} />
              <Primary label="Place order" disabled={working} onPress={() => void executeTrade()} />
            </View>}
          </> : markets.map((market) => <MarketCard key={market.instrument_public_id} market={market} onPress={() => setSelected(market)} />)}
        </>}

        {tab === 'Portfolio' && <>
          <SectionTitle title="Portfolio" action={`${positions.length} positions`} />
          <Stat label="Available" value={money(ngnWallet?.available_balance)} />
          <Stat label="Reserved" value={money(ngnWallet?.reserved_balance)} />
          <Text style={styles.sectionLabel}>Open positions</Text>
          <JsonCards rows={positions} empty="No open positions yet." />
          <Text style={styles.sectionLabel}>Open orders</Text>
          <JsonCards rows={orders} empty="No open orders." />
        </>}

        {tab === 'Create' && <>
          <SectionTitle title="Propose a market" action="Not instant activation" />
          <Text style={styles.body}>Anyone can propose an idea. Financial activation happens only after canonicalization, oracle resolvability and governance checks.</Text>
          <Field label="What do you think will happen?" value={proposalQuestion} onChangeText={setProposalQuestion} multiline />
          <Field label="Context / why this matters" value={proposalContext} onChangeText={setProposalContext} multiline />
          <Field label="Category" value={proposalCategory} onChangeText={setProposalCategory} />
          <Primary label={working ? 'Submitting…' : 'Submit proposal'} disabled={working || !canSubmitProposal || proposalQuestion.trim().length < 10} onPress={() => void createProposal()} />
          <Text style={styles.sectionLabel}>Your proposals</Text>
          {proposals.map((p) => <View key={p.public_id} style={styles.card}><Text style={styles.cardTitle}>{p.question}</Text><Text style={styles.subtle}>{p.status} · {p.category ?? 'Uncategorised'}</Text></View>)}
          {!proposals.length && <Empty text="You have not proposed a market yet." />}
        </>}

        {tab === 'Admin' && adminSummary && <>
          <SectionTitle title="VAD Control Plane" action="Live backend" />
          <View style={styles.grid}>
            {Object.entries(adminSummary).filter(([k]) => k !== 'generatedAt').map(([key, value]) => <Stat key={key} label={key.replace(/([A-Z])/g, ' $1')} value={String(value)} />)}
          </View>
          <Text style={styles.sectionLabel}>Market review queue</Text>
          <JsonCards rows={adminMarkets} empty="No market proposals need review." />
          <Text style={styles.sectionLabel}>Oracle queue</Text>
          <JsonCards rows={adminOracle} empty="No oracle cases need attention." />
        </>}
      </ScrollView>

      <View style={styles.nav}>
        {tabs.map((item) => <Pressable key={item} style={styles.navItem} onPress={() => { setTab(item); setSelected(null); setQuote(null); }}><Text style={[styles.navText, tab === item && styles.navActive]}>{item}</Text></Pressable>)}
      </View>
    </View>
  );
}

function MarketCard({ market, onPress }: { market: MarketCatalogItem; onPress: () => void }) {
  return <Pressable style={styles.card} onPress={onPress}>
    <Text style={styles.cardTitle}>{market.title}</Text>
    <Text style={styles.subtle}>{market.category ?? 'General'} · {market.asset_code}</Text>
    <View style={styles.outcomeRow}><Text style={styles.yes}>YES {pricePct(market.yes_price)}</Text><Text style={styles.no}>NO {pricePct(market.no_price)}</Text></View>
  </Pressable>;
}
function SectionTitle({ title, action }: { title: string; action?: string }) { return <View style={styles.sectionHead}><Text style={styles.sectionTitle}>{title}</Text>{action && <Text style={styles.subtle}>{action}</Text>}</View>; }
function Empty({ text }: { text: string }) { return <View style={styles.empty}><Text style={styles.subtle}>{text}</Text></View>; }
function Choice({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { return <Pressable style={[styles.choice, active && styles.choiceActive]} onPress={onPress}><Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text></Pressable>; }
function Primary({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) { return <Pressable disabled={disabled} style={[styles.primary, disabled && styles.disabled]} onPress={onPress}><Text style={styles.primaryText}>{label}</Text></Pressable>; }
function Field(props: any) { return <View style={styles.field}><Text style={styles.fieldLabel}>{props.label}</Text><TextInput {...props} label={undefined} placeholderTextColor={palette.textMuted} style={[styles.input, props.multiline && styles.multiline]} /></View>; }
function Row({ label, value }: { label: string; value: string }) { return <View style={styles.row}><Text style={styles.subtle}>{label}</Text><Text style={styles.rowValue}>{value}</Text></View>; }
function Stat({ label, value }: { label: string; value: string }) { return <View style={styles.stat}><Text style={styles.subtle}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>; }
function JsonCards({ rows, empty }: { rows: Record<string, unknown>[]; empty: string }) { if (!rows.length) return <Empty text={empty} />; return <>{rows.slice(0, 12).map((row, index) => <View style={styles.card} key={String((row as any).public_id ?? (row as any).order_public_id ?? index)}><Text style={styles.cardTitle}>{String((row as any).title ?? (row as any).question ?? (row as any).outcome_code ?? (row as any).side ?? 'VAD record')}</Text><Text style={styles.subtle} numberOfLines={3}>{Object.entries(row).slice(0, 5).map(([k, v]) => `${k}: ${String(v ?? '—')}`).join(' · ')}</Text></View>)}</>; }

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:palette.ink},loading:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:palette.ink},
  topbar:{paddingTop:54,paddingHorizontal:20,paddingBottom:14,borderBottomWidth:1,borderBottomColor:palette.line,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  brand:{color:palette.signal,fontSize:25,fontWeight:'900',letterSpacing:2},signOut:{color:palette.textMuted,fontWeight:'700'},content:{padding:20,paddingBottom:110,gap:14},
  eyebrow:{color:palette.signal,fontWeight:'800',fontSize:12,letterSpacing:1.4},hero:{color:palette.text,fontSize:30,fontWeight:'900',lineHeight:35,maxWidth:650},body:{color:palette.textMuted,fontSize:15,lineHeight:22},subtle:{color:palette.textMuted,fontSize:13},
  balanceCard:{backgroundColor:palette.signal,borderRadius:24,padding:20,marginTop:6},balance:{fontSize:34,fontWeight:'900',color:palette.ink,marginVertical:6},
  sectionHead:{marginTop:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},sectionTitle:{fontSize:22,fontWeight:'900',color:palette.text},sectionLabel:{color:palette.text,fontWeight:'800',fontSize:16,marginTop:8},
  card:{backgroundColor:palette.panel,borderRadius:20,padding:16,borderWidth:1,borderColor:palette.line,gap:8},cardTitle:{color:palette.text,fontSize:17,fontWeight:'800',lineHeight:23},
  outcomeRow:{flexDirection:'row',gap:10,alignItems:'center',marginTop:6},yes:{color:palette.signal,fontWeight:'900'},no:{color:palette.warning,fontWeight:'900'},
  empty:{padding:22,borderRadius:18,borderWidth:1,borderColor:palette.line,borderStyle:'dashed'},back:{color:palette.signal,fontWeight:'800'},marketTitle:{color:palette.text,fontSize:27,fontWeight:'900',lineHeight:33},
  choice:{flex:1,borderRadius:14,borderWidth:1,borderColor:palette.line,padding:13,alignItems:'center'},choiceActive:{backgroundColor:palette.signal,borderColor:palette.signal},choiceText:{color:palette.text,fontWeight:'800'},choiceTextActive:{color:palette.ink},
  field:{gap:7},fieldLabel:{color:palette.textMuted,fontSize:13,fontWeight:'700'},input:{backgroundColor:palette.panel,borderWidth:1,borderColor:palette.line,borderRadius:14,paddingHorizontal:14,paddingVertical:13,color:palette.text,fontSize:16},multiline:{minHeight:100,textAlignVertical:'top'},
  primary:{backgroundColor:palette.signal,borderRadius:15,padding:15,alignItems:'center'},primaryText:{color:palette.ink,fontWeight:'900',fontSize:15},disabled:{opacity:.4},warning:{color:palette.warning,fontSize:13},
  quoteCard:{backgroundColor:palette.inkRaised,borderRadius:20,padding:16,borderWidth:1,borderColor:palette.line,gap:10},row:{flexDirection:'row',justifyContent:'space-between',gap:12},rowValue:{color:palette.text,fontWeight:'800'},
  stat:{flex:1,minWidth:140,backgroundColor:palette.panelSoft,padding:15,borderRadius:16},statValue:{color:palette.text,fontWeight:'900',fontSize:22,marginTop:5},grid:{flexDirection:'row',flexWrap:'wrap',gap:10},
  nav:{position:'absolute',bottom:0,left:0,right:0,backgroundColor:palette.inkRaised,borderTopWidth:1,borderTopColor:palette.line,flexDirection:'row',paddingBottom:22,paddingTop:10,paddingHorizontal:6},navItem:{flex:1,alignItems:'center',paddingVertical:8},navText:{color:palette.textMuted,fontWeight:'700',fontSize:12},navActive:{color:palette.signal},
});
