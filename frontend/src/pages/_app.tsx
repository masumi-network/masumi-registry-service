import type { AppProps } from 'next/app';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import '@/styles/globals.css';
import { ThemeProvider, useTheme } from '@/lib/contexts/ThemeContext';
import { QueryProvider } from '@/lib/contexts/QueryProvider';
import {
  AppProvider,
  loadStoredApiKey,
  useAppContext,
} from '@/lib/contexts/AppContext';
import { ApiKeyDialog } from '@/components/api-keys/ApiKeyDialog';
import { Button } from '@/components/ui/button';
import { getApiKeyStatus, getHealth } from '@/lib/api/generated';

function ToastWrapper() {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);
  if (!mounted) return null;
  return createPortal(
    <ToastContainer
      position="top-right"
      autoClose={3000}
      newestOnTop
      closeOnClick
      pauseOnHover
      theme={theme === 'dark' ? 'dark' : 'light'}
    />,
    document.body,
  );
}

function ThemedApp({ Component, pageProps }: AppProps) {
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { apiClient, updateApiKey, authorized, setAuthorized, signOut } = useAppContext();

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const healthResponse = await getHealth({ client: apiClient });
        if (healthResponse.error || !healthResponse.data?.data) {
          if (!cancelled) {
            setIsHealthy(false);
            setAuthorized(false);
          }
          return;
        }
        if (cancelled) return;
        setIsHealthy(true);

        const stored = loadStoredApiKey();
        if (!stored) {
          setAuthorized(false);
          return;
        }

        apiClient.setConfig({ headers: { token: stored } });
        const statusResponse = await getApiKeyStatus({ client: apiClient });
        if (cancelled) return;

        const status = statusResponse.data?.data;
        if (status?.status === 'Active' && status.permission === 'Admin') {
          updateApiKey(stored);
        } else {
          localStorage.removeItem('registry_api_key');
          setAuthorized(false);
        }
      } catch {
        if (!cancelled) {
          setIsHealthy(false);
          setAuthorized(false);
        }
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [apiClient, setAuthorized, updateApiKey]);

  if (!bootstrapped || isHealthy === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Connecting to registry…
      </div>
    );
  }

  if (!isHealthy) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">Registry API unavailable</h1>
        <p className="text-muted-foreground max-w-md">
          Could not reach {process.env.NEXT_PUBLIC_REGISTRY_API_BASE_URL}. Start the registry
          service and refresh.
        </p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  if (!authorized) {
    return <ApiKeyDialog />;
  }

  if (isMobile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">Desktop recommended</h1>
        <p className="text-muted-foreground max-w-md">
          This admin interface is optimized for desktop. You can continue on a larger screen or
          sign out.
        </p>
        <Button variant="outline" onClick={signOut}>
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <>
      <Component {...pageProps} />
      <ToastWrapper />
    </>
  );
}

export default function App(props: AppProps) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <AppProvider>
          <ThemedApp {...props} />
        </AppProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
