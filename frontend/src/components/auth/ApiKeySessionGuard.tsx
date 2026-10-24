import { useEffect } from 'react';
import { toast } from 'react-toastify';
import { classifyAuthError } from '@/lib/auth/errors';
import { useAppContext } from '@/lib/contexts/AppContext';
import { useApiKeyStatus } from '@/lib/queries/useApiKeyStatus';

/** Re-validates the signed-in key and signs out when the registry rejects it. */
export function ApiKeySessionGuard({ children }: { children: React.ReactNode }) {
  const { apiKey, apiClient, signOut } = useAppContext();
  const status = useApiKeyStatus(Boolean(apiKey), apiClient);

  useEffect(() => {
    if (!status.isError) return;
    const failure = classifyAuthError(status.error);
    if (failure.kind === 'unavailable') return;
    toast.error(failure.message);
    signOut();
  }, [status.isError, status.error, signOut]);

  return <>{children}</>;
}
