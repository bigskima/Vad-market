import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

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
  type OrderRow,
  type PositionRow,
  type ProposalRow,
  type TradeQuote,
  type WalletRow,
} from '@/services/market-api';

type Tab = 'Home' | 'Markets' | 'Portfolio' | 'Create' | 'Admin';
type Props = { email: string; canTrade: boolean; canSubmitProposal: boolean; onSignOut: () => Promise<void> | void };

const money = (value: unknown) => `₦${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const pct = (value: unknown) => `${Math.round(Number(value ?? 0) * 100)}%`;

export function VadProductShell({ email, canTrade, canSubmitProposal, onSignOut }: Props) {
  const [tab, setTab] = useState<Tab>('Home');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markets, setMarkets] = useState<MarketCatalogItem[]>([]);
  const [wallet, setWallet] = useState<WalletRow[]>([]);
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
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
  const [question, setQuestion] = useState('');
  const [context, setContext] = useState('');
  const [category, setCategory] = useState('Sports');

  const load = useCallback(async () => {
    const results = await Promise.allSettled([listMarkets(), getWalletSummary(), getPositions(), getOpenOrders(), getMyProposals(), getAdminRuntimeSummary(), getAdminMarketQueue(), getAdminOracleQueue()]);
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
    let cancelled = false;
    const timer = setTimeout(() => {
      void load().finally(() => {
        if (!cancelled) setLoading(false);
      });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load]);

  const refresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);
  const ngn = useMemo(() => wallet.find((row) => row.asset_code === 'NGN') ?? wallet[0], [wallet]);
  const tabs: Tab[] = adminSummary ? ['Home', 'Markets', 'Portfolio', 'Create', 'Admin'] : ['Home', 'Markets', 'Portfolio', 'Create'];

  async function preview() {
    if (!selected) return;
    setWorking(true);
    try { setQuote(await quoteTrade({ instrumentPublicId: selected.instrument_public_id, outcomeCode: outcome, side, price: Number(price), quantity: Number(quantity) })); }
    catch (error) { Alert.alert('Could not quote trade', error instanceof Error ? error.message : 'Check the order details.'); }
    finally { setWorking(false); }
  }

  async function execute() {
    if (!quote) return;
    setWorking(true);
    try { await placeOrder(quote); Alert.alert('Order placed', 'Your order is live and may fill immediately if compatible liquidity exists.'); setQuote(null); setSelected(null); await load(); }
    catch (error) { Alert.alert('Order not placed', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setWorking(false); }
  }

  async function propose() {
    setWorking(true);
    try { await submitMarketProposal({ question, context, category }); setQuestion(''); setContext(''); Alert.alert('Proposal submitted', 'VAD will check duplication, clarity, oracle resolvability and governance before financial activation.'); await load(); }
    catch (error) { Alert.alert('Proposal not submitted', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setWorking(false); }
  }

  if (loading) return <View style={s.loading}><ActivityIndicator color={palette.signal} size="large" /></View>;

  return <View style={s.root}>
    <View style={s.topbar}><View><Text style={s.brand}>VAD</Text><Text style={s.muted}>Value Asset Depot</Text></View><Pressable onPress={() => void onSignOut()}><Text style={s.link}>Sign out</Text></Pressable></View>
    <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.signal} />}>
      {tab === 'Home' && <><Text style={s.eyebrow}>OPEN CONVICTION · CONTROLLED TRUTH</Text><Text style={s.hero}>Markets built around what people believe next.</Text><Text style={s.muted}>{email}</Text><View style={s.balance}><Text style={s.darkMuted}>Available NGN</Text><Text style={s.balanceValue}>{money(ngn?.available)}</Text><Text style={s.darkMuted}>Reserved {money(ngn?.reserved)}</Text></View><Heading title="Live conviction" meta={`${markets.length} markets`} />{markets.slice(0, 4).map((m) => <Market key={m.instrument_public_id} market={m} onPress={() => { setSelected(m); setTab('Markets'); }} />)}{!markets.length && <Empty text="No financial market is live yet. Approved canonical markets will appear automatically." />}</>}

      {tab === 'Markets' && <><Heading title="Markets" meta="NGN launch" />{selected ? <><Pressable onPress={() => { setSelected(null); setQuote(null); }}><Text style={s.link}>← All markets</Text></Pressable><Text style={s.marketTitle}>{selected.title}</Text><Text style={s.muted}>{selected.category ?? 'General'} · {selected.closes_at ? `closes ${new Date(selected.closes_at).toLocaleString()}` : 'close time by policy'}</Text><View style={s.row}><Choice active={outcome === 'YES'} label={`YES ${pct(selected.yes_price)}`} onPress={() => { setOutcome('YES'); setPrice(String(Number(selected.yes_price ?? .5))); setQuote(null); }} /><Choice active={outcome === 'NO'} label={`NO ${pct(selected.no_price)}`} onPress={() => { setOutcome('NO'); setPrice(String(Number(selected.no_price ?? .5))); setQuote(null); }} /></View><View style={s.row}><Choice active={side === 'BUY'} label="Buy" onPress={() => { setSide('BUY'); setQuote(null); }} /><Choice active={side === 'SELL'} label="Sell" onPress={() => { setSide('SELL'); setQuote(null); }} /></View><Field label="Limit price (₦ per share)" value={price} onChangeText={(v) => { setPrice(v); setQuote(null); }} keyboardType="decimal-pad" /><Field label="Shares" value={quantity} onChangeText={(v) => { setQuantity(v); setQuote(null); }} keyboardType="decimal-pad" />{!canTrade && <Text style={s.warning}>Trading is disabled for this account by runtime policy.</Text>}<Button label={working ? 'Working…' : 'Preview order'} disabled={working || !canTrade} onPress={() => void preview()} />{quote && <View style={s.quote}><Text style={s.cardTitle}>Order preview</Text><Line label="Notional" value={money(quote.notional)} /><Line label="Maker fee" value={money(quote.makerFee)} /><Line label="Taker fee" value={money(quote.takerFee)} />{quote.side === 'BUY' ? <Line label="Max cash reserved" value={money(quote.maximumCashReservation)} /> : <Line label="Shares available" value={String(quote.availableSharesToSell)} />}<Line label="Gross if correct" value={money(quote.potentialGrossSettlement)} /><Button label="Place order" disabled={working} onPress={() => void execute()} /></View>}</> : markets.map((m) => <Market key={m.instrument_public_id} market={m} onPress={() => setSelected(m)} />)}</>}

      {tab === 'Portfolio' && <><Heading title="Portfolio" meta={`${positions.length} positions`} /><View style={s.row}><Stat label="Available" value={money(ngn?.available)} /><Stat label="Reserved" value={money(ngn?.reserved)} /></View><Text style={s.section}>Positions</Text><Records rows={positions} empty="No positions yet." /><Text style={s.section}>Open orders</Text><Records rows={orders} empty="No open orders." /></>}

      {tab === 'Create' && <><Heading title="Propose a market" meta="Governed activation" /><Text style={s.body}>Anyone can propose an idea. A financial market opens only after canonicalization, objective resolution checks and oracle governance.</Text><Field label="What do you think will happen?" value={question} onChangeText={setQuestion} multiline /><Field label="Context" value={context} onChangeText={setContext} multiline /><Field label="Category" value={category} onChangeText={setCategory} /><Button label={working ? 'Submitting…' : 'Submit proposal'} disabled={working || !canSubmitProposal || question.trim().length < 10} onPress={() => void propose()} /><Text style={s.section}>Your proposals</Text>{proposals.map((p) => <View key={p.public_id} style={s.card}><Text style={s.cardTitle}>{p.question}</Text><Text style={s.muted}>{p.status} · {p.category ?? 'Uncategorised'}</Text></View>)}{!proposals.length && <Empty text="You have not proposed a market yet." />}</>}

      {tab === 'Admin' && adminSummary && <><Heading title="VAD Control Plane" meta="Live backend" /><View style={s.wrap}>{Object.entries(adminSummary).filter(([k]) => k !== 'generatedAt').map(([k, v]) => <Stat key={k} label={k.replace(/([A-Z])/g, ' $1')} value={String(v)} />)}</View><Text style={s.section}>Market review queue</Text><Records rows={adminMarkets} empty="No market proposals need review." /><Text style={s.section}>Oracle queue</Text><Records rows={adminOracle} empty="No oracle cases need attention." /></>}
    </ScrollView>
    <View style={s.nav}>{tabs.map((item) => <Pressable key={item} style={s.navItem} onPress={() => { setTab(item); setSelected(null); setQuote(null); }}><Text style={[s.navText, tab === item && s.navActive]}>{item}</Text></Pressable>)}</View>
  </View>;
}

function Field({ label, multiline, ...props }: TextInputProps & { label: string }) { return <View style={s.field}><Text style={s.fieldLabel}>{label}</Text><TextInput {...props} multiline={multiline} placeholderTextColor={palette.textMuted} style={[s.input, multiline && s.multiline]} /></View>; }
function Heading({ title, meta }: { title: string; meta?: string }) { return <View style={s.heading}><Text style={s.headingText}>{title}</Text>{meta ? <Text style={s.muted}>{meta}</Text> : null}</View>; }
function Market({ market, onPress }: { market: MarketCatalogItem; onPress: () => void }) { return <Pressable style={s.card} onPress={onPress}><Text style={s.cardTitle}>{market.title}</Text><Text style={s.muted}>{market.category ?? 'General'} · {market.asset_code}</Text><View style={s.row}><Text style={s.yes}>YES {pct(market.yes_price)}</Text><Text style={s.no}>NO {pct(market.no_price)}</Text></View></Pressable>; }
function Choice({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { return <Pressable style={[s.choice, active && s.choiceActive]} onPress={onPress}><Text style={[s.choiceText, active && s.choiceActiveText]}>{label}</Text></Pressable>; }
function Button({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) { return <Pressable style={[s.button, disabled && s.disabled]} disabled={disabled} onPress={onPress}><Text style={s.buttonText}>{label}</Text></Pressable>; }
function Empty({ text }: { text: string }) { return <View style={s.empty}><Text style={s.muted}>{text}</Text></View>; }
function Line({ label, value }: { label: string; value: string }) { return <View style={s.line}><Text style={s.muted}>{label}</Text><Text style={s.lineValue}>{value}</Text></View>; }
function Stat({ label, value }: { label: string; value: string }) { return <View style={s.stat}><Text style={s.muted}>{label}</Text><Text style={s.statValue}>{value}</Text></View>; }
function Records({ rows, empty }: { rows: Record<string, unknown>[]; empty: string }) { if (!rows.length) return <Empty text={empty} />; return <>{rows.slice(0, 12).map((r, i) => <View style={s.card} key={String(r.public_id ?? r.order_id ?? r.instrument_id ?? i)}><Text style={s.cardTitle}>{String(r.market_title ?? r.question ?? r.event_title ?? r.outcome_code ?? r.side ?? 'VAD record')}</Text><Text style={s.muted} numberOfLines={3}>{Object.entries(r).slice(0, 5).map(([k, v]) => `${k}: ${String(v ?? '—')}`).join(' · ')}</Text></View>)}</>; }

const s = StyleSheet.create({root:{flex:1,backgroundColor:palette.ink},loading:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:palette.ink},topbar:{paddingTop:54,paddingHorizontal:20,paddingBottom:14,borderBottomWidth:1,borderBottomColor:palette.line,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},brand:{color:palette.signal,fontSize:25,fontWeight:'900',letterSpacing:2},link:{color:palette.signal,fontWeight:'800'},content:{padding:20,paddingBottom:110,gap:14},eyebrow:{color:palette.signal,fontSize:12,fontWeight:'900',letterSpacing:1.2},hero:{color:palette.text,fontSize:30,fontWeight:'900',lineHeight:35,maxWidth:650},body:{color:palette.textMuted,fontSize:15,lineHeight:22},muted:{color:palette.textMuted,fontSize:13},darkMuted:{color:palette.ink,fontSize:13,opacity:.7},balance:{backgroundColor:palette.signal,borderRadius:24,padding:20},balanceValue:{color:palette.ink,fontSize:34,fontWeight:'900',marginVertical:5},heading:{marginTop:8,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},headingText:{color:palette.text,fontSize:22,fontWeight:'900'},section:{color:palette.text,fontSize:16,fontWeight:'900',marginTop:7},marketTitle:{color:palette.text,fontSize:27,fontWeight:'900',lineHeight:33},card:{backgroundColor:palette.panel,borderWidth:1,borderColor:palette.line,borderRadius:20,padding:16,gap:8},cardTitle:{color:palette.text,fontSize:17,fontWeight:'800',lineHeight:23},row:{flexDirection:'row',gap:10,alignItems:'center'},wrap:{flexDirection:'row',flexWrap:'wrap',gap:10},yes:{color:palette.signal,fontWeight:'900'},no:{color:palette.warning,fontWeight:'900'},choice:{flex:1,padding:13,borderRadius:14,borderWidth:1,borderColor:palette.line,alignItems:'center'},choiceActive:{backgroundColor:palette.signal,borderColor:palette.signal},choiceText:{color:palette.text,fontWeight:'800'},choiceActiveText:{color:palette.ink},field:{gap:7},fieldLabel:{color:palette.textMuted,fontSize:13,fontWeight:'700'},input:{backgroundColor:palette.panel,borderWidth:1,borderColor:palette.line,borderRadius:14,paddingHorizontal:14,paddingVertical:13,color:palette.text,fontSize:16},multiline:{minHeight:100,textAlignVertical:'top'},button:{backgroundColor:palette.signal,borderRadius:15,padding:15,alignItems:'center'},buttonText:{color:palette.ink,fontWeight:'900'},disabled:{opacity:.4},warning:{color:palette.warning,fontSize:13},quote:{backgroundColor:palette.inkRaised,borderWidth:1,borderColor:palette.line,borderRadius:20,padding:16,gap:10},line:{flexDirection:'row',justifyContent:'space-between',gap:10},lineValue:{color:palette.text,fontWeight:'800'},stat:{flex:1,minWidth:135,backgroundColor:palette.panelSoft,borderRadius:16,padding:15},statValue:{color:palette.text,fontSize:22,fontWeight:'900',marginTop:5},empty:{padding:20,borderRadius:18,borderWidth:1,borderColor:palette.line,borderStyle:'dashed'},nav:{position:'absolute',left:0,right:0,bottom:0,backgroundColor:palette.inkRaised,borderTopWidth:1,borderTopColor:palette.line,flexDirection:'row',paddingTop:10,paddingBottom:22,paddingHorizontal:4},navItem:{flex:1,alignItems:'center',paddingVertical:8},navText:{color:palette.textMuted,fontSize:12,fontWeight:'700'},navActive:{color:palette.signal}});
