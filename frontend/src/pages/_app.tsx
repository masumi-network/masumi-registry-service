import type { AppProps } from 'next/app';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import '@/styles/globals.css';
import '@/styles/styles.scss';
import { ThemeProvider, useTheme } from '@/lib/contexts/ThemeContext';
import { SidebarProvider } from '@/lib/contexts/SidebarContext';
import { QueryProvider } from '@/lib/contexts/QueryProvider';
import { AppProvider, API_KEY_STORAGE, useAppContext } from '@/lib/contexts/AppContext';
import { ApiKeySessionGuard } from '@/components/auth/ApiKeySessionGuard';
import { ApiKeyDialog } from '@/components/api-keys/ApiKeyDialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getApiKeyStatus, getHealth } from '@/lib/api/generated';
import { decodeLegacyStoredKey, decryptFromStorage, encryptForStorage } from '@/lib/secure-storage';
import { resetRegistryClientAuth } from '@/lib/api/client-auth';
import { outcomeForStatus, outcomeForStatusError } from '@/lib/auth/restore-outcome';
import { handleApiCall } from '@/lib/utils';

function ToastWrapper() {
  const { theme } = useTheme();
  return createPortal(
    <ToastContainer
      position="top-right"
      autoClose={3000}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme={theme === 'dark' ? 'dark' : 'light'}
    />,
    document.body,
  );
}

function ThemedApp({ Component, pageProps }: AppProps) {
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const [keyCheckFailed, setKeyCheckFailed] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [mounted, setMounted] = useState(false);
  const { apiClient, updateApiKey, authorized, setAuthorized, signOut, apiKey } = useAppContext();

  // Restoring the saved session must not re-run when sign-in replaces `apiClient`: the extra
  // check it caused could fail on a brief outage and show a valid key as invalid.
  const sessionRef = useRef({ apiClient, updateApiKey, setAuthorized });
  useEffect(() => {
    sessionRef.current = { apiClient, updateApiKey, setAuthorized };
  }, [apiClient, updateApiKey, setAuthorized]);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async (): Promise<void> => {
      const { apiClient, updateApiKey, setAuthorized } = sessionRef.current;
      const response = await handleApiCall(() => getHealth({ client: apiClient }), {
        onError: (error) => {
          console.error('Health check failed:', error);
          if (!cancelled) setIsHealthy(false);
        },
      });
      if (cancelled) return;

      if (!response) {
        setIsHealthy(false);
        return;
      }

      const storedEncryptedKey = localStorage.getItem(API_KEY_STORAGE);
      if (!storedEncryptedKey) {
        setIsHealthy(true);
        setAuthorized(false);
        return;
      }

      const legacyApiKey = decodeLegacyStoredKey(storedEncryptedKey);
      let storedApiKey: string | null = null;
      try {
        storedApiKey = await decryptFromStorage(storedEncryptedKey);
      } catch {
        if (cancelled || localStorage.getItem(API_KEY_STORAGE) !== storedEncryptedKey) {
          if (!cancelled) void init();
          return;
        }
        if (legacyApiKey == null) {
          toast.error('Unable to read saved API key. Please sign in again.');
          setIsHealthy(true);
          setAuthorized(false);
          return;
        }
      }
      if (cancelled || localStorage.getItem(API_KEY_STORAGE) !== storedEncryptedKey) {
        if (!cancelled) void init();
        return;
      }

      const shouldMigrate = storedApiKey == null && legacyApiKey != null;
      storedApiKey ??= legacyApiKey;
      if (!storedApiKey) {
        localStorage.removeItem(API_KEY_STORAGE);
        setIsHealthy(true);
        setAuthorized(false);
        return;
      }

      apiClient.setConfig({
        headers: {
          token: storedApiKey,
        },
      });
      let statusError: unknown;
      const statusResponse = await handleApiCall(() => getApiKeyStatus({ client: apiClient }), {
        onError: (error) => {
          console.error('API key status check failed:', error);
          statusError = error;
        },
      });
      if (cancelled || localStorage.getItem(API_KEY_STORAGE) !== storedEncryptedKey) {
        if (!cancelled) void init();
        return;
      }

      const outcome = statusResponse
        ? outcomeForStatus(statusResponse.data?.data)
        : outcomeForStatusError(statusError);

      if (outcome.kind === 'unavailable') {
        // The registry could not answer, which says nothing about the key: keep it.
        resetRegistryClientAuth(apiClient);
        setIsHealthy(true);
        setKeyCheckFailed(true);
        return;
      }

      if (outcome.kind === 'sign-in') {
        if (outcome.notice) toast.error(outcome.notice);
        localStorage.removeItem(API_KEY_STORAGE);
        resetRegistryClientAuth(apiClient);
        setIsHealthy(true);
        setAuthorized(false);
        return;
      }

      if (shouldMigrate) {
        try {
          const encryptedKey = await encryptForStorage(storedApiKey);
          if (cancelled || localStorage.getItem(API_KEY_STORAGE) !== storedEncryptedKey) {
            if (!cancelled) void init();
            return;
          }
          localStorage.setItem(API_KEY_STORAGE, encryptedKey);
        } catch {
          toast.error('Unable to upgrade saved API key. The app will retry after reload.');
        }
      }

      updateApiKey(storedApiKey);
      setIsHealthy(true);
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [restoreAttempt]);

  const retryRestore = (): void => {
    setKeyCheckFailed(false);
    setIsHealthy(null);
    setRestoreAttempt((attempt) => attempt + 1);
  };

  const changeKey = (): void => {
    setKeyCheckFailed(false);
    signOut();
  };

  if (isHealthy === null) {
    return (
      <div className="flex items-center justify-center bg-background text-foreground fixed top-0 left-0 w-full h-full z-50">
        <div className="text-center space-y-4">
          <Spinner size={20} addContainer />
        </div>
      </div>
    );
  }

  if (!authorized && apiKey) {
    return (
      <div className="flex items-center justify-center bg-background text-foreground fixed top-0 left-0 w-full h-full z-50">
        <div className="text-center space-y-4">
          <div className="text-lg text-destructive">Unauthorized</div>
          <div className="text-sm text-muted-foreground">
            Your API key is invalid or does not have admin permissions. Please sign out and sign in
            with an admin API key.
          </div>
          <Button
            variant="destructive"
            className="text-sm"
            onClick={() => {
              signOut();
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  if (isHealthy === false || keyCheckFailed) {
    return (
      <div className="flex items-center justify-center bg-background text-foreground fixed top-0 left-0 w-full h-full z-50">
        <div className="text-center space-y-4" role="alert">
          <div className="text-lg text-destructive">System Unavailable</div>
          <div className="text-sm text-muted-foreground">
            {keyCheckFailed
              ? 'Could not reach the registry API to check your saved key. Your key is kept; try again shortly.'
              : 'Unable to connect to required services. Please try again later.'}
          </div>
          <div className="flex justify-center gap-3">
            <Button className="text-sm" onClick={retryRestore}>
              Try again
            </Button>
            {keyCheckFailed && (
              <Button variant="outline" className="text-sm" onClick={changeKey}>
                Use a different key
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {apiKey ? (
        <ApiKeySessionGuard>
          <Component {...pageProps} />
        </ApiKeySessionGuard>
      ) : (
        <ApiKeyDialog />
      )}
      {mounted && <ToastWrapper />}
    </>
  );
}

export default function App(props: AppProps) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <AppProvider>
          <SidebarProvider>
            <TooltipProvider delayDuration={200}>
              <ThemedApp {...props} />
            </TooltipProvider>
          </SidebarProvider>
        </AppProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
