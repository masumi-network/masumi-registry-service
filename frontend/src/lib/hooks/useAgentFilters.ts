import { useCallback, useEffect, useMemo, useRef } from 'react';
import Router, { useRouter } from 'next/router';
import {
  parseAgentFilters,
  sameView,
  serializeAgentFilters,
  type AgentFilters,
} from '@/lib/agent-filters';

/** Builds the next view from the newest one, which may not have reached the URL yet. */
export type AgentFiltersUpdate = (current: AgentFilters) => AgentFilters;

async function writeUrl(filters: AgentFilters): Promise<void> {
  try {
    // replace, not push: a filter change should not add a history entry per keystroke.
    await Router.replace(
      { pathname: Router.pathname, query: serializeAgentFilters(filters) },
      undefined,
      { shallow: true, scroll: false },
    );
  } catch (error) {
    // A newer navigation cancelling this one is expected; anything else is not.
    const isCancelled = (error as { cancelled?: boolean } | null)?.cancelled === true;
    if (!isCancelled) console.error('Could not update the agents URL', error);
  }
}

/**
 * The agent-browser filters, read from and written to the URL so a filtered view is a
 * shareable link. The network is not part of it: it is app-level (NetworkContext).
 * `isReady` is false until the static export's router has parsed the query; queries must
 * wait for it.
 */
export function useAgentFilters() {
  const router = useRouter();
  const filters = useMemo(() => parseAgentFilters(router.query), [router.query]);

  // router.query trails a pending router.replace. Updates apply to `latest` instead, so a
  // second quick change builds on the first rather than silently undoing it.
  const latest = useRef(filters);
  const pendingWrites = useRef(0);

  useEffect(() => {
    // While our own writes are in flight the URL shows an older view; only a settled URL
    // (first load, back/forward) is adopted.
    if (pendingWrites.current === 0) latest.current = filters;
  }, [filters]);

  const updateFilters = useCallback((update: AgentFiltersUpdate) => {
    const next = update(latest.current);
    if (sameView(next, latest.current)) return;
    latest.current = next;
    pendingWrites.current += 1;
    void writeUrl(next).finally(() => {
      pendingWrites.current -= 1;
      // Settled: the URL is the truth again, even if back/forward landed meanwhile.
      if (pendingWrites.current === 0) latest.current = parseAgentFilters(Router.query);
    });
  }, []);

  return { isReady: router.isReady, filters, updateFilters };
}
