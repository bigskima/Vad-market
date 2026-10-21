import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VadIcon } from '@/components/ui/vad-icon';
import { VadText } from '@/components/ui/vad-text';
import { useProductDensity } from '@/hooks/use-product-density';
import { useVadTheme } from '@/providers/theme-provider';
import { CryptoWalletConnections } from '@/features/wallet/crypto-wallet-connections';
import { WalletSectionErrorBoundary } from '@/features/wallet/wallet-section-error-boundary';
import { UsdcWalletBalances } from '@/features/wallet/usdc-wallet-balances';

export function EmbeddedWalletModal({
  showUsdcBalance,
  compact = false,
}: {
  showUsdcBalance: boolean;
  compact?: boolean;
}) {
  const theme = useVadTheme();
  const density = useProductDensity();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open embedded wallet settings"
        accessibilityHint="Opens your self-custody wallet, wallet creation, network and on-chain balance controls."
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          borderRadius: 17,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          padding: compact ? 11 : 14,
          opacity: pressed ? 0.78 : 1,
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
          <View style={{
            width: 42,
            height: 42,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 13,
            backgroundColor: theme.colors.brandSoft,
          }}>
            <VadIcon name="wallet" size={21} tone="brand" />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <VadText variant="bodyStrong">Embedded wallet</VadText>
            <VadText variant="caption" tone="secondary" numberOfLines={2}>
              Create or manage your self-custody wallet, connected networks and on-chain USDC.
            </VadText>
          </View>
          <VadIcon name="chevronRight" size={18} tone="secondary" />
        </View>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(3, 6, 20, 0.72)' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close embedded wallet"
            onPress={() => setOpen(false)}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
          />
          <SafeAreaView
            edges={['bottom']}
            style={{
              width: '100%',
              maxWidth: 720,
              maxHeight: '92%',
              alignSelf: 'center',
              overflow: 'hidden',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.background,
            }}
          >
            <View style={{
              minHeight: 66,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: density.phone ? 16 : 22,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
            }}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <VadText variant="heading">Self-custody wallet</VadText>
                <VadText variant="caption" tone="secondary">Wallet creation, connection and network controls</VadText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close embedded wallet"
                onPress={() => setOpen(false)}
                hitSlop={10}
                style={({ pressed }) => ({
                  width: 40,
                  height: 40,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 20,
                  backgroundColor: theme.colors.surfaceRaised,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <VadIcon name="close" size={20} tone="primary" />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                padding: density.phone ? 12 : 18,
                gap: theme.spacing.md,
                paddingBottom: 28,
              }}
            >
              <WalletSectionErrorBoundary title="Embedded wallet unavailable">
                <CryptoWalletConnections />
              </WalletSectionErrorBoundary>
              {showUsdcBalance ? (
                <WalletSectionErrorBoundary title="USDC on-chain balances unavailable">
                  <UsdcWalletBalances />
                </WalletSectionErrorBoundary>
              ) : (
                <View style={{
                  gap: 5,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.lg,
                  padding: 13,
                  backgroundColor: theme.colors.surface,
                }}>
                  <VadText variant="bodyStrong">On-chain USDC balances</VadText>
                  <VadText variant="caption" tone="secondary">
                    Enable USDC in Wallet settings, where eligible, to view balances for connected networks. Self-custody holdings remain separate from the VAD account ledger.
                  </VadText>
                </View>
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}
