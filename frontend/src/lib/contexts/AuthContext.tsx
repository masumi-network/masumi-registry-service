import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ApiKey } from '@/lib/api/generated';
import { setApiKey } from '@/lib/api/config';
import { classifyAuthError, type AuthFailure } from '@/lib/auth/errors';
import { queryKeys } from '@/lib/queries/query-keys';
import { fetchApiKeyStatus } from '@/lib/queries/useApiKeyStatus';
import { decryptFromStorage, encryptForStorage } from '@/lib/secure-storage';

const API_KEY_STORAGE = 'registry_api_key';
// IndexedDB can hang rather than fail in some browsers; never let that lock out sign-in.
const STORAGE_TIMEOUT_MS = 3000;

// loading: the stored key has not been read yet (storage only exists after mount).
type Phase = 'loading' | 'signed-out' | 'signed-in';

interface AuthContextValue {
  phase: Phase;
  /** Why the session is signed out; shown on the sign-in screen. */
  notice: string | null;
  /** Resolves to null once the key is accepted, or to why it was not. */
  signIn: (key: string) => Promise<AuthFailure | null>;
  signOut: (notice?: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Browser storage did not respond')), ms),
  );
  return Promise.race([promise, timeout]);
}

function readStoredKey(): string | null {
  try {
    return localStorage.getItem(API_KEY_STORAGE);
  } catch {
    // Storage can throw in private mode or with blocked site data.
    return null;
  }
}

function clearStoredKey(): void {
  try {
    localStorage.removeItem(API_KEY_STORAGE);
  } catch {
    // Nothing was stored if storage is unavailable.
  }
}

async function restoreStoredKey(): Promise<{ phase: Phase; notice: string | null }> {
  const stored = readStoredKey();
  if (!stored) return { phase: 'signed-out', notice: null };
  try {
    const key = await withTimeout(decryptFromStorage(stored), STORAGE_TIMEOUT_MS);
    if (key === null) {
      // Only an unreadable ciphertext lands here, so it is safe to drop.
      clearStoredKey();
      return { phase: 'signed-out', notice: null };
    }
    setApiKey(key);
    return { phase: 'signed-in', notice: null };
  } catch (error) {
    // A storage failure says nothing about the saved key, so it is left in place.
    console.error('Could not read the stored API key', error);
    return {
      phase: 'signed-out',
      notice: 'Could not read the saved API key in this browser. Enter it again.',
    };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>('loading');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void restoreStoredKey().then((restored) => {
      if (cancelled) return;
      setNotice(restored.notice);
      setPhase(restored.phase);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // `storage` events fire in the *other* tabs only. A log out or sign in there changes who
  // this tab should be, and a reload re-reads storage and drops every in-memory copy.
  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      // A null key means localStorage.clear().
      if (event.key === API_KEY_STORAGE || event.key === null) window.location.reload();
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const signOut = useCallback(
    (reason?: string) => {
      setApiKey(null);
      clearStoredKey();
      // Cached queries and mutation results (a created key's token) belong to this key.
      queryClient.clear();
      setNotice(reason ?? null);
      setPhase('signed-out');
    },
    [queryClient],
  );

  const signIn = useCallback(
    async (key: string): Promise<AuthFailure | null> => {
      queryClient.clear();
      setApiKey(key);

      // Validate before persisting: a rejected key must never be stored.
      let status: ApiKey;
      try {
        status = await fetchApiKeyStatus();
      } catch (error) {
        // Nothing was stored for this key, so any saved key is left as it was.
        setApiKey(null);
        return classifyAuthError(error);
      }

      try {
        const encrypted = await withTimeout(encryptForStorage(key), STORAGE_TIMEOUT_MS);
        localStorage.setItem(API_KEY_STORAGE, encrypted);
      } catch (error) {
        // The session still works; drop any older key so a reload cannot resurrect it.
        clearStoredKey();
        console.error('Could not store the API key in this browser', error);
      }

      queryClient.setQueryData(queryKeys.apiKeyStatus, status);
      setNotice(null);
      setPhase('signed-in');
      return null;
    },
    [queryClient],
  );

  return (
    <AuthContext.Provider value={{ phase, notice, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
