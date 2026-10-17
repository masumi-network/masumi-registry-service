import type { AppProps } from 'next/app';
import { useEffect, useState } from 'react';
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
  const [mounted, setMounted] = useState(false);
  const { apiClient, updateApiKey, authorized, setAuthorized, signOut, apiKey } = useAppContext();

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async (): Promise<void> => {
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
      const statusResponse = await handleApiCall(() => getApiKeyStatus({ client: apiClient }), {
        onError: (error) => {
          console.error('API key status check failed:', error);
          if (!cancelled) {
            setIsHealthy(true);
            setAuthorized(false);
          }
        },
      });
      if (cancelled || localStorage.getItem(API_KEY_STORAGE) !== storedEncryptedKey) {
        if (!cancelled) void init();
        return;
      }

      if (!statusResponse) {
        setIsHealthy(true);
        setAuthorized(false);
        return;
      }

      const status = statusResponse.data?.data;
      if (!status) {
        setIsHealthy(true);
        setAuthorized(false);
        return;
      }

      if (status.status !== 'Active' || status.permission !== 'Admin') {
        if (status.permission !== 'Admin') {
          toast.error('Unauthorized access');
        }
        localStorage.removeItem(API_KEY_STORAGE);
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
  }, [apiClient, setAuthorized, updateApiKey]);

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

  if (isHealthy === false) {
    return (
      <div className="flex items-center justify-center bg-background text-foreground fixed top-0 left-0 w-full h-full z-50">
        <div className="text-center space-y-4">
          <div className="text-lg text-destructive">System Unavailable</div>
          <div className="text-sm text-muted-foreground">
            Unable to connect to required services. Please try again later.
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
