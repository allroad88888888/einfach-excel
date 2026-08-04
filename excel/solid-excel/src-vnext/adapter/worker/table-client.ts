// 一句话：Table 相关 worker 方法的能力绑定与结果映射。

import type {
  SpreadsheetTableDescriptor,
  TableMutationRejectedResult,
  TableMutationRejectionCode,
} from '@einfach/spreadsheet-ui-core'
import type { TableJSONWire, WorkerWorkbookClient } from '../worker-protocol'
import { createBackendError } from './backend-error'
import type { WorkerBackendState } from './state'

export const TABLE_REJECTION_CODES = new Set<TableMutationRejectionCode>([
  'too-many-tables',
  'invalid-name',
  'reserved-name',
  'name-like-cell-ref',
  'name-conflict',
  'range-overlap',
  'sheet-not-found',
  'not-found',
  'column-not-found',
  'duplicate-column',
  'invalid-column-name',
  'mutation-during-custom-call',
  'totals-row-blocked',
  'no-totals-row',
  'invalid-totals-function',
])

export function normalizeTableRejectionCode(code: unknown): TableMutationRejectionCode {
  return typeof code === 'string' && TABLE_REJECTION_CODES.has(code as TableMutationRejectionCode)
    ? (code as TableMutationRejectionCode)
    : 'invalid-payload'
}

export type TableClientMethod =
  | 'createTable'
  | 'renameTable'
  | 'renameTableColumn'
  | 'deleteTable'
  | 'listTables'
  | 'getTable'
  | 'setTableTotalsRow'
  | 'setTableTotalFunction'
  | 'snapshotTables'
  | 'restoreTables'

export function requireTableClient<K extends TableClientMethod>(
  state: WorkerBackendState,
  method: K,
): NonNullable<WorkerWorkbookClient[K]> {
  const fn = state.client[method]
  if (typeof fn !== 'function') {
    throw createBackendError('UNSUPPORTED', `worker runtime does not implement ${method}`)
  }
  return fn.bind(state.client) as NonNullable<WorkerWorkbookClient[K]>
}

/**
 * Bind a filter snapshot/restore client method or throw UNSUPPORTED. A
 * `filtersSnapshot` record is only ever created when `snapshotFilters` was
 * available on the same client (engineHiddenState), so on replay
 * `restoreFilters` is available too; the guard keeps the type honest and
 * fails closed rather than silently dropping the filter restore.
 */
export function requireFilterClient<K extends 'snapshotFilters' | 'restoreFilters'>(
  state: WorkerBackendState,
  method: K,
): NonNullable<WorkerWorkbookClient[K]> {
  const fn = state.client[method]
  if (typeof fn !== 'function') {
    throw createBackendError('UNSUPPORTED', `worker runtime does not implement ${method}`)
  }
  return fn.bind(state.client) as NonNullable<WorkerWorkbookClient[K]>
}

export function toTableDescriptor(
  state: WorkerBackendState,
  wire: TableJSONWire,
): SpreadsheetTableDescriptor {
  const sheet = state.lookup.sheets.find((entry) => entry.idx === wire.sheetIndex)
  return {
    name: wire.name,
    sheetId: sheet?.id ?? '',
    sheetName: wire.sheet,
    sheetIndex: wire.sheetIndex,
    range: wire.range,
    hasHeaders: wire.hasHeaders,
    hasTotals: wire.hasTotals,
    columns: wire.columns,
  }
}

export function tableRejectionFromError(
  state: WorkerBackendState,
  request: { requestId?: number; revision?: number | string },
  error: unknown,
): TableMutationRejectedResult | null {
  const err = error as Error & { code?: string; detail?: unknown }
  if (err?.code !== 'TABLE_REJECTED') return null
  const detail = (err.detail ?? {}) as { code?: unknown; message?: unknown }
  return {
    kind: 'table-mutation-not-applied',
    applied: false,
    code: normalizeTableRejectionCode(detail.code),
    message: typeof detail.message === 'string' ? detail.message : err.message,
    requestId: request.requestId,
    // A rejected mutation never bumps: echo the current (un-bumped) witness.
    revision: request.revision ?? state.revision,
  }
}
