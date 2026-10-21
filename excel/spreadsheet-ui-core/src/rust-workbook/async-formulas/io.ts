import { FETCH_JSON_LIMITS, fetchJsonFormula } from './fetch-json'
import type { PendingAsyncFormulaCall, WasmAsyncFormulaQueries } from './commands'
import { validateCustomFormulaDefinitions } from '../../custom-formulas/expression-types'

export interface AsyncFormulaIo {
  drain(): void
  awaitSettlement(): Promise<{ readonly settled: boolean }>
  dispose(): void
}

/** Runs only the native queue's I/O; all formula facts and result memoization remain in Rust. */
export function createAsyncFormulaIo(
  workbook: WasmAsyncFormulaQueries,
  origin: string,
  settled: () => void,
  fetcher: typeof fetch = fetch,
): AsyncFormulaIo {
  if (!workbook.registerCustomFormulaAsync || !workbook.drainAsyncCustomRequests ||
    !workbook.resolveAsyncCustomCall || !workbook.read_custom_formulas)
    throw new Error('Rust async custom formulas are unavailable.')
  // Files restore data-only definitions before trusted host extensions are installed.
  // Refuse a conflicting definition rather than silently changing its meaning.
  const definitions = validateCustomFormulaDefinitions(JSON.parse(workbook.read_custom_formulas()))
  if (definitions.some(definition => definition.name === 'FETCHJSON'))
    throw new Error('The custom formula name is already in use.')
  workbook.registerCustomFormulaAsync('FETCHJSON')
  const running = new Map<number, AbortController>()
  const queue: PendingAsyncFormulaCall[] = []
  const queuedIds = new Set<number>()
  let disposed = false
  let failure: Error | undefined
  let unobservedSettlement = false
  let waiter: {
    resolve(result: { settled: boolean }): void; reject(error: Error): void
  } | undefined

  function stop(): void {
    disposed = true
    queue.length = 0
    queuedIds.clear()
    for (const controller of running.values()) controller.abort()
    running.clear()
  }

  function fail(error: unknown): void {
    failure ??= error instanceof Error ? error : new Error(String(error))
    stop()
    waiter?.reject(failure)
    waiter = undefined
  }

  function publishSettlement(): void {
    settled()
    if (waiter) {
      const pending = waiter
      waiter = undefined
      pending.resolve({ settled: true })
    } else unobservedSettlement = true
  }

  function start(call: PendingAsyncFormulaCall): void {
    const controller = new AbortController()
    running.set(call.callId, controller)
    const timeout = setTimeout(() => controller.abort(), FETCH_JSON_LIMITS.timeoutMs)
    const result = call.name.toUpperCase() === 'FETCHJSON'
      ? fetchJsonFormula(call.args, origin, controller.signal, fetcher)
      : Promise.resolve({ error: '#VALUE!' } as const)
    void result.then(value => {
      // Workbook replacement disposes this owner before free(); no late callback may enter WASM.
      const outcome = typeof value === 'object' && value !== null && !Array.isArray(value) && 'error' in value
        ? value : { json: value }
      if (!disposed && workbook.resolveAsyncCustomCall!(call.callId, outcome)) publishSettlement()
    }).finally(() => {
      // Early HTTP/metadata failures may leave an unread response body.
      // Terminate this request before releasing its bounded I/O slot.
      controller.abort()
      clearTimeout(timeout)
      running.delete(call.callId)
      if (!disposed) {
        drain()
        pump()
      }
    }).catch(fail)
  }

  function pump(): void {
    while (!disposed && running.size < FETCH_JSON_LIMITS.concurrent && queue.length) {
      const call = queue.shift()!
      queuedIds.delete(call.callId)
      start(call)
    }
  }

  function drain(): void {
    if (disposed) return
    try {
      for (const call of workbook.drainAsyncCustomRequests!()) {
        if (!Number.isSafeInteger(call.callId) || call.callId < 1 ||
          typeof call.name !== 'string' || !Array.isArray(call.args))
          throw new Error('Rust returned an invalid async formula request.')
        if (running.has(call.callId) || queuedIds.has(call.callId)) continue
        // The native memo remains authoritative; excess I/O is a retryable explicit error.
        if (queue.length >= FETCH_JSON_LIMITS.queued) {
          if (workbook.resolveAsyncCustomCall!(call.callId, { error: '#VALUE!' })) publishSettlement()
          continue
        }
        queue.push(call)
        queuedIds.add(call.callId)
      }
      pump()
    } catch (error) {
      fail(error)
      throw error
    }
  }

  return {
    drain,
    awaitSettlement() {
      if (failure) return Promise.reject(failure)
      if (disposed) return Promise.resolve({ settled: false })
      if (waiter) return Promise.reject(new Error('An async formula settlement wait is already pending.'))
      if (unobservedSettlement) {
        unobservedSettlement = false
        return Promise.resolve({ settled: true })
      }
      return new Promise((resolve, reject) => { waiter = { resolve, reject } })
    },
    dispose() {
      if (disposed) return
      stop()
      waiter?.resolve({ settled: false })
      waiter = undefined
    },
  }
}
