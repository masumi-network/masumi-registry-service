import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import { toast } from 'react-toastify';
import { Button } from '@/components/ui/button';
import { ApiKeyDialog } from '@/components/auth/ApiKeyDialog';
import { classifyAuthError } from '@/lib/auth/errors';
import { useAuth } from '@/lib/contexts/AuthContext';
import { canAccessPath, isAdminKey } from '@/lib/permissions';
import { useApiKeyStatus } from '@/lib/queries/useApiKeyStatus';

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-sm space-y-4 text-center text-sm text-muted-foreground">{children}</div>
    </main>
  );
}

/**
 * Everything behind the sign-in screen. Nothing below it mounts until a key has been
 * accepted, and a page the key may not open is never mounted at all: leaving it up
 * would let its queries 401 into a plausible-looking empty state.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { phase, signOut } = useAuth();
  const status = useApiKeyStatus(phase === 'signed-in');

  const failure = useMemo(
    () => (status.isError ? classifyAuthError(status.error) : null),
    [status.isError, status.error],
  );
  const mustReenter = failure !== null && failure.kind !== 'unavailable';
  const isAllowed = canAccessPath(router.pathname, isAdminKey(status.data));
  const isBlocked = status.isSuccess && !isAllowed;

  useEffect(() => {
    if (failure && failure.kind !== 'unavailable') signOut(failure.message);
  }, [failure, signOut]);

  useEffect(() => {
    if (!isBlocked) return;
    toast.error('Admin access is required to open that page.', { toastId: 'admin-required' });
    void router.replace('/');
  }, [isBlocked, router]);

  if (phase === 'loading') {
    return (
      <CenteredMessage>
        <p role="status">Loading…</p>
      </CenteredMessage>
    );
  }
  if (phase === 'signed-out') return <ApiKeyDialog />;

  if (status.isPending || mustReenter) {
    return (
      <CenteredMessage>
        <p role="status">Checking your API key…</p>
      </CenteredMessage>
    );
  }
  // With a status already in hand, a failed background re-read is not worth hiding the
  // app for; only an unreachable API with nothing to show gets its own screen.
  if (failure && !status.data) {
    return (
      <CenteredMessage>
        <p role="alert" className="text-foreground">
          {failure.message}
        </p>
        <div className="flex justify-center gap-3">
          <Button onClick={() => void status.refetch()}>Try again</Button>
          <Button variant="outline" onClick={() => signOut()}>
            Use a different key
          </Button>
        </div>
      </CenteredMessage>
    );
  }

  if (!isAllowed) return null;
  return <>{children}</>;
}
