// 一句话：合并/取消合并在宿主 overlay 上的落地。

import type {
  MergeRangeRequest,
  ToolbarBackendMutationResult,
  UnmergeRangeRequest,
} from '@einfach/spreadsheet-ui-core'
import { cloneRange, normalizeRange } from '@einfach/spreadsheet-ui-core'
import { rangesIntersect } from './range-overlap'
import { bumpRevision } from './revision'
import { pushTransactionRecord } from './transaction-log'
import type { WorkerWorkbookBackendSheet } from './types'
import type { WorkerBackendState } from './state'

/**
 * Parity #04 — shared core of the `mergeRange` / `unmergeRange` ports.
 * Excel semantics mirror the static backend exactly: both ops first
 * drop every merge intersecting the requested range; merge then adds
 * the normalized range back when it spans more than one cell (a 1x1
 * "merge" is meaningless). The transaction record carries before/after
 * images of the sheet's merge set — pure adapter memory, no engine RPC
 * — and the exact ACK echoes kind/requestId/affectedRange so the
 * UI-core strict validator can walk local-ack → refresh → ready.
 */
export function applyMergeOverlayMutation(
  state: WorkerBackendState,
  request: MergeRangeRequest | UnmergeRangeRequest,
  sheet: WorkerWorkbookBackendSheet,
): ToolbarBackendMutationResult {
  const range = normalizeRange(request.range)
  const current = state.mergeRangesBySheetId.get(request.sheetId) ?? []
  const before = current.map(cloneRange)
  const next = current.filter((candidate) => !rangesIntersect(candidate, range))
  if (
    request.kind === 'merge-range' &&
    (range.rowEnd > range.rowStart || range.colEnd > range.colStart)
  ) {
    next.push(cloneRange(range))
  }
  state.mergeRangesBySheetId.set(request.sheetId, next)
  pushTransactionRecord(state, {
    kind: request.kind === 'merge-range' ? 'range.merge' : 'range.unmerge',
    sheetIdx: sheet.idx,
    boundTransactionId: null,
    affectedRange: cloneRange(range),
    clearRange: null,
    before: null,
    after: null,
    mergeOverlay: {
      sheetId: request.sheetId,
      before,
      after: next.map(cloneRange),
    },
  })
  const nextRevision = bumpRevision(state)
  return {
    kind: request.kind,
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision: request.revision ?? nextRevision,
    affectedRange: cloneRange(range),
  }
}
