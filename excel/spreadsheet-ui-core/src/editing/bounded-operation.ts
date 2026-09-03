/**
 * Finite wrappers for host-owned async operations.
 * A timeout wins the returned result, while both late promise continuations remain observed.
 */
export type BoundedEditingOperationResult<T> =
  | { readonly kind: 'fulfilled'; readonly value: T }
  | { readonly kind: 'rejected'; readonly error: unknown }
  | { readonly kind: 'timeout' }

export const DEFAULT_EDITING_COMMIT_TIMEOUT_MS = 15_000

export function normalizeEditingTimeout(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_EDITING_COMMIT_TIMEOUT_MS
}

/** Resolves exactly once, without turning a late rejection into an unhandled rejection. */
export function runBoundedEditingOperation<T>(
  launch: () => Promise<T>,
  timeoutMs: number,
): Promise<BoundedEditingOperationResult<T>> {
  return new Promise((resolve) => {
    let active = true
    const finish = (result: BoundedEditingOperationResult<T>): void => {
      if (!active) return
      active = false
      clearTimeout(timer)
      resolve(Object.freeze(result))
    }
    const timer = setTimeout(() => finish({ kind: 'timeout' }), timeoutMs)

    let pending: Promise<T>
    try {
      pending = Promise.resolve(launch())
    } catch (error) {
      finish({ kind: 'rejected', error })
      return
    }
    pending.then(
      (value) => finish({ kind: 'fulfilled', value }),
      (error) => finish({ kind: 'rejected', error }),
    )
  })
}

export function editingErrorMessage(error: unknown): string {
  // Error-like values may expose throwing accessors or coercion hooks.
  try {
    if (error instanceof Error) {
      const message = error.message
      if (typeof message === 'string') return message
    }
  } catch {
    // Fall through to guarded coercion.
  }
  try {
    return String(error)
  } catch {
    return 'Unknown editing transport failure.'
  }
}
