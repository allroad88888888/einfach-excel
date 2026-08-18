import { FILTER_SORT_DEFAULT_TIMEOUT_MS, FILTER_SORT_OUTCOME_UNKNOWN_ERROR } from './constants'
import type { BoundedOperationResult } from './internal-types'

export function snapshotTimeoutMs(value: unknown): number | null {
  return value === undefined
    ? FILTER_SORT_DEFAULT_TIMEOUT_MS
    : typeof value === 'number' && Number.isFinite(value) && value > 0
      ? value
      : null
}

export function runBoundedOperation<T>(
  launch: () => Promise<T>,
  timeoutMs: number,
): Promise<BoundedOperationResult<T>> {
  return new Promise((resolve) => {
    let active = true
    const finish = (result: BoundedOperationResult<T>): void => {
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

export function errorMessage(error: unknown): string {
  try {
    if (error instanceof Error && typeof error.message === 'string') return error.message
  } catch {}
  try {
    return String(error)
  } catch {
    return 'Unknown filter and sort transport failure.'
  }
}

export const outcomeUnknownError = (detail: string): string =>
  `${FILTER_SORT_OUTCOME_UNKNOWN_ERROR} ${detail}`

export const refreshFailureError = (error: unknown): string =>
  `Filter and sort was acknowledged, but refresh failed: ${errorMessage(error)}`
