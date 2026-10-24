import { isAxiosError } from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getApiKey,
  getApiKeyStatus,
  patchApiKey,
  postApiKey,
  type ApiKey,
  type PostApiKeyData,
} from '@/lib/api/generated';
import { buildApiKeyUpdate, shortId, type ApiKeyChange } from '@/lib/api-keys';
import { collectInclusiveCursorPages } from '@/lib/pagination/cursor-pagination';
import { queryKeys } from './query-keys';

// GET /api-key caps `limit` at 100. Its order is not stable across pages (no orderBy), so
// the whole list is read and de-duplicated rather than shown a page at a time.
const KEY_PAGE_SIZE = 100;
const MAX_PAGES = 100;

async function fetchApiKeys(signal?: AbortSignal): Promise<ApiKey[]> {
  return collectInclusiveCursorPages(
    async (cursorId) => {
      const { data } = await getApiKey({
        query: { limit: KEY_PAGE_SIZE, cursorId },
        signal,
        throwOnError: true,
      });
      if (!Array.isArray(data?.data?.apiKeys)) throw new Error('Unexpected API key response');
      return data.data.apiKeys;
    },
    (key) => key.id,
    { maxPages: MAX_PAGES },
  );
}

export function useApiKeys() {
  return useQuery({ queryKey: queryKeys.apiKeys, queryFn: ({ signal }) => fetchApiKeys(signal) });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    // The result holds the new key's token: drop it as soon as the dialog closes.
    gcTime: 0,
    mutationFn: async (body: NonNullable<PostApiKeyData['body']>) => {
      const { data } = await postApiKey({ body, throwOnError: true });
      if (!data?.data?.token) throw new Error('Unexpected API key response');
      return data.data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys }),
  });
}

/** A token the registry rejected or that belongs to another key; nothing was changed. */
export class TokenMismatchError extends Error {}

/**
 * Checks the pasted token belongs to `key` before changing anything. The registry updates
 * keys by token, so without this a wrong paste would revoke a different key. A token's own
 * status call answers with its id; a revoked or unknown token answers 401.
 */
async function assertTokenBelongsTo(key: ApiKey, token: string): Promise<ApiKey> {
  let owner: ApiKey | undefined;
  try {
    const { data } = await getApiKeyStatus({ auth: token.trim(), throwOnError: true });
    owner = data?.data;
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 401) {
      throw new TokenMismatchError('The registry does not accept this token as an active key.');
    }
    throw error;
  }
  if (owner?.id !== key.id) {
    throw new TokenMismatchError(
      `This token belongs to a different key (${owner ? shortId(owner.id) : 'unknown'}), not ${shortId(key.id)}. Nothing was changed.`,
    );
  }
  return owner;
}

export interface ApiKeyUpdate {
  key: ApiKey;
  token: string;
  change: ApiKeyChange;
}

/** Revokes a key or changes its limit, after checking the token is that key's. */
export function useUpdateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    // The pasted token is in the variables: drop them as soon as the dialog closes.
    gcTime: 0,
    mutationFn: async ({ key, token, change }: ApiKeyUpdate) => {
      // The list row can be a minute old; the key's own status answer is current, so the
      // fields carried over unchanged are its present ones, not a stale snapshot.
      const current = await assertTokenBelongsTo(key, token);
      await patchApiKey({ body: buildApiKeyUpdate(current, token, change), throwOnError: true });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys });
      void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeyStatus });
    },
  });
}
