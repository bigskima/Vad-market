import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { VadText } from '@/components/ui/vad-text';
import { MarketDetailScreen } from '@/features/markets/market-detail-screen';
import { useRuntimeCapabilities } from '@/hooks/use-runtime-capabilities';
import { useAuth } from '@/providers/auth-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function MarketRoute() {
  const theme = useVadTheme();
  const { session, isLoading } = useAuth();
  const runtime = useRuntimeCapabilities(session);
  const { id } = useLocalSearchParams<{ id: string }>();
  if (isLoading) return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  if (!session) return <Redirect href="/" />;
  return <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
    <View style={{ paddingTop: 54, paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: theme.colors.surface }}><Pressable onPress={() => router.back()}><VadText variant="label" tone="brand">← Back</VadText></Pressable></View>
    <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}><MarketDetailScreen instrumentPublicId={id} canTrade={runtime.snapshot.capabilities.trade} /></ScrollView>
  </View>;
}
