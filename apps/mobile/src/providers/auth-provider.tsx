import type { Session } from '@supabase/supabase-js';
import * as ExpoLinking from 'expo-linking';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Linking as NativeLinking, Platform } from 'react-native';

import { clearDynamicWalletSessionSafe } from '@/lib/dynamic-session';
import { supabase } from '@/lib/supabase';
import { userFacingErrorMessage } from '@/lib/user-facing-error';

interface AuthActionResult {
  ok: boolean;
  message?: string;
  requiresMfa?: boolean;
}

type PendingTotpChallenge = {
  factorId: string;
  challengeId: string;
  userId: string;
};

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
  mfaLoginRequired: boolean;
  signIn(email: string, password: string): Promise<AuthActionResult>;
  verifyLoginMfaCode(code: string): Promise<AuthActionResult>;
  cancelMfaLogin(): Promise<void>;
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

async function createPendingTotpChallenge(): Promise<PendingTotpChallenge | null> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData.session;
  if (!session) return null;

  const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) throw assuranceError;
  if (assurance.currentLevel === 'aal2') return null;

  const { data: factorData, error: factorsError } = await supabase.auth.mfa.listFactors();
  if (factorsError) throw factorsError;
  const factor = (factorData.totp ?? []).find((item) => item.status === 'verified');
  if (!factor) return null;

  const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (challengeError) throw challengeError;
  if (!challengeData.id) throw new Error('The authenticator challenge could not be started.');
  return { factorId: factor.id, challengeId: challengeData.id, userId: session.user.id };
}

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
  const [mfaLoginRequired, setMfaLoginRequired] = useState(false);
  const pendingTotpChallengeRef = useRef<PendingTotpChallenge | null>(null);
  const passwordSignInInProgressRef = useRef(false);
  const mfaLoginPendingRef = useRef(false);
  const mfaVerifyInProgressRef = useRef(false);
  const bootstrapInProgressRef = useRef(true);
  const authRedirectInProgressRef = useRef(false);
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

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!isMounted) return;
      clearTimeout(bootstrapTimeout);
      try {
        if (data.session) {
          const challenge = await createPendingTotpChallenge();
          if (challenge) {
            pendingTotpChallengeRef.current = challenge;
            mfaLoginPendingRef.current = true;
            setMfaLoginRequired(true);
            // Do not expose an AAL1 session to protected routes until TOTP verifies.
            setSession(null);
          } else {
            pendingTotpChallengeRef.current = null;
            mfaLoginPendingRef.current = false;
            setMfaLoginRequired(false);
            setSession(data.session);
          }
        } else {
          setSession(null);
        }
        if (data.session?.user.phone_confirmed_at) {
          persistPhonePrompt(false);
          setVerificationPromptPending(false);
        } else if (data.session && readPhonePrompt()) {
          setVerificationPromptPending(true);
        }
      } catch {
        // Fail closed if an existing authenticated session cannot complete an
        // enabled authenticator check. The next password sign-in can retry it.
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
        setSession(null);
        setMfaLoginRequired(false);
        pendingTotpChallengeRef.current = null;
        mfaLoginPendingRef.current = false;
      } finally {
        bootstrapInProgressRef.current = false;
        setIsLoading(false);
      }
    }).catch(() => {
      if (!isMounted) return;
      clearTimeout(bootstrapTimeout);
      bootstrapInProgressRef.current = false;
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!isMounted) return;
        clearTimeout(bootstrapTimeout);
        if (bootstrapInProgressRef.current || event === 'INITIAL_SESSION') return;
        if (authRedirectInProgressRef.current || passwordSignInInProgressRef.current) return;
        // The verification request itself can emit an auth-state event. Do not
        // expose that session until the explicit AAL2 check below has passed.
        if (mfaVerifyInProgressRef.current) return;
        if (mfaLoginPendingRef.current && event !== 'SIGNED_OUT') {
          setSession(null);
          setIsLoading(false);
          return;
        }
        setSession(nextSession);
        if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
        if (event === 'SIGNED_OUT') void clearDynamicWalletSessionSafe();
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
      authRedirectInProgressRef.current = true;
      try {
        const result = await consumeAuthRedirect(url);
        if (!active || !result) return;
        if (result.session && !result.recovery) {
          const challenge = await createPendingTotpChallenge();
          if (challenge) {
            pendingTotpChallengeRef.current = challenge;
            mfaLoginPendingRef.current = true;
            setMfaLoginRequired(true);
            setSession(null);
          } else {
            pendingTotpChallengeRef.current = null;
            mfaLoginPendingRef.current = false;
            setMfaLoginRequired(false);
            setSession(result.session);
            requestPhonePrompt(result.session);
          }
          setIsLoading(false);
        } else if (result.session) {
          setSession(result.session);
          setIsLoading(false);
        }
        if (result.recovery) setIsPasswordRecovery(true);
        clearWebAuthUrl();
      } catch {
        // Invalid or expired callbacks return the user to the normal sign-in flow.
      } finally {
        authRedirectInProgressRef.current = false;
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
      mfaLoginRequired,
      async signIn(email, password) {
        passwordSignInInProgressRef.current = true;
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password,
          });

          if (error) return { ok: false, message: authMessage(error, 'signIn') };
          if (!data.session) {
            return { ok: false, message: 'We could not finish signing you in. Please try again.' };
          }

          const challenge = await createPendingTotpChallenge();
          if (challenge) {
            pendingTotpChallengeRef.current = challenge;
            mfaLoginPendingRef.current = true;
            setMfaLoginRequired(true);
            setSession(null);
            setIsLoading(false);
            return { ok: true, requiresMfa: true, message: 'Enter the six-digit code from your Google Authenticator app to finish signing in.' };
          }

          pendingTotpChallengeRef.current = null;
          mfaLoginPendingRef.current = false;
          setMfaLoginRequired(false);
          setSession(data.session);
          setIsLoading(false);
          requestPhonePrompt(data.session);
          return { ok: true };
        } catch (error) {
          // Do not leave an unverified AAL1 session usable after a failed
          // authenticator check; a retry starts from the normal sign-in form.
          await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
          pendingTotpChallengeRef.current = null;
          mfaLoginPendingRef.current = false;
          setMfaLoginRequired(false);
          setSession(null);
          setIsLoading(false);
          return { ok: false, message: error instanceof Error && error.message ? error.message : authMessage(error, 'signIn') };
        } finally {
          passwordSignInInProgressRef.current = false;
        }
      },
      async verifyLoginMfaCode(code) {
        const pending = pendingTotpChallengeRef.current;
        if (!pending || !mfaLoginPendingRef.current) return { ok: false, message: 'Your authenticator challenge has expired. Please sign in again.' };
        if (!/^\d{6}$/.test(code.trim())) return { ok: false, message: 'Enter the six-digit code shown by Google Authenticator.' };
        mfaVerifyInProgressRef.current = true;
        try {
          const { error } = await supabase.auth.mfa.verify({
            factorId: pending.factorId,
            challengeId: pending.challengeId,
            code: code.trim(),
          });
          if (error) return { ok: false, message: 'That authenticator code could not be verified. Check the current six-digit code and try again.' };
          const { data: current, error: sessionError } = await supabase.auth.getSession();
          if (sessionError || !current.session || current.session.user.id !== pending.userId) {
            return { ok: false, message: 'Authenticator verification succeeded, but VAD could not restore your session. Please sign in again.' };
          }
          const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          if (assuranceError || assurance.currentLevel !== 'aal2') {
            return { ok: false, message: 'VAD could not confirm the higher-assurance session. Try the code again.' };
          }
          pendingTotpChallengeRef.current = null;
          mfaLoginPendingRef.current = false;
          setMfaLoginRequired(false);
          setSession(current.session);
          setIsLoading(false);
          requestPhonePrompt(current.session);
          return { ok: true };
        } catch (error) {
          return { ok: false, message: userFacingErrorMessage(error, 'signIn') };
        } finally {
          mfaVerifyInProgressRef.current = false;
        }
      },
      async cancelMfaLogin() {
        pendingTotpChallengeRef.current = null;
        mfaLoginPendingRef.current = false;
        setMfaLoginRequired(false);
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
        setSession(null);
        setIsLoading(false);
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
        pendingTotpChallengeRef.current = null;
        mfaLoginPendingRef.current = false;
        setMfaLoginRequired(false);
        await Promise.allSettled([
          clearDynamicWalletSessionSafe(),
          supabase.auth.signOut({ scope: 'local' }),
        ]);
        setSession(null);
        setIsLoading(false);
      },
    }),
    [isLoading, isPasswordRecovery, mfaLoginRequired, requestPhonePrompt, session, verificationPromptPending],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
}
