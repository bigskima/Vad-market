import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { palette } from '@/constants/palette';
import type { MarketCatalogItem } from '@/services/market-api';
import { getConvictionFeed, publishConvictionPost, toggleCreatorFollow, togglePostLike, type ConvictionPost } from '@/services/social-api';

type Props = {
  markets: MarketCatalogItem[];
  canCreatePost: boolean;
  onOpenMarket: (market: MarketCatalogItem) => void;
};

const pct = (value: unknown) => `${Math.round(Number(value ?? 0) * 100)}%`;

export function SocialConvictionFeed({ markets, canCreatePost, onOpenMarket }: Props) {
  const [posts, setPosts] = useState<ConvictionPost[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [body, setBody] = useState('');
  const [selectedMarket, setSelectedMarket] = useState<MarketCatalogItem | null>(null);
  const [stance, setStance] = useState<'YES' | 'NO' | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try { setPosts(await getConvictionFeed()); } catch { setPosts([]); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function publish() {
    if (!body.trim()) return;
    setWorking(true);
    try {
      await publishConvictionPost({
        body: body.trim(),
        postType: selectedMarket && stance ? 'PREDICTION' : 'ANALYSIS',
        instrumentPublicId: selectedMarket?.instrument_public_id ?? null,
        stanceOutcomeCode: stance,
      });
      setBody(''); setSelectedMarket(null); setStance(null); setComposerOpen(false);
      await load();
    } catch (error) {
      Alert.alert('Post not published', error instanceof Error ? error.message : 'Please try again.');
    } finally { setWorking(false); }
  }

  async function like(post: ConvictionPost) {
    try { await togglePostLike(post.post_public_id); await load(); } catch (error) { Alert.alert('Could not react', error instanceof Error ? error.message : 'Please try again.'); }
  }

  async function follow(post: ConvictionPost) {
    try { await toggleCreatorFollow(post.author_user_id); await load(); } catch (error) { Alert.alert('Could not update follow', error instanceof Error ? error.message : 'Please try again.'); }
  }

  return <View style={s.root}>
    <View style={s.heading}><View><Text style={s.title}>Conviction feed</Text><Text style={s.muted}>Ideas, arguments and market-linked predictions.</Text></View>{canCreatePost ? <Pressable style={s.composeButton} onPress={() => setComposerOpen((v) => !v)}><Text style={s.composeText}>{composerOpen ? 'Close' : 'Post'}</Text></Pressable> : null}</View>

    {composerOpen && <View style={s.composer}>
      <TextInput value={body} onChangeText={setBody} multiline placeholder="What do you believe, and why?" placeholderTextColor={palette.textMuted} style={s.input} />
      <Text style={s.label}>Attach a live market (optional)</Text>
      <View style={s.chips}>{markets.slice(0, 6).map((m) => <Pressable key={m.instrument_public_id} style={[s.chip, selectedMarket?.instrument_public_id === m.instrument_public_id && s.chipActive]} onPress={() => { setSelectedMarket(selectedMarket?.instrument_public_id === m.instrument_public_id ? null : m); setStance(null); }}><Text numberOfLines={1} style={[s.chipText, selectedMarket?.instrument_public_id === m.instrument_public_id && s.chipTextActive]}>{m.title}</Text></Pressable>)}</View>
      {selectedMarket && <View style={s.stanceRow}><Pressable style={[s.stance,s.stanceYes,stance==='YES'&&s.stanceSelected]} onPress={() => setStance('YES')}><Text style={s.stanceText}>YES {pct(selectedMarket.yes_price)}</Text></Pressable><Pressable style={[s.stance,s.stanceNo,stance==='NO'&&s.stanceSelected]} onPress={() => setStance('NO')}><Text style={s.stanceText}>NO {pct(selectedMarket.no_price)}</Text></Pressable></View>}
      <Pressable disabled={working || body.trim().length < 1} style={[s.publish,(working || body.trim().length < 1)&&s.disabled]} onPress={() => void publish()}><Text style={s.publishText}>{working ? 'Publishing…' : 'Publish conviction'}</Text></Pressable>
    </View>}

    {!posts.length ? <View style={s.empty}><Text style={s.muted}>No creator posts yet. The first conviction post can start the discussion without creating a duplicate financial market.</Text></View> : posts.map((post) => {
      const market = post.instrument_public_id ? markets.find((m) => m.instrument_public_id === post.instrument_public_id) : undefined;
      return <View style={s.card} key={post.post_public_id}>
        <View style={s.authorRow}><View style={s.avatar}><Text style={s.avatarText}>{(post.author_display_name ?? post.author_handle ?? 'V').slice(0,1).toUpperCase()}</Text></View><View style={s.authorText}><Text style={s.author}>{post.author_display_name ?? post.author_handle ?? 'VAD creator'}</Text><Text style={s.muted}>@{post.author_handle ?? 'member'} · {new Date(post.created_at).toLocaleString()}</Text></View><Pressable onPress={() => void follow(post)}><Text style={s.follow}>{post.viewer_follows_author ? 'Following' : 'Follow'}</Text></Pressable></View>
        <Text style={s.body}>{post.body}</Text>
        {post.market_title && <Pressable style={s.marketCard} onPress={() => market && onOpenMarket(market)}><Text style={s.marketTitle}>{post.market_title}</Text><View style={s.marketRow}><Text style={s.yes}>YES {pct(post.yes_price)}</Text><Text style={s.no}>NO {pct(post.no_price)}</Text>{post.stance_outcome_code ? <Text style={s.stanceBadge}>Creator: {post.stance_outcome_code}</Text> : null}</View></Pressable>}
        <View style={s.actions}><Pressable onPress={() => void like(post)}><Text style={[s.action,post.viewer_liked&&s.actionActive]}>♥ {Number(post.reaction_count)}</Text></Pressable><Text style={s.action}>Comments {Number(post.comment_count)}</Text>{post.confidence != null ? <Text style={s.action}>Confidence {pct(post.confidence)}</Text> : null}</View>
      </View>;
    })}
  </View>;
}

const s = StyleSheet.create({root:{gap:12},heading:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},title:{color:palette.text,fontSize:22,fontWeight:'900'},muted:{color:palette.textMuted,fontSize:12},composeButton:{backgroundColor:palette.signal,paddingHorizontal:16,paddingVertical:10,borderRadius:13},composeText:{color:palette.ink,fontWeight:'900'},composer:{backgroundColor:palette.panel,borderWidth:1,borderColor:palette.line,borderRadius:20,padding:14,gap:12},input:{minHeight:110,color:palette.text,textAlignVertical:'top',fontSize:16},label:{color:palette.textMuted,fontWeight:'700',fontSize:12},chips:{flexDirection:'row',flexWrap:'wrap',gap:7},chip:{maxWidth:190,borderWidth:1,borderColor:palette.line,borderRadius:999,paddingHorizontal:10,paddingVertical:8},chipActive:{backgroundColor:palette.signal,borderColor:palette.signal},chipText:{color:palette.text,fontSize:12},chipTextActive:{color:palette.ink,fontWeight:'800'},stanceRow:{flexDirection:'row',gap:8},stance:{flex:1,padding:12,borderRadius:13,alignItems:'center',borderWidth:1},stanceYes:{borderColor:palette.signal},stanceNo:{borderColor:palette.warning},stanceSelected:{backgroundColor:palette.inkRaised},stanceText:{color:palette.text,fontWeight:'900'},publish:{backgroundColor:palette.signal,borderRadius:14,padding:14,alignItems:'center'},publishText:{color:palette.ink,fontWeight:'900'},disabled:{opacity:.4},empty:{borderWidth:1,borderColor:palette.line,borderStyle:'dashed',borderRadius:18,padding:18},card:{backgroundColor:palette.panel,borderWidth:1,borderColor:palette.line,borderRadius:20,padding:15,gap:12},authorRow:{flexDirection:'row',alignItems:'center',gap:9},avatar:{width:38,height:38,borderRadius:19,backgroundColor:palette.inkRaised,alignItems:'center',justifyContent:'center'},avatarText:{color:palette.signal,fontWeight:'900'},authorText:{flex:1},author:{color:palette.text,fontWeight:'900'},follow:{color:palette.signal,fontWeight:'800'},body:{color:palette.text,fontSize:16,lineHeight:23},marketCard:{backgroundColor:palette.inkRaised,borderRadius:15,padding:12,gap:8},marketTitle:{color:palette.text,fontWeight:'800'},marketRow:{flexDirection:'row',alignItems:'center',gap:12,flexWrap:'wrap'},yes:{color:palette.signal,fontWeight:'900'},no:{color:palette.warning,fontWeight:'900'},stanceBadge:{color:palette.textMuted,fontSize:12},actions:{flexDirection:'row',gap:18,flexWrap:'wrap'},action:{color:palette.textMuted,fontWeight:'700',fontSize:12},actionActive:{color:palette.signal}});
