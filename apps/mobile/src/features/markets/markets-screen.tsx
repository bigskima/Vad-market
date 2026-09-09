import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { useVadTheme } from '@/providers/theme-provider';
import { placeOrder, quoteTrade, type MarketCatalogItem, type TradeQuote } from '@/services/market-api';
import { MarketCard } from './components/market-card';
import { money, pct } from './format';

export function MarketsScreen({ markets, initialMarket, canTrade, onSelectedChange, onReload }: { markets: MarketCatalogItem[]; initialMarket: MarketCatalogItem | null; canTrade: boolean; onSelectedChange: (market: MarketCatalogItem | null) => void; onReload: () => Promise<void> }) {
  const theme = useVadTheme();
  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [price, setPrice] = useState('0.50');
  const [quantity, setQuantity] = useState('100');
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [working, setWorking] = useState(false);
  const selected = initialMarket;

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

  if (!selected) return <View style={{ gap: theme.spacing.sm }}><View><VadText variant="title">Markets</VadText><VadText tone="secondary">NGN launch · server-authoritative pricing and settlement.</VadText></View>{markets.map((market) => <MarketCard key={market.instrument_public_id} market={market} onPress={() => chooseMarket(market)} />)}{!markets.length ? <VadCard variant="outlined"><VadText tone="secondary">No active markets yet.</VadText></VadCard> : null}</View>;

  return <View style={{ gap: theme.spacing.md }}>
    <Pressable onPress={() => { onSelectedChange(null); setQuote(null); }}><VadText variant="label" tone="brand">← All markets</VadText></Pressable>
    <View style={{ gap: theme.spacing.xs }}><VadText variant="title">{selected.title}</VadText><VadText tone="secondary">{selected.category ?? 'General'} · {selected.closes_at ? `closes ${new Date(selected.closes_at).toLocaleString()}` : 'close time by policy'}</VadText></View>
    <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}><VadButton fullWidth={false} label={`YES ${pct(selected.yes_price)}`} variant={outcome === 'YES' ? 'primary' : 'secondary'} onPress={() => chooseOutcome('YES')} /><VadButton fullWidth={false} label={`NO ${pct(selected.no_price)}`} variant={outcome === 'NO' ? 'primary' : 'secondary'} onPress={() => chooseOutcome('NO')} /></View>
    <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}><VadButton fullWidth={false} label="Buy" variant={side === 'BUY' ? 'primary' : 'secondary'} onPress={() => { setSide('BUY'); setQuote(null); }} /><VadButton fullWidth={false} label="Sell" variant={side === 'SELL' ? 'primary' : 'secondary'} onPress={() => { setSide('SELL'); setQuote(null); }} /></View>
    <VadInput label="Limit price (₦ per share)" value={price} onChangeText={(value) => { setPrice(value); setQuote(null); }} keyboardType="decimal-pad" />
    <VadInput label="Shares" value={quantity} onChangeText={(value) => { setQuantity(value); setQuote(null); }} keyboardType="decimal-pad" />
    {!canTrade ? <VadCard style={{ backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warning }}><VadText tone="warning">Trading is disabled for this account by runtime policy.</VadText></VadCard> : null}
    <VadButton label="Preview order" loading={working} disabled={!canTrade || working} onPress={() => void preview()} />
    {quote ? <VadCard variant="raised" style={{ gap: theme.spacing.sm }}><VadText variant="heading">Order preview</VadText><QuoteLine label="Notional" value={money(quote.notional)} /><QuoteLine label="Maker fee" value={money(quote.makerFee)} /><QuoteLine label="Taker fee" value={money(quote.takerFee)} />{quote.side === 'BUY' ? <QuoteLine label="Max cash reserved" value={money(quote.maximumCashReservation)} /> : <QuoteLine label="Shares available" value={String(quote.availableSharesToSell)} />}<QuoteLine label="Gross if correct" value={money(quote.potentialGrossSettlement)} /><VadButton label="Place order" loading={working} onPress={() => void execute()} /></VadCard> : null}
  </View>;
}

function QuoteLine({ label, value }: { label: string; value: string }) { const theme = useVadTheme(); return <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}><VadText tone="secondary">{label}</VadText><VadText variant="bodyStrong">{value}</VadText></View>; }
