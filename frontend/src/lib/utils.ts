import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortenId(value: string, length = 6) {
  if (!value) return '';
  if (value.length <= length * 2) return value;
  return `${value.slice(0, length)}…${value.slice(-length)}`;
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

export function encodeApiKey(key: string) {
  return Array.from(new TextEncoder().encode(key))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function decodeApiKey(hex: string) {
  const bytes = hex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) ?? [];
  return new TextDecoder().decode(new Uint8Array(bytes));
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
