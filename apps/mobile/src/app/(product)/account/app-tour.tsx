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
          title="Take a quick tour"
          subtitle="Explore VAD’s key features with each step highlighting the controls you need."
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
            <VadText variant="title">Explore VAD step by step</VadText>
            <VadText tone="secondary">
              Discover markets, review trades, manage your wallet and portfolio, and explore the rest of VAD.
            </VadText>
          </View>
          <VadButton
            label={tour.loading ? 'Getting tour ready…' : 'Start tour'}
            loading={tour.loading}
            disabled={!tour.available || Boolean(tour.error)}
            onPress={() => tour.startTour(true)}
          />
          {!tour.loading && !tour.available && !tour.error ? (
            <VadText variant="caption" tone="secondary">
              The tour is unavailable right now. Check back later.
            </VadText>
          ) : null}
        </VadCard>

        <VadCard variant="raised" style={{ gap: theme.spacing.sm }}>
          <VadText variant="bodyStrong">Tour reminders</VadText>
          <VadText tone="secondary">{statusCopy(status, tour.progress.remindAt)}</VadText>
          <VadText variant="caption" tone="tertiary">
            Finishing turns off reminders. You can restart the tour here anytime.
          </VadText>
        </VadCard>

        <View style={{ gap: theme.spacing.sm }}>
          <VadText variant="heading">Tour highlights</VadText>
          <TourPoint title="Markets & trades" body="Browse markets and review trading controls." />
          <TourPoint title="Wallet & portfolio" body="Check balances, funding actions, positions and orders." />
          <TourPoint title="Account & more" body="Manage security and preferences, then explore news, community and the assistant." />
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
