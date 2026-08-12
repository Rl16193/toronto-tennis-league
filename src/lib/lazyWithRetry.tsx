import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';

/**
 * Recovery for stale lazy chunks after a deploy.
 *
 * A tab left open across a deploy still holds the OLD build's hashed chunk URLs. Navigating to a
 * route it hasn't loaded yet requests a file Hosting no longer has (previous deploys' assets
 * aren't retained), and the dynamic import rejects. Nothing about this is fixable with cache
 * headers — index.html is already `no-cache`; the problem is that a long-open tab never re-fetches
 * index.html at all, so it keeps a hash map that no longer matches the server.
 *
 * The only real cure is one reload, which pulls the current index.html and its current hashes.
 *
 * THE HARD RULE HERE: the returned promise must ALWAYS settle.
 *
 * The first version returned `new Promise(() => {})` after kicking off a reload, on the assumption
 * that the reload would tear the page down before React rendered again. It doesn't —
 * `location.reload()` is asynchronous, React keeps rendering, and a lazy payload that never
 * settles leaves Suspense pending forever with no timeout and no error path out. That is what
 * made /marketplace open blank until the user reloaded by hand. Throwing isn't an escape either:
 * React caches a rejected lazy payload permanently, so the error just moves to the root boundary
 * and takes the whole app down. So both failure paths now resolve to a real component.
 */
const RELOAD_KEY_PREFIX = 'rs-chunk-reload-at:';
const RELOAD_COOLDOWN_MS = 15_000;

const CHUNK_ERROR = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

export const isChunkLoadError = (error: unknown): boolean =>
  CHUNK_ERROR.test(error instanceof Error ? error.message : String(error));

/**
 * Reloads once per cooldown window, per chunk. Returns true if a reload was started.
 *
 * Keyed by chunk rather than globally: with one shared timestamp, an unrelated hiccup (or the
 * error-boundary backstop in main.tsx) burned the budget, and the next route touched within the
 * window got no recovery attempt at all.
 *
 * If sessionStorage is unavailable (private mode, blocked cookies) we deliberately do NOT reload
 * — without somewhere to record the attempt there's no way to stop a loop.
 */
export function reloadForStaleChunk(key = 'app'): boolean {
  const storageKey = RELOAD_KEY_PREFIX + key;
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(storageKey) || 0);
  } catch {
    return false;
  }
  if (Number.isFinite(last) && Date.now() - last < RELOAD_COOLDOWN_MS) return false;
  try {
    sessionStorage.setItem(storageKey, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** Shown in place of a route whose chunk can't be fetched, instead of hanging or blanking. */
const ChunkLoadFailed: ComponentType = () => (
  <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
    <h2 className="text-lg font-bold text-fg">Couldn’t load this page</h2>
    <p className="text-sm text-fg/70">
      This usually means a new version was released while the app was open.
    </p>
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="px-6 py-3 bg-clay text-white font-bold rounded-2xl"
    >
      Reload
    </button>
  </div>
);

/**
 * Drop-in replacement for React.lazy that recovers from a stale chunk instead of blanking the
 * page. Use for every route-level and modal-level dynamic import.
 *
 * `key` scopes the reload cooldown to this chunk; pass something stable and unique per import.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors React.lazy's own
// constraint; narrowing it would reject any wrapped component that takes props.
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  key?: string,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      // A genuine app error (a module that throws at import time) must still surface.
      if (!isChunkLoadError(error)) throw error;

      // One immediate retry: a dropped connection mid-download fails the same way a deleted file
      // does, and that case recovers without costing the user a reload.
      try {
        return await factory();
      } catch { /* still failing — treat it as a stale chunk */ }

      reloadForStaleChunk(key);
      // Resolve either way. If the reload lands, this render is thrown away; if it doesn't
      // (cooldown, or storage blocked), the user gets a card they can act on rather than a
      // blank screen or a dead app.
      return { default: ChunkLoadFailed as unknown as T };
    }
  });
}
