import { describe, expect, it, vi } from 'vitest';
import {
  createContext, createOwner, createRoot, createScope, disposeOwner,
  getOwner, onCleanup, provideContext, resetOwner, runWithOwner,
  useContext, type Owner,
} from '../src/owner.js';

describe('owner lifetimes', () => {
  it('disposes children and cleanups in reverse order exactly once', () => {
    const calls: string[] = [];
    const dispose = createRoot(disposeRoot => {
      onCleanup(() => calls.push('root first'));
      createScope(() => onCleanup(() => calls.push('child first')));
      createScope(() => {
        onCleanup(() => calls.push('child second first'));
        onCleanup(() => calls.push('child second last'));
      });
      onCleanup(() => calls.push('root last'));
      return disposeRoot;
    });
    dispose();
    dispose();
    expect(calls).toEqual([
      'child second last', 'child second first', 'child first', 'root last', 'root first',
    ]);
    expect(getOwner()).toBeNull();
  });

  it('keeps nested roots independent from parent disposal', () => {
    const childCleanup = vi.fn();
    let disposeChild = () => {};
    const disposeParent = createRoot(dispose => {
      disposeChild = createRoot(childDispose => {
        onCleanup(childCleanup);
        return childDispose;
      });
      return dispose;
    });
    disposeParent();
    expect(childCleanup).not.toHaveBeenCalled();
    disposeChild();
    expect(childCleanup).toHaveBeenCalledOnce();
  });

  it('unlinks a separately disposed child from its parent', () => {
    const cleanup = vi.fn();
    const disposeRoot = createRoot(dispose => {
      const disposeChild = createScope(childDispose => {
        onCleanup(cleanup);
        return childDispose;
      });
      disposeChild();
      expect(cleanup).toHaveBeenCalledOnce();
      return dispose;
    });
    disposeRoot();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('clears previous scope work while retaining the scope for reruns', () => {
    const calls: string[] = [];
    const root = createRoot(dispose => {
      const child = createOwner(getOwner());
      runWithOwner(child, () => {
        onCleanup(() => calls.push('old binding'));
        createScope(() => onCleanup(() => calls.push('nested effect')));
      });
      resetOwner(child);
      expect(child.disposed).toBe(false);
      expect(calls).toEqual(['nested effect', 'old binding']);
      runWithOwner(child, () => onCleanup(() => calls.push('new binding')));
      return { dispose, child };
    });
    root.dispose();
    expect(root.child.disposed).toBe(true);
    expect(calls).toEqual(['nested effect', 'old binding', 'new binding']);
  });

  it('continues cleaning after errors, reports them, and remains disposed', () => {
    const first = new Error('first');
    const second = new Error('second');
    const cleanup = vi.fn();
    const root = createRoot(dispose => {
      onCleanup(cleanup);
      onCleanup(() => { throw first; });
      createScope(() => onCleanup(() => { throw second; }));
      return { dispose, owner: getOwner()! };
    });
    expect(root.dispose).toThrow(AggregateError);
    expect(root.owner.disposed).toBe(true);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(root.dispose).not.toThrow();
    expect(() => runWithOwner(root.owner, () => 1)).toThrow('disposed');
  });

  it('cleans failed initialization and restores the caller owner', () => {
    const cleanup = vi.fn();
    const failure = new Error('initialization failed');
    createRoot(dispose => {
      const parent = getOwner();
      expect(() => createScope(() => {
        onCleanup(cleanup);
        throw failure;
      })).toThrow(failure);
      expect(cleanup).toHaveBeenCalledOnce();
      expect(getOwner()).toBe(parent);
      dispose();
    });
    expect(getOwner()).toBeNull();
  });

  it('preserves both initialization and cleanup errors', () => {
    const creationError = new Error('creation');
    const cleanupError = new Error('cleanup');
    try {
      createRoot(() => {
        onCleanup(() => { throw cleanupError; });
        throw creationError;
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([creationError, cleanupError]);
    }
    expect(getOwner()).toBeNull();
  });

  it('requires an owner for scopes and cleanups and restores runWithOwner on throw', () => {
    expect(() => createScope(() => 1)).toThrow('owner');
    expect(() => onCleanup(() => {})).toThrow('owner');
    const owner = createOwner(null);
    expect(() => runWithOwner(owner, () => { throw new Error('failed'); })).toThrow('failed');
    expect(getOwner()).toBeNull();
    disposeOwner(owner);
  });
});

describe('owner contexts', () => {
  it('retains inherited provider values in children and independent roots', () => {
    const context = createContext('default');
    let child!: Owner;
    let independent!: Owner;
    createRoot(dispose => {
      provideContext(context, 'provided', () => {
        child = createScope(() => getOwner()!);
        independent = createRoot(() => getOwner()!);
      });
      expect(useContext(context)).toBe('default');
      expect(runWithOwner(child, () => useContext(context))).toBe('provided');
      dispose();
    });
    expect(runWithOwner(independent, () => useContext(context))).toBe('provided');
    disposeOwner(independent);
    expect(useContext(context)).toBe('default');
  });

  it('distinguishes provided undefined from an absent value and restores nested providers', () => {
    const context = createContext<string | undefined>('default');
    createRoot(dispose => {
      provideContext(context, undefined, () => {
        expect(useContext(context)).toBeUndefined();
        provideContext(context, 'inner', () => expect(useContext(context)).toBe('inner'));
        expect(useContext(context)).toBeUndefined();
      });
      expect(useContext(context)).toBe('default');
      expect(() => provideContext(context, 'temporary', () => {
        throw new Error('provider failure');
      })).toThrow('provider failure');
      expect(useContext(context)).toBe('default');
      dispose();
    });
  });
});
