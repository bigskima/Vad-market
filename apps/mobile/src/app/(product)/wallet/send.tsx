import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { VadButton } from '@/components/ui/vad-button';
import { VadCard } from '@/components/ui/vad-card';
import { VadChip } from '@/components/ui/vad-chip';
import { VadInput } from '@/components/ui/vad-input';
import { VadText } from '@/components/ui/vad-text';
import { ProductSubpage } from '@/features/navigation/product-subpage';
import { useProductDataContext } from '@/providers/product-data-provider';
import { useCurrencyPreference } from '@/providers/currency-preference-provider';
import { useVadTheme } from '@/providers/theme-provider';
import { transferAssetToEmail, type AssetTransferReceipt, type TransferAssetCode } from '@/services/asset-transfer-api';

function makeRequestKey() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function formatBalance(value: number | string, assetCode: TransferAssetCode) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  const decimals = assetCode === 'NGN' ? 2 : 6;
  const formatted = amount.toLocaleString(assetCode === 'NGN' ? 'en-NG' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
  return assetCode === 'NGN' ? `₦${formatted}` : `${formatted} USDC`;
}

export default function SendRoute() {
  const theme = useVadTheme();
  const data = useProductDataContext();
  const currency = useCurrencyPreference();
  const [recipientEmail, setRecipientEmail] = useState('');
  const [assetCode, setAssetCode] = useState<TransferAssetCode>('NGN');
  const [amount, setAmount] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(makeRequestKey);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<(AssetTransferReceipt & { requestKey: string }) | null>(null);

  const assets = useMemo<TransferAssetCode[]>(() => (['NGN', 'USDC'] as const)
    .filter((code) => currency.isCurrencyEligible(code)), [currency.isCurrencyEligible]);

  useEffect(() => {
    if (!assets.includes(assetCode) && assets[0]) setAssetCode(assets[0]);
  }, [assets, assetCode]);

  const selectedWallet = data.wallet.find((wallet) => wallet.asset_code === assetCode);
  const availableBalance = selectedWallet?.available ?? null;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim());
  const precision = assetCode === 'NGN' ? 2 : 6;
  const amountValid = new RegExp(`^\\d+(?:\\.\\d{1,${precision}})?$`).test(amount.trim())
    && Number.isFinite(Number(amount))
    && Number(amount) > 0;
  const alreadySentThisRequest = Boolean(receipt && receipt.requestKey === idempotencyKey);

  const changeForm = (update: () => void) => {
    setReceipt(null);
    setError(null);
    setIdempotencyKey(makeRequestKey());
    update();
  };

  const submit = async () => {
    if (!assets.length) {
      setError('No eligible NGN or ledger-USDC wallet is available for your account.');
      return;
    }
    if (!emailValid) {
      setError('Enter the exact email address of an existing VAD account.');
      return;
    }
    if (!amountValid) {
      setError(`Enter an amount greater than zero with no more than ${precision} decimal places.`);
      return;
    }
    if (alreadySentThisRequest) return;

    setWorking(true);
    setError(null);
    try {
      const result = await transferAssetToEmail({
        recipientEmail: recipientEmail.trim(),
        assetCode,
        amount: Number(amount),
        idempotencyKey,
      });
      setReceipt({ ...result, requestKey: idempotencyKey });
      await data.load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The transfer could not be completed. No transfer confirmation was received.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <ProductSubpage title="Send assets" maxWidth={760}>
      <View style={{ gap: theme.spacing.md, paddingBottom: 36 }}>
        <VadText variant="caption" tone="secondary">
          Send real NGN or VAD ledger USDC to another existing VAD account by email. The server verifies the recipient, account eligibility and available balance, then posts a balanced ledger transfer. This does not send funds to a bank or blockchain wallet.
        </VadText>

        <VadCard variant="surface" style={{ padding: theme.spacing.md, gap: theme.spacing.md }}>
          <View style={{ gap: theme.spacing.xs }}>
            <VadText variant="label" tone="secondary">Asset to send</VadText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
              {assets.map((asset) => (
                <VadChip
                  key={asset}
                  label={asset === 'NGN' ? 'NGN · Nigerian Naira' : 'USDC · VAD ledger'}
                  selected={assetCode === asset}
                  tone={assetCode === asset ? 'brand' : 'neutral'}
                  onPress={() => changeForm(() => setAssetCode(asset))}
                />
              ))}
            </View>
            {!assets.length ? (
              <VadText variant="caption" tone="danger">No supported transfer currency is eligible for this account.</VadText>
            ) : null}
          </View>

          {availableBalance !== null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 12, borderRadius: 12, backgroundColor: theme.colors.surfaceRaised }}>
              <VadText variant="caption" tone="secondary">Available ledger balance</VadText>
              <VadText variant="bodyStrong">{formatBalance(availableBalance, assetCode)}</VadText>
            </View>
          ) : (
            <VadText variant="caption" tone="secondary">The server will verify that your available ledger wallet can fund the transfer.</VadText>
          )}

          <VadInput
            label="Recipient VAD email"
            value={recipientEmail}
            onChangeText={(value) => changeForm(() => setRecipientEmail(value))}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            placeholder="recipient@example.com"
            accessibilityHint="Enter the email address registered to the destination VAD account."
          />

          <VadInput
            label={assetCode === 'NGN' ? 'Amount (NGN)' : 'Amount (USDC)'}
            value={amount}
            onChangeText={(value) => changeForm(() => setAmount(value.replace(/[^0-9.]/g, '')))}
            keyboardType="decimal-pad"
            autoCapitalize="none"
            placeholder={assetCode === 'NGN' ? 'e.g. 5000.00' : 'e.g. 12.500000'}
            hint={`Maximum precision: ${precision} decimal places. The server enforces the real available balance.`}
          />

          {error ? (
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: theme.colors.danger, padding: 12, gap: 4 }}>
              <VadText variant="bodyStrong" tone="danger">Transfer not completed</VadText>
              <VadText variant="caption" tone="secondary">{error}</VadText>
            </View>
          ) : null}

          {receipt ? (
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: theme.colors.yes, padding: 12, gap: 5 }}>
              <VadText variant="bodyStrong" tone="yes">Transfer posted successfully</VadText>
              <VadText variant="body">Amount: {formatBalance(receipt.amount, receipt.assetCode)}</VadText>
              <VadText variant="caption" tone="secondary">Recipient: {recipientEmail.trim().toLowerCase()}</VadText>
              <VadText variant="caption" tone="secondary">Transfer reference: {receipt.transferId}</VadText>
              <VadText variant="caption" tone="secondary">Ledger journal: {receipt.journalId}</VadText>
              {receipt.idempotentReplay ? <VadText variant="caption" tone="secondary">This is the confirmation of an earlier request; the transfer was not debited twice.</VadText> : null}
            </View>
          ) : null}

          <VadButton
            label={working ? 'Posting ledger transfer…' : alreadySentThisRequest ? 'Transfer posted' : 'Send assets'}
            onPress={() => void submit()}
            loading={working}
            disabled={working || alreadySentThisRequest || !assets.length}
          />
          <VadText variant="caption" tone="secondary">
            A recipient email that is not registered to a VAD account is rejected before funds move. Insufficient balance, frozen accounts, invalid currency eligibility or jurisdiction restrictions also block the transfer.
          </VadText>
        </VadCard>

        <VadButton label="Return to wallet" variant="ghost" onPress={() => router.replace('/wallet')} />
      </View>
    </ProductSubpage>
  );
}
