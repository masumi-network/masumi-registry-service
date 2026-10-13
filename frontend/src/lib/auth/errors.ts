import { isAxiosError } from 'axios';

/**
 * - rejected: the key is not accepted (invalid, revoked, or missing). Re-enter it.
 * - forbidden: the key is valid but may not do this. Re-enter a different key.
 * - unavailable: the registry could not be reached. The key is probably fine, keep it.
 */
type AuthFailureKind = 'rejected' | 'forbidden' | 'unavailable';

export interface AuthFailure {
  kind: AuthFailureKind;
  message: string;
}

// Fixed copy on purpose: the response body is never echoed back into the UI.
export function classifyAuthError(error: unknown): AuthFailure {
  const status = isAxiosError(error) ? error.response?.status : undefined;

  if (status === 401) {
    return { kind: 'rejected', message: 'This API key is invalid or revoked.' };
  }
  if (status === 403) {
    return {
      kind: 'forbidden',
      message: 'This API key does not have permission to use the registry.',
    };
  }
  if (status === undefined) {
    return {
      kind: 'unavailable',
      message: 'Could not reach the registry API. Check your connection and try again.',
    };
  }
  return {
    kind: 'unavailable',
    message: `The registry API returned an error (${status}). Try again shortly.`,
  };
}
