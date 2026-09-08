import type { Session } from '@supabase/supabase-js';
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

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      setIsLoading(false);
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
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

        return error
          ? {
              ok: false,
              message: 'Unable to sign in. Check your details and try again.',
            }
          : { ok: true };
      },
      async signUp({ displayName, email, password }) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: { display_name: displayName.trim() },
          },
        });

        if (error) {
          return {
            ok: false,
            message: 'Unable to create the account. Review your details and try again.',
          };
        }

        return data.session
          ? { ok: true }
          : {
              ok: true,
              message: 'Check your email to confirm your VAD account.',
            };
      },
      async signOut() {
        await supabase.auth.signOut({ scope: 'local' });
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
