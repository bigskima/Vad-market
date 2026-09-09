import { useState } from 'react';

import { AuthFormScreen } from '@/components/auth/auth-form-screen';
import { WelcomeScreen, type AuthMode } from '@/components/auth/welcome-screen';

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode | null>(null);

  if (!mode) {
    return <WelcomeScreen onContinue={setMode} />;
  }

  return <AuthFormScreen initialMode={mode} onBack={() => setMode(null)} />;
}
