import type { Atom, Store, WritableAtom } from '@einfach/core'
import {
  assertOwner, createContext, onCleanup, provideContext, useContext,
} from './owner.js'

export type Accessor<Value> = () => Value

export interface StoreOptions {
  readonly store?: Store
}

const storeContext = createContext<Store | undefined>(undefined)
const invalidationContext = createContext<(() => void) | undefined>(undefined)

/** Internal cell bridge: atom notifications only mark the cell for repaint. */
export function withInvalidation<T>(invalidate: () => void, fn: () => T): T {
  return provideContext(invalidationContext, invalidate, fn)
}

function useStore(options: StoreOptions): Store {
  assertOwner()
  const store = options.store ?? useContext(storeContext)
  if (!store) {
    throw new Error('An atom binding requires withStore() or an explicit store.')
  }
  return store
}

/** Provide an existing Core store to bindings created in this owner scope. */
export function withStore<Result>(store: Store, fn: () => Result): Result {
  return provideContext(storeContext, store, fn)
}

/** Subscribe once during cell setup; read the latest value when painting. */
export function useAtomValue<Value>(
  atom: Atom<Value>,
  options: StoreOptions = {},
): Accessor<Value> {
  const store = useStore(options)
  const owner = assertOwner()
  const invalidate = useContext(invalidationContext)
  if (!invalidate) throw new Error('useAtomValue requires a canvas cell setup.')
  const unsubscribe = store.sub(atom, invalidate)
  // Core can synchronously flush pending writes during subscription installation.
  if (owner.disposed) unsubscribe()
  else onCleanup(unsubscribe)
  return () => store.getter(atom) as Value
}

/** Preserve Core's writable atom argument and return types. */
export function useSetAtom<Value, Args extends unknown[], Result>(
  atom: WritableAtom<Value, Args, Result>,
  options: StoreOptions = {},
): (...args: Args) => Result {
  const store = useStore(options)
  return (...args) => store.setter(atom, ...args)
}
