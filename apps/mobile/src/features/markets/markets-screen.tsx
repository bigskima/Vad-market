import { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadEmptyState } from '@/components/ui/vad-empty-state';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { placeOrder, quoteTrade, type MarketCatalogItem, type TradeQuote } from '@/services/market-api';
import { MarketCard } from './components/market-card';
import { MarketDetailHeader } from './components/market-detail-header';
import { money } from './format';

export function MarketsScreen({ markets, initialMarket, canTrade, onSelectedChange, onReload }: { markets: MarketCatalogItem[]; initialMarket: MarketCatalogItem | null; canTrade: boolean; onSelectedChange: (market: MarketCatalogItem | null) => void; onReload: () => Promise<void> }) {
  const theme = useVadTheme();
  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [price, setPrice] = useState('0.50');
  const [quantity, setQuantity] = useState('100');
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [working, setWorking] = useState(false);
  const selected = initialMarket;
  const orderedMarkets = useMemo(() => [...markets].sort((a, b) => Number(Boolean(b.last_trade_at)) - Number(Boolean(a.last_trade_at))), [markets]);

  function chooseMarket(market: MarketCatalogItem) { onSelectedChange(market); setOutcome('YES'); setSide('BUY'); setPrice(String(Number(market.yes_price ?? 0.5))); setQuantity('100'); setQuote(null); }
  function chooseOutcome(next: 'YES' | 'NO') { setOutcome(next); setPrice(String(Number(next === 'YES' ? selected?.yes_price ?? 0.5 : selected?.no_price ?? 0.5))); setQuote(null); }

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
    try { await placeOrder(quote); Alert.alert('Order placed', 'Your order is live and may fill when compatible liquidity exists.'); setQuote(null); onSelectedChange(null); await onReload(); }
    catch (error) { Alert.alert('Order not placed', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setWorking(false); }
  }

  if (!selected) return <View style={{ gap: theme.spacing.md }}>
    <View style={{ gap: theme.spacing.xxs }}><VadText variant="title">Markets</VadText><VadText tone="secondary">Discover live conviction markets. Pricing, eligibility and settlement remain backend-authoritative.</VadText></View>
    <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}><Summary label="Live" value={String(markets.length)} /><Summary label="Asset" value="NGN" /><Summary label="Liquidity" value={markets.some((m) => m.last_trade_at) ? 'Active' : 'Forming'} /></View>
    {orderedMarkets.map((market) => <MarketCard key={market.instrument_public_id} market={market} onPress={() => chooseMarket(market)} />)}
    {!markets.length ? <VadEmptyState title="No live markets yet" body="Approved canonical markets will appear here automatically once governance and oracle requirements are satisfied." /> : null}
  </View>;

  return <View style={{ gap: theme.spacing.md }}>
    <Pressable onPress={() => { onSelectedChange(null); setQuote(null); }}><VadText variant="label" tone="brand">← All markets</VadText></Pressable>
    <MarketDetailHeader market={selected} />
    <VadCard style={{ gap: theme.spacing.md }}>
      <View><VadText variant="heading">Build your order</VadText><VadText variant="caption" tone="secondary">Choose a side, set your limit, then review the exact server quote before placing.</VadText></View>
      <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}><OutcomeChoice active={outcome === 'YES'} label="YES" tone="yes" onPress={() => chooseOutcome('YES')} /><OutcomeChoice active={outcome === 'NO'} label="NO" tone="no" onPress={() => chooseOutcome('NO')} /></View>
      <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}><VadButton fullWidth={false} label="Buy shares" variant={side === 'BUY' ? 'primary' : 'secondary'} onPress={() => { setSide('BUY'); setQuote(null); }} /><VadButton fullWidth={false} label="Sell shares" variant={side === 'SELL' ? 'primary' : 'secondary'} onPress={() => { setSide('SELL'); setQuote(null); }} /></View>
      <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}><View style={{ flex: 1 }}><VadInput label="Limit price" value={price} onChangeText={(value) => { setPrice(value); setQuote(null); }} keyboardType="decimal-pad" /></View><View style={{ flex: 1 }}><VadInput label="Shares" value={quantity} onChangeText={(value) => { setQuantity(value); setQuote(null); }} keyboardType="decimal-pad" /></View></View>
      {!canTrade ? <VadCard style={{ backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warning }}><VadText tone="warning">Trading is currently disabled for this account by runtime policy.</VadText></VadCard> : null}
      <VadButton label="Preview order" loading={working} disabled={!canTrade || working} onPress={() => void preview()} />
    </VadCard>
    {quote ? <VadCard variant="raised" style={{ gap: theme.spacing.sm }}><View><VadText variant="heading">Order preview</VadText><VadText variant="caption" tone="secondary">This is the server-authoritative quote used for submission.</VadText></View><QuoteLine label="Notional" value={money(quote.notional)} /><QuoteLine label="Maker fee" value={money(quote.makerFee)} /><QuoteLine label="Taker fee" value={money(quote.takerFee)} />{quote.side === 'BUY' ? <QuoteLine label="Max cash reserved" value={money(quote.maximumCashReservation)} /> : <QuoteLine label="Shares available" value={String(quote.availableSharesToSell)} />}<QuoteLine label="Gross settlement if correct" value={money(quote.potentialGrossSettlement)} /><VadButton label="Place order" loading={working} onPress={() => void execute()} /></VadCard> : null}
  </View>;
}

function Summary({ label, value }: { label: string; value: string }) { const theme = useVadTheme(); return <VadCard variant="muted" style={{ flex: 1, gap: theme.spacing.xxs, padding: theme.spacing.sm }}><VadText variant="caption" tone="secondary">{label}</VadText><VadText variant="bodyStrong">{value}</VadText></VadCard>; }
function OutcomeChoice({ active, label, tone, onPress }: { active: boolean; label: string; tone: 'yes' | 'no'; onPress: () => void }) { const theme = useVadTheme(); const color = tone === 'yes' ? theme.colors.yes : theme.colors.no; const background = tone === 'yes' ? theme.colors.yesSoft : theme.colors.noSoft; return <Pressable onPress={onPress} style={{ flex: 1, borderWidth: 1, borderColor: active ? color : theme.colors.border, backgroundColor: active ? background : theme.colors.surfaceMuted, borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}><VadText variant="label" style={{ color }}>{label}</VadText></Pressable>; }
function QuoteLine({ label, value }: { label: string; value: string }) { const theme = useVadTheme(); return <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}><VadText tone="secondary">{label}</VadText><VadText variant="bodyStrong">{value}</VadText></View>; }
