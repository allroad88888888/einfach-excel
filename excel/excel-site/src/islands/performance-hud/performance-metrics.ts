import { atom, type AtomEntity } from '@einfach/core'
import type { VisibleProjectionRequest } from '@einfach/solid-excel/vnext'

export interface PerformanceMetrics {
  projectionWindow: string
  totalRows: number
  outboundMessages: number
  inboundMessages: number
  projectionDurationMs: number | null
}

export type PerformanceMetricsAtom = AtomEntity<PerformanceMetrics>

/** Creates the isolated metrics state owned by one performance demo island. */
export function createPerformanceMetricsAtom(totalRows: number): PerformanceMetricsAtom {
  return atom({
    projectionWindow: 'Waiting for the first projection',
    totalRows,
    outboundMessages: 0,
    inboundMessages: 0,
    projectionDurationMs: null,
  })
}

export function projectionWindowLabel(request: VisibleProjectionRequest): string {
  const { colEnd, colStart, rowEnd, rowStart } = request.window
  return `rows ${rowStart + 1}–${rowEnd + 1} · columns ${colStart + 1}–${colEnd + 1}`
}
