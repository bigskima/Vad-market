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
              You will visit Home, Markets, Wallet, Portfolio and Account. Each step points to the real button, card or control being explained instead of showing a separate instruction page.
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
          <TourPoint title="Finding markets" body="Search, featured markets, categories and live market discovery." />
          <TourPoint title="Managing money" body="Wallet balances, deposits, withdrawals and payment activity." />
          <TourPoint title="Following positions" body="Your portfolio, positions and orders that are still waiting to fill." />
          <TourPoint title="Account essentials" body="Verification, funding settings, policies and where to take the tour again." />
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
