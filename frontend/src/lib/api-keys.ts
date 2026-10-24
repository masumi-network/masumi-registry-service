import type { ApiKey, PatchApiKeyData } from '@/lib/api/generated';
import { describeUsage } from './permissions';

// The registry identifies a key by its plaintext token on update (the list only returns
// ids; tokens are stored hashed), and its update schema gives every omitted field a
// default: status Active, no usage limit. So an update is always the key's full state.

const MAX_USAGE_CREDITS = 1_000_000;

export type ApiKeyUpdateBody = NonNullable<PatchApiKeyData['body']>;

export interface ApiKeyChange {
  status?: ApiKey['status'];
  usageLimited?: boolean;
  maxUsageCredits?: number;
}

/** The PATCH body for one change, carrying the key's other fields so they stay as they are. */
export function buildApiKeyUpdate(
  key: ApiKey,
  token: string,
  change: ApiKeyChange,
): ApiKeyUpdateBody {
  return {
    token: token.trim(),
    status: change.status ?? key.status,
    usageLimited: change.usageLimited ?? key.usageLimited,
    maxUsageCredits: change.maxUsageCredits ?? key.maxUsageCredits ?? 0,
  };
}

/** A usage limit the API accepts: a whole number from 0 to 1,000,000. */
export function isValidUsageCredits(value: string): boolean {
  return /^\d{1,7}$/.test(value) && Number(value) <= MAX_USAGE_CREDITS;
}

/** A short form of a cuid, enough to tell keys apart: "cm1234…cdef". */
export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

/** What a confirmation names: "User key cm1234…cdef (Active, 120 of 500 credits used)". */
export function describeApiKey(key: ApiKey): string {
  const { used, limit } = describeUsage(key);
  const usage =
    limit === null ? `${used} credits used, no limit` : `${used} of ${limit} credits used`;
  return `${key.permission} key ${shortId(key.id)} (${key.status}, ${usage})`;
}
