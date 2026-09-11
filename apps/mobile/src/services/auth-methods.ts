import { supabase } from '@/lib/supabase';

export type PublicAuthMethods = {
  emailPassword: boolean;
  google: boolean;
  apple: boolean;
  phoneVerification: boolean;
};

export const DEFAULT_PUBLIC_AUTH_METHODS: PublicAuthMethods = {
  emailPassword: true,
  google: false,
  apple: false,
  phoneVerification: false,
};

export async function getPublicAuthMethods(): Promise<PublicAuthMethods> {
  const { data, error } = await supabase.rpc('public_auth_method_state');

  // Optional methods fail closed. Email/password remains the launch-safe path.
  if (error || !data || typeof data !== 'object') return DEFAULT_PUBLIC_AUTH_METHODS;

  const value = data as Partial<PublicAuthMethods>;
  return {
    emailPassword: value.emailPassword !== false,
    google: value.google === true,
    apple: value.apple === true,
    phoneVerification: value.phoneVerification === true,
  };
}
