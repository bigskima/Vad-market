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

interface AuthContextValue {
  isLoading: boolean;
  session: Session | null;
  signIn(email: string, password: string): Promise<AuthActionResult>;
  signUp(input: SignUpInput): Promise<AuthActionResult>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      setIsLoading(false);
    }).catch(() => {
      if (isMounted) setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!isMounted) return;
        setSession(nextSession);
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

          if (data.session) {
            setSession(data.session);
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
      async signOut() {
        await supabase.auth.signOut({ scope: 'local' });
        setSession(null);
      },
    }),
    [isLoading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
}
