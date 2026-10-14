import { assertOwner, getRootLifetime, type RootLifetime } from './owner.js';

export type ArgumentsEqual = (
  args: readonly unknown[],
  cachedArgs: readonly unknown[],
) => boolean;

type CacheEntry = { args: readonly unknown[]; result: unknown };

interface RootCache {
  disposed: boolean;
  factories: WeakMap<object, CacheEntry[]>;
}

const caches = new WeakMap<RootLifetime, RootCache>();

function sameArguments(args: readonly unknown[], cached: readonly unknown[]): boolean {
  return args.length === cached.length && args.every((value, i) => Object.is(value, cached[i]));
}

function cacheFor(root: RootLifetime): RootCache {
  let cache = caches.get(root);
  if (!cache) {
    cache = { disposed: false, factories: new WeakMap() };
    const ownedCache = cache;
    root.onCleanup(() => {
      ownedCache.disposed = true;
      ownedCache.factories = new WeakMap();
      caches.delete(root);
    });
    caches.set(root, cache);
  }
  return cache;
}

/** Memoizes a factory in the nearest root, shared by that root's child scopes. */
export function useCache<TArgs extends unknown[], TResult>(
  factory: (...args: TArgs) => TResult,
  equality: ArgumentsEqual = sameArguments,
): (...args: TArgs) => TResult {
  const root = getRootLifetime(assertOwner());
  const cache = cacheFor(root);
  return (...args: TArgs): TResult => {
    if (root.disposed || cache.disposed) throw new Error('Cache root has been disposed.');
    // Look up on each call: wrappers must not retain discarded entry arrays.
    const entries = cache.factories.get(factory) ?? [];
    for (const entry of entries) {
      if (equality(args, entry.args)) return entry.result as TResult;
    }
    const result = factory(...args);
    // Factory code can dispose its own root; never refill a disposed cache.
    if (root.disposed || cache.disposed) throw new Error('Cache root has been disposed.');
    const currentEntries = cache.factories.get(factory) ?? [];
    currentEntries.push({ args, result });
    cache.factories.set(factory, currentEntries);
    return result;
  };
}
