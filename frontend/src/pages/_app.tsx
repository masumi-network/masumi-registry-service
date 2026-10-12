import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import '@/styles/globals.css';
import { ThemeProvider, useTheme } from '@/lib/contexts/ThemeContext';
import { SidebarProvider } from '@/lib/contexts/SidebarContext';
import { QueryProvider } from '@/lib/contexts/QueryProvider';
import { AuthProvider } from '@/lib/contexts/AuthContext';
import { AuthGate } from '@/components/auth/AuthGate';

function ToastWrapper() {
  const { theme } = useTheme();
  return createPortal(
    <ToastContainer
      position="top-right"
      autoClose={3000}
      newestOnTop
      closeOnClick
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme={theme}
    />,
    document.body,
  );
}

export default function App({ Component, pageProps }: AppProps) {
  // The portal needs document.body, which only exists after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  return (
    <ThemeProvider>
      <QueryProvider>
        <AuthProvider>
          <SidebarProvider>
            <Head>
              <title>Masumi Registry Admin</title>
            </Head>
            <AuthGate>
              <Component {...pageProps} />
            </AuthGate>
            {mounted && <ToastWrapper />}
          </SidebarProvider>
        </AuthProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
