import type { AuthError, Session } from '@supabase/supabase-js';
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { supabase } from '@/lib/supabase';

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

function authMessage(error: AuthError | Error | null, mode: 'signIn' | 'signUp') {
  const message = error?.message?.toLowerCase() ?? '';

  if (message.includes('invalid login credentials')) {
    return 'The email or password is incorrect. Check both fields and try again.';
  }
  if (message.includes('email not confirmed')) {
    return 'Confirm your email address before signing in.';
  }
  if (message.includes('user already registered') || message.includes('already been registered')) {
    return 'An account already exists for this email. Sign in instead.';
  }
  if (message.includes('password') && (message.includes('weak') || message.includes('characters'))) {
    return error?.message ?? 'Choose a stronger password and try again.';
  }
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return 'Too many attempts. Wait a moment, then try again.';
  }
  if (message.includes('network') || message.includes('fetch')) {
    return 'VAD could not reach the sign-in service. Check your connection and try again.';
  }

  if (error?.message) return error.message;
  return mode === 'signIn'
    ? 'Unable to sign in right now. Please try again.'
    : 'Unable to create your account right now. Please try again.';
}

function getRedirectUrl() {
  const location = (globalThis as { location?: { origin?: string } }).location;
  return location?.origin ? `${location.origin}/` : undefined;
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

  function requestPhonePrompt(nextSession?: Session | null) {
    if (nextSession?.user.phone_confirmed_at) {
      persistPhonePrompt(false);
      setVerificationPromptPending(false);
      return;
    }
    persistPhonePrompt(true);
    setVerificationPromptPending(true);
  }

  useEffect(() => {
    let isMounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      if (data.session?.user.phone_confirmed_at) {
        persistPhonePrompt(false);
        setVerificationPromptPending(false);
      } else if (data.session && readPhonePrompt()) {
        setVerificationPromptPending(true);
      }
      setIsLoading(false);
    }).catch(() => {
      if (isMounted) setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!isMounted) return;
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
      subscription.subscription.unsubscribe();
    };
  }, []);

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
            return { ok: false, message: 'Sign in completed without a session. Please try again.' };
          }

          setSession(data.session);
          requestPhonePrompt(data.session);
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            message: authMessage(error instanceof Error ? error : null, 'signIn'),
          };
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
            requestPhonePrompt(data.session);
            return { ok: true };
          }

          return {
            ok: true,
            message: 'Account created. Check your email to confirm your VAD account, then sign in.',
          };
        } catch (error) {
          return {
            ok: false,
            message: authMessage(error instanceof Error ? error : null, 'signUp'),
          };
        }
      },
      async signInWithProvider(provider) {
        try {
          persistPhonePrompt(true);
          setVerificationPromptPending(true);
          const redirectTo = getRedirectUrl();
          const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: redirectTo ? { redirectTo } : undefined,
          });
          if (error) {
            persistPhonePrompt(false);
            setVerificationPromptPending(false);
            return { ok: false, message: error.message };
          }
          return { ok: true };
        } catch (error) {
          persistPhonePrompt(false);
          setVerificationPromptPending(false);
          return {
            ok: false,
            message: error instanceof Error ? error.message : 'Social sign in could not start.',
          };
        }
      },
      async requestPasswordReset(email) {
        try {
          const redirectTo = getRedirectUrl();
          const { error } = await supabase.auth.resetPasswordForEmail(
            email.trim().toLowerCase(),
            redirectTo ? { redirectTo } : undefined,
          );
          if (error) return { ok: false, message: error.message };
          return {
            ok: true,
            message: 'Password reset instructions have been sent. Open the link in your email to continue securely.',
          };
        } catch (error) {
          return {
            ok: false,
            message: error instanceof Error ? error.message : 'Password reset could not be requested.',
          };
        }
      },
      async updatePassword(password) {
        try {
          const { error } = await supabase.auth.updateUser({ password });
          if (error) return { ok: false, message: error.message };
          setIsPasswordRecovery(false);
          return { ok: true, message: 'Your password has been updated.' };
        } catch (error) {
          return {
            ok: false,
            message: error instanceof Error ? error.message : 'Your password could not be updated.',
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
          if (error) return { ok: false, message: error.message };
          return { ok: true, message: 'Verification code sent.' };
        } catch (error) {
          return {
            ok: false,
            message: error instanceof Error ? error.message : 'The verification code could not be sent.',
          };
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
          if (error) return { ok: false, message: error.message };
          if (data.session) setSession(data.session);
          persistPhonePrompt(false);
          setVerificationPromptPending(false);
          return { ok: true, message: 'Phone number verified.' };
        } catch (error) {
          return {
            ok: false,
            message: error instanceof Error ? error.message : 'The verification code could not be confirmed.',
          };
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
      },
    }),
    [isLoading, isPasswordRecovery, session, verificationPromptPending],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
}
