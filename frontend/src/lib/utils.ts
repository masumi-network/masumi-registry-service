import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * The value as a link target when it is an http(s) URL, else null. Registry metadata and
 * specs are written by agent owners, so a `javascript:` URL must never become a link.
 */
export function httpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy text: ', err);
    return false;
  }
}

export function shortenId(value: string, length = 6) {
  if (!value) return '';
  if (value.length <= length * 2) return value;
  return `${value.slice(0, length)}…${value.slice(-length)}`;
}

function getApiErrorHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as Record<string, unknown>;
  if (record.response && typeof record.response === 'object') {
    const status = (record.response as { status?: number }).status;
    if (typeof status === 'number') return status;
  }
  if (typeof record.status === 'number') return record.status;
  return undefined;
}

export function isApiAuthRejection(error: unknown): boolean {
  const status = getApiErrorHttpStatus(error);
  return status === 401 || status === 403;
}

/** Hey-api client returns Axios errors as values when throwOnError is false. */
export function isAxiosApiFailure(
  value: unknown,
): value is { response?: { status?: number; data?: unknown } } {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('isAxiosError' in value || ('response' in value && 'error' in value))
  );
}

export async function handleApiCall<T>(
  apiCall: () => Promise<T>,
  options: {
    onSuccess?: (data: T) => void;
    onError?: (error: unknown) => void;
    onFinally?: () => void;
    errorMessage?: string;
  } = {},
): Promise<T | null> {
  try {
    const response = await apiCall();

    if (response && typeof response === 'object' && 'error' in response && response.error) {
      if (options.onError) {
        options.onError(response.error);
      }
      return null;
    }

    options.onSuccess?.(response);
    return response;
  } catch (error) {
    if (options.onError) {
      options.onError(error);
    }
    return null;
  } finally {
    options.onFinally?.();
  }
}

export function extractErrorMessage(error: unknown, fallback = 'Request failed') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    // Axios / hey-api: error.response.data.error.message
    if (record.response && typeof record.response === 'object') {
      const response = record.response as Record<string, unknown>;
      if (response.data && typeof response.data === 'object') {
        const data = response.data as Record<string, unknown>;
        if (data.error && typeof data.error === 'object') {
          const nested = data.error as Record<string, unknown>;
          if (typeof nested.message === 'string') return nested.message;
        }
        if (typeof data.message === 'string') return data.message;
      }
    }
    if (record.error && typeof record.error === 'object') {
      const nested = record.error as Record<string, unknown>;
      if (typeof nested.message === 'string') return nested.message;
    }
    if (typeof record.message === 'string') return record.message;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
