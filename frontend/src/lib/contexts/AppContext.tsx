import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Client, createClient } from '@/lib/api/generated/client';
import type { NetworkType } from '@/lib/api/types';
import { decodeApiKey, encodeApiKey } from '@/lib/utils';

const API_KEY_STORAGE = 'registry_api_key';
const NETWORK_STORAGE = 'registry_network';

type AppContextValue = {
  apiKey: string | null;
  authorized: boolean;
  network: NetworkType;
  apiClient: Client;
  updateApiKey: (apiKey: string | null) => void;
  setAuthorized: (authorized: boolean) => void;
  setNetwork: (network: NetworkType) => void;
  signOut: () => void;
  isChangingNetwork: boolean;
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [apiClient, setApiClient] = useState(() =>
    createClient({
      baseURL: process.env.NEXT_PUBLIC_REGISTRY_API_BASE_URL,
    }),
  );
  const [authorized, setAuthorized] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isChangingNetwork, setIsChangingNetwork] = useState(false);
  const [network, setNetworkState] = useState<NetworkType>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(NETWORK_STORAGE);
      if (stored === 'Mainnet' || stored === 'Preprod') return stored;
    }
    return 'Preprod';
  });

  const apiKeyRef = useRef<string | null>(null);
  useEffect(() => {
    apiKeyRef.current = apiKey;
  }, [apiKey]);

  const updateApiKey = useCallback(
    (newApiKey: string | null) => {
      if (newApiKey === apiKeyRef.current) return;
      apiKeyRef.current = newApiKey;
      setApiKey(newApiKey);
      if (newApiKey) {
        setApiClient(
          createClient({
            headers: { token: newApiKey },
            baseURL: process.env.NEXT_PUBLIC_REGISTRY_API_BASE_URL,
          }),
        );
        setAuthorized(true);
      } else {
        setAuthorized(false);
        setApiClient(
          createClient({
            headers: { token: 'invalid-api' },
            baseURL: process.env.NEXT_PUBLIC_REGISTRY_API_BASE_URL,
          }),
        );
      }
      queryClient.removeQueries();
    },
    [queryClient],
  );

  const setNetwork = useCallback((value: NetworkType) => {
    setIsChangingNetwork(true);
    setNetworkState(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem(NETWORK_STORAGE, value);
    }
    setTimeout(() => setIsChangingNetwork(false), 350);
  }, []);

  const signOut = useCallback(() => {
    apiKeyRef.current = null;
    setApiKey(null);
    setAuthorized(false);
    setApiClient(
      createClient({
        headers: { token: 'invalid-api' },
        baseURL: process.env.NEXT_PUBLIC_REGISTRY_API_BASE_URL,
      }),
    );
    setNetworkState('Preprod');
    localStorage.removeItem(API_KEY_STORAGE);
    localStorage.removeItem(NETWORK_STORAGE);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(
    () => ({
      apiKey,
      authorized,
      network,
      apiClient,
      updateApiKey,
      setAuthorized,
      setNetwork,
      signOut,
      isChangingNetwork,
    }),
    [
      apiKey,
      authorized,
      network,
      apiClient,
      updateApiKey,
      setNetwork,
      signOut,
      isChangingNetwork,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
}

export function loadStoredApiKey() {
  if (typeof window === 'undefined') return null;
  const hexed = localStorage.getItem(API_KEY_STORAGE);
  if (!hexed) return null;
  try {
    return decodeApiKey(hexed);
  } catch {
    return null;
  }
}

export function persistApiKey(key: string) {
  localStorage.setItem(API_KEY_STORAGE, encodeApiKey(key));
}

export { API_KEY_STORAGE };
