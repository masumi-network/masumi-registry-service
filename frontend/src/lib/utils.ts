import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { TESTUSDM_CONFIG, USDCX_CONFIG, getUsdmConfig } from '@/lib/constants/tokens';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

/** Compact date + time for dense tables (e.g. `7/24/26, 12:01 PM`). */
export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: '2-digit',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function groupDigits(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  if (!/^-?\d+$/.test(value)) return value;
  const negative = value.startsWith('-');
  const digits = (negative ? value.slice(1) : value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return negative ? `-${digits}` : digits;
}

const SIX_DECIMAL_BASE = BigInt(10) ** BigInt(6);
const SIX_DECIMAL_DISPLAY_UNITS = new Set(['ADA', 'USDM', 'tUSDM', 'USDCx']);

export function formatSixDecimalAmount(
  amount: string | number | bigint | null | undefined,
  fractionDigits: number = 2,
): string {
  if (amount == null || amount === '') return '—';
  let value: bigint;
  try {
    value = BigInt(amount);
  } catch {
    return String(amount);
  }
  const negative = value < BigInt(0);
  const abs = negative ? -value : value;
  const whole = groupDigits((abs / SIX_DECIMAL_BASE).toString());
  const fraction = (abs % SIX_DECIMAL_BASE).toString().padStart(6, '0').slice(0, fractionDigits);
  const formatted = fraction.length > 0 ? `${whole}.${fraction}` : whole;
  return negative ? `-${formatted}` : formatted;
}

/** Map unit ids → display labels (ADA / USDM / tUSDM / USDCx). Mirrors payment-service. */
export function formatFundUnit(unit: string | undefined, network: string | undefined): string {
  if (!network) {
    if (unit === 'lovelace' || !unit) return 'ADA';
    return unit;
  }

  if (!unit) return 'ADA';

  const isUsdcx =
    unit === USDCX_CONFIG.fullAssetId || unit === USDCX_CONFIG.policyId || unit === 'USDCx';
  if (isUsdcx) return 'USDCx';

  const usdmConfig = getUsdmConfig(network);
  const isUsdm =
    unit === usdmConfig.fullAssetId ||
    unit === usdmConfig.policyId ||
    unit === 'USDM' ||
    unit === 'tUSDM';
  if (isUsdm) {
    return network.toLowerCase() === 'preprod' ? 'tUSDM' : 'USDM';
  }

  if (unit === TESTUSDM_CONFIG.unit) return 'tUSDM';
  if (unit === 'lovelace') return 'ADA';

  return unit;
}

/** Format amount + unit — mirrors payment-service formatAssetAmount. */
export function formatAssetAmount(
  amount: string | number | bigint | null | undefined,
  unit: string | undefined,
  network: string | undefined,
): string {
  if (amount == null || amount === '') return '—';
  const displayUnit = formatFundUnit(unit, network);
  if (!SIX_DECIMAL_DISPLAY_UNITS.has(displayUnit)) {
    return `${groupDigits(String(amount))} ${displayUnit}`;
  }
  return `${formatSixDecimalAmount(amount)} ${displayUnit}`;
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
