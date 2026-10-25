import { View } from 'react-native';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadErrorState } from '@/components/ui/vad-error-state';
import { VadSectionHeader } from '@/components/ui/vad-section-header';
import { VadText } from '@/components/ui/vad-text';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { useProductTour } from '@/features/tour/tour-provider';
import { useVadTheme } from '@/providers/theme-provider';

export default function AppTourSettingsRoute() {
  const theme = useVadTheme();
  const tour = useProductTour();
  const status = tour.progress.status;

  return (
    <ProductSubpage title="VAD tour" maxWidth={760}>
      <View style={{ gap: theme.spacing.xl }}>
        <VadSectionHeader
          title="Learn VAD on the real screens"
          subtitle="The tour moves through VAD, highlights the exact controls you need and scrolls to parts of a page that are out of view."
        />

        {tour.error ? (
          <VadErrorState
            title="The guided tour is unavailable"
            message={tour.error}
            onRetry={tour.refreshTour}
          />
        ) : null}

        <VadCard variant="brand" style={{ gap: theme.spacing.md, padding: theme.spacing.xl }}>
          <View style={{ gap: 5 }}>
            <VadText variant="caption" tone="brand">GUIDED WALKTHROUGH</VadText>
            <VadText variant="title">Follow the app as it moves</VadText>
            <VadText tone="secondary">
              The walkthrough moves across Home, market discovery and detail, the actual Trade ticket, Watchlist, Wallet, Portfolio, Account settings, Notifications, News, Financial Markets, Community, Assistant and market proposals. Each step highlights a real screen element; some wallet or market routes may be unavailable when your currency or account eligibility does not allow them.
            </VadText>
          </View>
          <VadButton
            label={tour.loading ? 'Getting the tour ready…' : 'Start the VAD tour'}
            loading={tour.loading}
            disabled={!tour.available || Boolean(tour.error)}
            onPress={() => tour.startTour(true)}
          />
          {!tour.loading && !tour.available && !tour.error ? (
            <VadText variant="caption" tone="secondary">
              The guided tour is not active right now. You can return here when it becomes available.
            </VadText>
          ) : null}
        </VadCard>

        <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
          <VadText variant="bodyStrong">Automatic tour status</VadText>
          <VadText tone="secondary">{statusCopy(status, tour.progress.remindAt)}</VadText>
          <VadText variant="caption" tone="tertiary">
            Finishing the walkthrough turns automatic reminders off. Starting it here always works, even after you have completed it before.
          </VadText>
        </VadCard>

        <View style={{ gap: theme.spacing.sm }}>
          <VadText variant="heading">What the walkthrough covers</VadText>
          <TourPoint title="Discover and trade" body="Browse markets, inspect market details, switch to the real Trade ticket and review its stake or order controls." />
          <TourPoint title="Save and follow markets" body="Use Watchlist to find saved markets and remove items you no longer want to follow." />
          <TourPoint title="Manage your wallet" body="Review balances, eligible funding actions, wallet history and transfers without submitting a transaction during the tour." />
          <TourPoint title="Portfolio and account" body="Explore positions, open orders, identity, funding, currency preferences, appearance, security and policies." />
          <TourPoint title="Explore the rest of VAD" body="Open Notifications, News, financial and crypto data, Community, the assistant and market proposals." />
        </View>
      </View>
    </ProductSubpage>
  );
}

function TourPoint({ title, body }: { title: string; body: string }) {
  const theme = useVadTheme();
  return (
    <View
      style={{
        borderLeftWidth: 3,
        borderLeftColor: theme.colors.brandPrimary,
        paddingLeft: theme.spacing.md,
        gap: 2,
      }}
    >
      <VadText variant="bodyStrong">{title}</VadText>
      <VadText variant="caption" tone="secondary">{body}</VadText>
    </View>
  );
}

function statusCopy(status: string, remindAt: string | null) {
  if (status === 'COMPLETED') return 'Completed. VAD will not start this tour automatically again.';
  if (status === 'DISMISSED') return 'Automatic reminders are off. You can still start the tour here whenever you want.';
  if (status === 'REMIND' && remindAt) return `Paused. VAD will offer the tour again after ${new Date(remindAt).toLocaleString()}.`;
  if (status === 'IN_PROGRESS') return 'In progress. VAD can continue from the part you most recently reached.';
  return 'Ready. VAD may offer this walkthrough when you arrive on Home.';
}
