import { effectScope, getCurrentScope, onScopeDispose, shallowRef, type ShallowRef } from 'vue'

/** A framework-neutral value source that Vue can observe. */
export interface SpreadsheetValueSource<T> {
  getSnapshot: () => T
  subscribe: (onStoreChange: () => void) => () => void
}

/** A Vue value subscription with an explicit cleanup path. */
export interface SpreadsheetValueSubscription<T> {
  dispose: () => void
  value: Readonly<ShallowRef<T>>
}

/**
 * Reads a spreadsheet value source through a shallow Vue ref.
 *
 * The source remains the owner of the value. Stopping the caller's Vue scope
 * (including component unmount) disposes the bridge; callers outside a scope
 * can use the returned `dispose` function directly.
 */
export function useSpreadsheetValue<T>(
  source: SpreadsheetValueSource<T>,
): SpreadsheetValueSubscription<T> {
  const bridgeScope = effectScope()
  const value = shallowRef<T>(source.getSnapshot())

  bridgeScope.run(() => {
    const unsubscribe = source.subscribe(() => {
      value.value = source.getSnapshot()
    })

    onScopeDispose(unsubscribe)
  })

  const dispose = () => bridgeScope.stop()

  if (getCurrentScope()) onScopeDispose(dispose)

  return { dispose, value }
}
