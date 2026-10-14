import { describe, expect, it, vi } from 'vitest';
import { useCache } from '../src/cache.js';
import { createRoot, createScope, onCleanup } from '../src/owner.js';

describe('root factory cache', () => {
  it('shares the same factory result throughout one root', () => {
    const factory = vi.fn((id: number) => ({ id }));
    createRoot(dispose => {
      const cached = useCache(factory);
      const value = cached(1);
      createScope(() => expect(useCache(factory)(1)).toBe(value));
      expect(cached(2)).not.toBe(value);
      expect(factory).toHaveBeenCalledTimes(2);
      dispose();
    });
  });

  it('keeps the root cache through repeated child disposal', () => {
    const factory = vi.fn(() => ({}));
    createRoot(dispose => {
      const child = createScope(disposeChild => ({
        cached: useCache(factory), dispose: disposeChild,
      }));
      const value = child.cached();
      child.dispose();
      child.dispose();
      expect(child.cached()).toBe(value);
      createScope(() => expect(useCache(factory)()).toBe(value));
      expect(factory).toHaveBeenCalledOnce();
      dispose();
    });
  });

  it('isolates different roots including independent nested roots', () => {
    const factory = () => ({});
    const parent = createRoot(dispose => {
      const value = useCache(factory)();
      const child = createRoot(disposeChild => ({
        cached: useCache(factory), dispose: disposeChild,
      }));
      expect(child.cached()).not.toBe(value);
      return { dispose, child };
    });
    const childValue = parent.child.cached();
    parent.dispose();
    expect(parent.child.cached()).toBe(childValue);
    parent.child.dispose();
    const another = createRoot(dispose => ({ value: useCache(factory)(), dispose }));
    expect(another.value).not.toBe(childValue);
    another.dispose();
  });

  it('uses factory identity and Object.is for every argument by default', () => {
    const factory = (...values: unknown[]) => ({ values });
    createRoot(dispose => {
      const cached = useCache(factory);
      const identity = {};
      expect(cached(NaN, identity)).toBe(cached(NaN, identity));
      expect(cached(0)).not.toBe(cached(-0));
      expect(cached(identity)).not.toBe(cached({}));
      expect(cached(1)).not.toBe(cached(1, undefined));
      expect(useCache((...args: unknown[]) => factory(...args))(1)).not.toBe(cached(1));
      dispose();
    });
  });

  it('supports the existing argument-array comparator API', () => {
    const factory = vi.fn((key: { id: number }) => ({ key }));
    createRoot(dispose => {
      const cached = useCache(factory, (a, b) =>
        (a[0] as { id: number }).id === (b[0] as { id: number }).id);
      expect(cached({ id: 1 })).toBe(cached({ id: 1 }));
      expect(cached({ id: 2 })).not.toBe(cached({ id: 1 }));
      expect(factory).toHaveBeenCalledTimes(2);
      dispose();
    });
  });

  it('invalidates existing wrappers even if another cleanup throws', () => {
    const factory = vi.fn(() => ({}));
    const root = createRoot(dispose => {
      const cached = useCache(factory);
      cached();
      onCleanup(() => { throw new Error('cleanup failure'); });
      return { cached, dispose };
    });
    expect(root.dispose).toThrow('cleanup failure');
    expect(root.cached).toThrow('disposed');
    expect(factory).toHaveBeenCalledOnce();
    expect(root.dispose).not.toThrow();
  });

  it('does not cache failed factory calls', () => {
    const factory = vi.fn(() => {
      if (factory.mock.calls.length === 1) throw new Error('factory failure');
      return {};
    });
    createRoot(dispose => {
      const cached = useCache(factory);
      expect(cached).toThrow('factory failure');
      expect(cached()).toBe(cached());
      expect(factory).toHaveBeenCalledTimes(2);
      dispose();
    });
  });

  it('preserves entries created by reentrant factory calls', () => {
    createRoot(dispose => {
      const factory = vi.fn((key: string) => {
        if (key === 'outer') useCache(factory)('inner');
        return { key };
      });
      const cached = useCache(factory);
      cached('outer');
      const inner = cached('inner');
      expect(cached('inner')).toBe(inner);
      expect(factory).toHaveBeenCalledTimes(2);
      dispose();
    });
  });

  it('rejects factories that dispose the root while executing', () => {
    createRoot(dispose => {
      const cached = useCache(() => { dispose(); return {}; });
      expect(cached).toThrow('disposed');
      expect(cached).toThrow('disposed');
    });
  });

  it('requires an active owner when creating the wrapper', () => {
    expect(() => useCache(() => 1)).toThrow('owner');
  });
});
