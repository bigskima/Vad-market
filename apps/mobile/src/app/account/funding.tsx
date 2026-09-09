import { FundingOverview } from '@/features/account/funding-overview';
import { ProductSubpage } from '@/features/navigation/product-subpage';

export default function AccountFundingScreen() {
  return (
    <ProductSubpage title="Funding & withdrawals" maxWidth={900}>
      <FundingOverview />
    </ProductSubpage>
  );
}
