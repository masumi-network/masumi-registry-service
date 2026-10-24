import { useCallback, useEffect, useMemo, useRef } from 'react';
import Router, { useRouter } from 'next/router';
import type { ParsedUrlQuery } from 'querystring';

/** Builds the next view from the newest one, which may not have reached the URL yet. */
export type ViewUpdate<T> = (current: T) => T;

interface UrlViewCodec<T> {
  parse: (query: ParsedUrlQuery) => T;
  serialize: (view: T) => Record<string, string | string[]>;
}

const sameQuery = (left: Record<string, unknown>, right: Record<string, unknown>) =>
  JSON.stringify(left) === JSON.stringify(right);

async function writeUrl(query: Record<string, string | string[]>): Promise<void> {
  try {
    // replace, not push: a filter change should not add a history entry per keystroke.
    await Router.replace({ pathname: Router.pathname, query }, undefined, {
      shallow: true,
      scroll: false,
    });
  } catch (error) {
    // A newer navigation cancelling this one is expected; anything else is not.
    const isCancelled = (error as { cancelled?: boolean } | null)?.cancelled === true;
    if (!isCancelled) console.error('Could not update the URL', error);
  }
}

/**
 * A view read from and written to the URL, so it is a shareable link. `isReady` is false
 * until the static export's router has parsed the query; queries must wait for it.
 * `codec` must be a stable (module-level) object.
 */
export function useUrlView<T>(codec: UrlViewCodec<T>) {
  const router = useRouter();
  const view = useMemo(() => codec.parse(router.query), [codec, router.query]);

  // router.query trails a pending router.replace. Updates apply to `latest` instead, so a
  // second quick change builds on the first rather than silently undoing it.
  const latest = useRef(view);
  const pendingWrites = useRef(0);

  useEffect(() => {
    // While our own writes are in flight the URL shows an older view; only a settled URL
    // (first load, back/forward) is adopted.
    if (pendingWrites.current === 0) latest.current = view;
  }, [view]);

  const updateView = useCallback(
    (update: ViewUpdate<T>) => {
      const next = update(latest.current);
      const query = codec.serialize(next);
      if (sameQuery(query, codec.serialize(latest.current))) return;
      latest.current = next;
      pendingWrites.current += 1;
      void writeUrl(query).finally(() => {
        pendingWrites.current -= 1;
        // Settled: the URL is the truth again, even if back/forward landed meanwhile.
        if (pendingWrites.current === 0) latest.current = codec.parse(Router.query);
      });
    },
    [codec],
  );

  return { isReady: router.isReady, view, updateView };
}
