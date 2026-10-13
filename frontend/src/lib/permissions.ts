import type { ApiKey } from './api/generated';

// Pages a non-admin key may open. Everything else is admin-only, so a page added without
// being listed here is blocked (a visible redirect) rather than silently exposed. Read
// surfaces register their path here; sub-routes such as `/agents/[id]` are covered too.
const USER_PATHS = ['/', '/agent', '/404'];

export function isAdminKey(key: ApiKey | undefined): boolean {
  return key?.permission === 'Admin' && key.status === 'Active';
}

export function canAccessPath(pathname: string, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  return USER_PATHS.some(
    (path) => pathname === path || (path !== '/' && pathname.startsWith(`${path}/`)),
  );
}

/** `limit` is null only when the key has no usage limit. */
export function describeUsage(key: ApiKey): { used: number; limit: number | null } {
  return {
    used: key.accumulatedUsageCredits ?? 0,
    // A limited key with no recorded maximum has no allowance; never present it as unlimited.
    limit: key.usageLimited ? (key.maxUsageCredits ?? 0) : null,
  };
}
