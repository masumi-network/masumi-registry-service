import { createContext, useCallback, useContext, useState } from 'react';
import { parseNetwork, type Network } from '@/lib/agent-filters';

const NETWORK_STORAGE_KEY = 'registry_network';
const DEFAULT_NETWORK: Network = 'Preprod';

interface NetworkContextValue {
  network: Network;
  setNetwork: (network: Network) => void;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

function readStoredNetwork(): Network {
  try {
    return parseNetwork(localStorage.getItem(NETWORK_STORAGE_KEY)) ?? DEFAULT_NETWORK;
  } catch {
    // Storage can throw in private mode or with blocked site data.
    return DEFAULT_NETWORK;
  }
}

/** The Cardano network every screen queries. App-level, like the payment service's switch. */
export function NetworkProvider({ children }: { children: React.ReactNode }) {
  // Read during the first client render: nothing that shows the network is pre-rendered
  // (the auth gate renders a loading screen first), so there is no hydration mismatch.
  const [network, setNetworkState] = useState<Network>(() =>
    typeof window === 'undefined' ? DEFAULT_NETWORK : readStoredNetwork(),
  );

  const setNetwork = useCallback((value: Network) => {
    setNetworkState(value);
    try {
      localStorage.setItem(NETWORK_STORAGE_KEY, value);
    } catch {
      // The choice still applies to this session.
    }
  }, []);

  return (
    <NetworkContext.Provider value={{ network, setNetwork }}>{children}</NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextValue {
  const context = useContext(NetworkContext);
  if (!context) throw new Error('useNetwork must be used within NetworkProvider');
  return context;
}
