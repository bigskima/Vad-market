import type { Session } from '@supabase/supabase-js';
import * as ExpoLinking from 'expo-linking';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Linking as NativeLinking, Platform } from 'react-native';

import { supabase } from '@/lib/supabase';
import { userFacingErrorMessage } from '@/lib/user-facing-error';

interface AuthActionResult {
  ok: boolean;
  message?: string;
}

interface SignUpInput {
  displayName: string;
  email: string;
  password: string;
}

type SocialProvider = 'google' | 'apple';

interface AuthContextValue {
  isLoading: boolean;
  session: Session | null;
  isPasswordRecovery: boolean;
  verificationPromptPending: boolean;
  signIn(email: string, password: string): Promise<AuthActionResult>;
  signUp(input: SignUpInput): Promise<AuthActionResult>;
  signInWithProvider(provider: SocialProvider): Promise<AuthActionResult>;
  requestPasswordReset(email: string): Promise<AuthActionResult>;
  updatePassword(password: string): Promise<AuthActionResult>;
  requestPhoneVerification(phone: string): Promise<AuthActionResult>;
  verifyPhoneOtp(phone: string, token: string): Promise<AuthActionResult>;
  dismissPhoneVerification(): void;
  dismissPasswordRecovery(): void;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const PHONE_PROMPT_KEY = 'vad:phone-verification-pending';
const AUTH_BOOTSTRAP_TIMEOUT_MS = 8000;

function authMessage(error: unknown, mode: 'signIn' | 'signUp') {
  return userFacingErrorMessage(error, mode === 'signIn' ? 'signIn' : 'signUp');
}

function getRedirectUrl() {
  if (Platform.OS === 'web') {
    const location = (globalThis as { location?: { origin?: string } }).location;
    if (location?.origin) return `${location.origin}/`;
  }
  return ExpoLinking.createURL('/');
}

function authParams(url: string) {
  const [beforeHash, hash = ''] = url.split('#');
  const query = beforeHash.includes('?') ? beforeHash.slice(beforeHash.indexOf('?') + 1) : '';
  const merged = new URLSearchParams(query);
  const hashParams = new URLSearchParams(hash);
  hashParams.forEach((value, key) => {
    if (!merged.has(key)) merged.set(key, value);
  });
  return merged;
}

function currentWebUrl() {
  if (Platform.OS !== 'web') return null;
  const location = (globalThis as { location?: { href?: string } }).location;
  return location?.href ?? null;
}

function clearWebAuthUrl() {
  if (Platform.OS !== 'web') return;
  const browser = globalThis as {
    location?: { pathname?: string; search?: string };
    history?: { replaceState?: (data: unknown, unused: string, url?: string | URL | null) => void };
  };
  const pathname = browser.location?.pathname ?? '/';
  const search = browser.location?.search ?? '';
  browser.history?.replaceState?.(null, '', `${pathname}${search}`);
}

async function consumeAuthRedirect(url: string) {
  const params = authParams(url);
  const providerError = params.get('error_description') ?? params.get('error');
  if (providerError) throw new Error(decodeURIComponent(providerError.replace(/\+/g, ' ')));

  const recovery = params.get('type') === 'recovery';
  const code = params.get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return { session: data.session, recovery };
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return { session: data.session, recovery };
  }

  return null;
}

function readPhonePrompt() {
  try {
    return globalThis.localStorage?.getItem(PHONE_PROMPT_KEY) === '1';
  } catch {
    return false;
  }
}

