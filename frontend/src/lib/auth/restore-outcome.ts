import { isApiAuthRejection } from '@/lib/utils';

/**
 * What to do after checking a saved API key on page load.
 * - ready: the key is an active admin key, restore the session.
 * - sign-in: the registry refused the key, so ask for a new one.
 * - unavailable: the registry could not answer. The key may well be fine, so keep it.
 */
export type RestoreOutcome =
  | { kind: 'ready' }
  | { kind: 'sign-in'; clearStoredKey: true; notice?: string }
  | { kind: 'unavailable' };

interface KeyStatus {
  status: string;
  permission: string;
}

/** Only a 401/403 means the key is bad; anything else says nothing about the key. */
export function outcomeForStatusError(error: unknown): RestoreOutcome {
  return isApiAuthRejection(error)
    ? { kind: 'sign-in', clearStoredKey: true }
    : { kind: 'unavailable' };
}

export function outcomeForStatus(status: KeyStatus | null | undefined): RestoreOutcome {
  // A proxy or load balancer can answer 200 with an empty or non-JSON body during an
  // outage. That is not a verdict on the key, so keep it (useApiKeyStatus agrees).
  if (!status) return { kind: 'unavailable' };
  if (status.status === 'Active' && status.permission === 'Admin') return { kind: 'ready' };
  return status.permission === 'Admin'
    ? { kind: 'sign-in', clearStoredKey: true }
    : { kind: 'sign-in', clearStoredKey: true, notice: 'Unauthorized access' };
}
