import type { AtomSetResult, AtomSetParameters } from '@einfach/core'
import type {
  WorkerWorkbookSpreadsheetBackend,
  WorkerWorkbookSpreadsheetBackendOptions,
} from '@einfach/solid-excel/vnext'
import { defaultVNextWorkbookWorkerFactory } from '@einfach/solid-excel/vnext-worker-factory'
import { makeWasmWorkerBackend } from '../../spreadsheet/backends'
import {
  projectionWindowLabel,
  type PerformanceMetricsAtom,
} from './performance-metrics'
import { createCountingWorkerFactory } from './worker-message-counter'

type SetPerformanceMetrics = (
  ...args: AtomSetParameters<PerformanceMetricsAtom>
) => AtomSetResult<PerformanceMetricsAtom>

interface MeasuredWorkerBackendOptions extends WorkerWorkbookSpreadsheetBackendOptions {
  setMetrics: SetPerformanceMetrics
}

/** Adds site-owned transport timing to the real worker/WASM backend. */
export function makeMeasuredWasmWorkerBackend(
  options: MeasuredWorkerBackendOptions,
): WorkerWorkbookSpreadsheetBackend {
  const { setMetrics, ...backendOptions } = options
  const workerFactory = createCountingWorkerFactory(defaultVNextWorkbookWorkerFactory, {
    sent: () =>
      setMetrics((metrics) => ({
        ...metrics,
        outboundMessages: metrics.outboundMessages + 1,
      })),
    received: () =>
      setMetrics((metrics) => ({
        ...metrics,
        inboundMessages: metrics.inboundMessages + 1,
      })),
  })
  const backend = makeWasmWorkerBackend({ ...backendOptions, workerFactory })
  const readVisibleProjection = backend.readVisibleProjection.bind(backend)

  backend.readVisibleProjection = async (request) => {
    setMetrics((metrics) => ({
      ...metrics,
      projectionWindow: projectionWindowLabel(request),
      outboundMessages: 0,
      inboundMessages: 0,
      projectionDurationMs: null,
    }))
    const startedAt = performance.now()
    const result = await readVisibleProjection(request)
    setMetrics((metrics) => ({
      ...metrics,
      projectionDurationMs: performance.now() - startedAt,
    }))
    return result
  }

  return backend
}
