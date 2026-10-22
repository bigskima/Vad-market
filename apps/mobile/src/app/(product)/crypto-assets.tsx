import { Redirect } from 'expo-router';

// Keep existing links working while moving Crypto Assets into the broader
// financial-asset explorer.
export default function CryptoAssetsRoute() {
  return <Redirect href="/financial-markets" />;
}