function persistPhonePrompt(value: boolean) {
  try {
    if (value) globalThis.localStorage?.setItem(PHONE_PROMPT_KEY, '1');
    else globalThis.localStorage?.removeItem(PHONE_PROMPT_KEY);
  } catch {
    // In-memory state still keeps the flow usable for this session.
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [verificationPromptPending, setVerificationPromptPending] = useState(readPhonePrompt);

  const requestPhonePrompt = useCallback((nextSession?: Session | null) => {
    if (nextSession?.user.phone_confirmed_at) {
      persistPhonePrompt(false);
      setVerificationPromptPending(false);
      return;
    }
    persistPhonePrompt(true);
    setVerificationPromptPending(true);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const bootstrapTimeout = setTimeout(() => {
      if (isMounted) setIsLoading(false);
    }, AUTH_BOOTSTRAP_TIMEOUT_MS);

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      clearTimeout(bootstrapTimeout);
      setSession(data.session);
      if (data.session?.user.phone_confirmed_at) {
        persistPhonePrompt(false);
        setVerificationPromptPending(false);
      } else if (data.session && readPhonePrompt()) {
        setVerificationPromptPending(true);
      }
      setIsLoading(false);
    }).catch(() => {
      if (!isMounted) return;
      clearTimeout(bootstrapTimeout);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!isMounted) return;
        clearTimeout(bootstrapTimeout);
        setSession(nextSession);
        if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
        if (nextSession?.user.phone_confirmed_at) {
          persistPhonePrompt(false);
          setVerificationPromptPending(false);
        } else if (nextSession && readPhonePrompt()) {
          setVerificationPromptPending(true);
        }
        setIsLoading(false);
      },
    );

    return () => {
      isMounted = false;
      clearTimeout(bootstrapTimeout);
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;

    const handleUrl = async (url: string | null) => {
      if (!url) return;
      try {
        const result = await consumeAuthRedirect(url);
        if (!active || !result) return;
        if (result.session) {
          setSession(result.session);
          setIsLoading(false);
        }
        if (result.recovery) setIsPasswordRecovery(true);
        if (result.session && !result.recovery) requestPhonePrompt(result.session);
        clearWebAuthUrl();
      } catch {
        // Invalid or expired callbacks return the user to the normal sign-in flow.
      }
    };

    if (Platform.OS === 'web') {
      void handleUrl(currentWebUrl());
      return () => {
        active = false;
      };
    }

    void NativeLinking.getInitialURL().then(handleUrl);
    const subscription = NativeLinking.addEventListener('url', ({ url }) => {
      void handleUrl(url);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [requestPhonePrompt]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      session,
      isPasswordRecovery,
      verificationPromptPending,
      async signIn(email, password) {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password,
          });

          if (error) return { ok: false, message: authMessage(error, 'signIn') };
          if (!data.session) {
            return { ok: false, message: 'We could not finish signing you in. Please try again.' };
          }

          setSession(data.session);
          setIsLoading(false);
          requestPhonePrompt(data.session);
          return { ok: true };
        } catch (error) {
          setIsLoading(false);
          return { ok: false, message: authMessage(error, 'signIn') };
        }
      },
      async signUp({ displayName, email, password }) {
        try {
          const { data, error } = await supabase.auth.signUp({
            email: email.trim().toLowerCase(),
            password,
            options: {
              data: { display_name: displayName.trim() },
            },
          });

          if (error) return { ok: false, message: authMessage(error, 'signUp') };

          persistPhonePrompt(true);
          if (data.session) {
            setSession(data.session);
            setIsLoading(false);
            requestPhonePrompt(data.session);
            return { ok: true };
          }

          return {
            ok: true,
            message: 'Account created. Check your email to confirm your VAD account, then sign in.',
          };
        } catch (error) {
          return { ok: false, message: authMessage(error, 'signUp') };
        }
      },
      async signInWithProvider(provider) {
        try {
          persistPhonePrompt(true);
          setVerificationPromptPending(true);
          const redirectTo = getRedirectUrl();
          const native = Platform.OS !== 'web';
          const { data, error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
              redirectTo,
              skipBrowserRedirect: native,
            },
          });
          if (error) {
            persistPhonePrompt(false);
            setVerificationPromptPending(false);
            return {
              ok: false,
              message: userFacingErrorMessage(error, 'authentication', 'Social sign in could not start. Please try again.'),
            };
          }
          if (native) {
            if (!data.url) throw new Error('Authorization could not be started.');
            const supported = await NativeLinking.canOpenURL(data.url);
            if (!supported) throw new Error('Authorization could not be opened on this device.');
            await NativeLinking.openURL(data.url);
          }
          return { ok: true };
        } catch (error) {
          persistPhonePrompt(false);
          setVerificationPromptPending(false);
          return {
            ok: false,
            message: userFacingErrorMessage(error, 'authentication', 'Social sign in could not start. Please try again.'),
          };
        }
      },
      async requestPasswordReset(email) {
        try {
          const redirectTo = getRedirectUrl();
          const { error } = await supabase.auth.resetPasswordForEmail(
            email.trim().toLowerCase(),
            { redirectTo },
          );
          if (error) {
            return {
              ok: false,
              message: userFacingErrorMessage(error, 'password', 'We could not send a password reset email right now. Please try again.'),
            };
          }
          return {
            ok: true,
            message: 'Password reset instructions have been sent. Open the link in your email to continue securely.',
          };
        } catch (error) {
          return {
            ok: false,
            message: userFacingErrorMessage(error, 'password', 'We could not send a password reset email right now. Please try again.'),
          };
        }
      },
      async updatePassword(password) {
        try {
          const { error } = await supabase.auth.updateUser({ password });
          if (error) {
            return {
              ok: false,
              message: userFacingErrorMessage(error, 'password', 'Your password could not be updated. Please try again.'),
            };
          }
          setIsPasswordRecovery(false);
          return { ok: true, message: 'Your password has been updated.' };
        } catch (error) {
          return {
            ok: false,
            message: userFacingErrorMessage(error, 'password', 'Your password could not be updated. Please try again.'),
          };
        }
      },
      async requestPhoneVerification(phone) {
        try {
          const normalized = phone.replace(/[\s()-]/g, '');
          if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
            return { ok: false, message: 'Enter an international phone number including the country code.' };
          }
          const { error } = await supabase.auth.updateUser({ phone: normalized });
          if (error) {
            return { ok: false, message: userFacingErrorMessage(error, 'phoneVerification') };
          }
          return { ok: true, message: 'Verification code sent.' };
        } catch (error) {
          return { ok: false, message: userFacingErrorMessage(error, 'phoneVerification') };
        }
      },
      async verifyPhoneOtp(phone, token) {
        try {
          const normalized = phone.replace(/[\s()-]/g, '');
          const { data, error } = await supabase.auth.verifyOtp({
            phone: normalized,
            token,
            type: 'phone_change',
          });
          if (error) return { ok: false, message: userFacingErrorMessage(error, 'phoneVerification') };
          if (data.session) {
            setSession(data.session);
            setIsLoading(false);
          }
          persistPhonePrompt(false);
          setVerificationPromptPending(false);
          return { ok: true, message: 'Phone number verified.' };
        } catch (error) {
          return { ok: false, message: userFacingErrorMessage(error, 'phoneVerification') };
        }
      },
      dismissPhoneVerification() {
        persistPhonePrompt(false);
        setVerificationPromptPending(false);
      },
      dismissPasswordRecovery() {
        setIsPasswordRecovery(false);
      },
      async signOut() {
        persistPhonePrompt(false);
        setVerificationPromptPending(false);
        setIsPasswordRecovery(false);
        await supabase.auth.signOut({ scope: 'local' });
        setSession(null);
        setIsLoading(false);
      },
    }),
    [isLoading, isPasswordRecovery, requestPhonePrompt, session, verificationPromptPending],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
}
