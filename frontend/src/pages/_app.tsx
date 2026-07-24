import type { AppProps } from 'next/app';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import '@/styles/globals.css';
import '@/styles/styles.scss';
import { ThemeProvider, useTheme } from '@/lib/contexts/ThemeContext';
import { SidebarProvider } from '@/lib/contexts/SidebarContext';
import { QueryProvider } from '@/lib/contexts/QueryProvider';
import {
  AppProvider,
  loadStoredApiKey,
  useAppContext,
} from '@/lib/contexts/AppContext';
import { ApiKeyDialog } from '@/components/api-keys/ApiKeyDialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getApiKeyStatus, getHealth } from '@/lib/api/generated';

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
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { apiClient, updateApiKey, authorized, setAuthorized, signOut, apiKey } =
    useAppContext();

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

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
        if (cancelled || loadStoredApiKey() !== stored) return;

        const status = statusResponse.data?.data;
        if (status?.status === 'Active' && status.permission === 'Admin') {
          updateApiKey(stored);
          setAuthorized(true);
        } else {
          if (status && status.permission !== 'Admin') {
            toast.error('Unauthorized access');
          }
          localStorage.removeItem('registry_api_key');
          setAuthorized(false);
        }
      } catch {
        if (!cancelled) {
          setIsHealthy(false);
          setAuthorized(false);
        }
      }
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

  if (isMobile) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center bg-background text-foreground">
          <div className="text-center space-y-4 p-4">
            <div className="text-lg text-muted-foreground">
              Please use a desktop device to <br /> access the Masumi Admin Interface
            </div>
            <Button variant="muted">
              <Link href="https://docs.masumi.io" target="_blank" rel="noopener noreferrer">
                Learn more
              </Link>
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <>
      {apiKey ? <Component {...pageProps} /> : <ApiKeyDialog />}
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
