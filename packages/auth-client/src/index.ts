export interface AuthUser {
  id: string;
  email?: string;
  phone?: string;
}

export interface AuthSession {
  accessToken: string;
  expiresAt?: number;
  user: AuthUser;
}

export interface PasswordCredentials {
  email: string;
  password: string;
}

export interface AuthClient {
  getSession(): Promise<AuthSession | null>;
  signInWithPassword(credentials: PasswordCredentials): Promise<AuthSession>;
  signUpWithPassword(credentials: PasswordCredentials): Promise<AuthSession | null>;
  signOut(): Promise<void>;
  subscribe(listener: (session: AuthSession | null) => void): () => void;
}

// This is a transport boundary only. Admin roles and financial authorization
// must never be derived from client-editable user metadata.
