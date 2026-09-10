import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export const supabaseConfiguration = {
  ready: Boolean(supabaseUrl && supabasePublishableKey),
  missing: [
    !supabaseUrl ? 'EXPO_PUBLIC_SUPABASE_URL' : null,
    !supabasePublishableKey
      ? 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
      : null,
  ].filter((value): value is string => Boolean(value)),
} as const;

// The root layout blocks the authenticated runtime when public deployment
// configuration is absent. Keeping this module non-throwing prevents a
// missing build-time variable from crashing the web bundle before React can
// render a useful deployment error screen.
export const supabase = (
  supabaseConfiguration.ready
    ? createClient(supabaseUrl!, supabasePublishableKey!, {
        auth: {
          storage: globalThis.localStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null
) as SupabaseClient;
