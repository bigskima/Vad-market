import { useState } from 'react';

import { CompactAuthFormScreen } from '@/components/auth/compact-auth-form-screen';
import { WelcomeScreen, type AuthMode } from '@/components/auth/welcome-screen';

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode | null>(null);

  if (!mode) {
    return <WelcomeScreen onContinue={setMode} />;
  }

  return <CompactAuthFormScreen initialMode={mode} onBack={() => setMode(null)} />;
}
