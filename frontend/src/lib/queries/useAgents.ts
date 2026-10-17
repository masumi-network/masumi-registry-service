import { postRegistryEntry, type RegistryEntry } from '@/lib/api/generated';
import type { Client } from '@/lib/api/generated/client';
import type { RegistryQueryBody } from '@/lib/agent-filters';

export async function fetchRegistryEntries(
  body: RegistryQueryBody,
  signal?: AbortSignal,
  client?: Client,
): Promise<RegistryEntry[]> {
  const { data } = await postRegistryEntry({ body, signal, throwOnError: true, client });
  // A proxy error page can arrive as a 200 with a non-JSON body.
  if (!Array.isArray(data?.data?.entries)) throw new Error('Unexpected registry entry response');
  return data.data.entries;
}
