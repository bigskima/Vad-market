import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import { userFacingErrorMessage } from '@/lib/user-facing-error';

export type PickedProfileImage = { bytes: ArrayBuffer; mimeType: string; previewUri: string };

type NativePicker = {
  requestMediaLibraryPermissionsAsync?: (writeOnly?: boolean) => Promise<{ granted?: boolean; status?: string }>;
  launchImageLibraryAsync?: (options?: Record<string, unknown>) => Promise<{ canceled?: boolean; assets?: { uri?: string; base64?: string | null; mimeType?: string | null }[] | null }>;
};

function decodeBase64(value: string) {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function pickWeb(): Promise<PickedProfileImage | null> {
  const doc = (globalThis as { document?: any }).document;
  if (!doc) return null;
  return new Promise((resolve, reject) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = async () => {
      try {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        resolve({ bytes: await file.arrayBuffer(), mimeType: file.type || 'image/jpeg', previewUri: URL.createObjectURL(file) });
      } catch (error) {
        reject(new Error(userFacingErrorMessage(error, 'profile', 'We could not open that image. Please choose another image and try again.')));
      }
    };
    input.click();
  });
}

export async function pickProfileImage(): Promise<PickedProfileImage | null> {
  if (Platform.OS === 'web') return pickWeb();
  const picker = requireOptionalNativeModule<NativePicker>('ExponentImagePicker');
  if (!picker?.launchImageLibraryAsync) {
    throw new Error('Photo selection is not available on this device right now.');
  }
  const permission = await picker.requestMediaLibraryPermissionsAsync?.(false);
  if (permission && permission.granted === false && permission.status !== 'granted') {
    throw new Error('Allow photo access to choose a profile image.');
  }
  try {
    const result = await picker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.9, base64: true, allowsMultipleSelection: false });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return null;
    if (!asset.base64) throw new Error('The selected image could not be prepared for upload.');
    return { bytes: decodeBase64(asset.base64), mimeType: asset.mimeType || 'image/jpeg', previewUri: asset.uri || '' };
  } catch (error) {
    throw new Error(userFacingErrorMessage(error, 'profile', 'We could not open that image. Please choose another image and try again.'));
  }
}
