// 一句话：按行号列表删除行的计划与施加。

import type { CellRange, DisplayCell, ProjectionRevision } from '@einfach/spreadsheet-ui-core'
import { isFiniteNumber, isObject, isSafeInteger } from './guards'
import { shiftFilterHiddenRows, shiftHiddenIndexSet } from './hidden-rows'
import { beginUndoableMutation, recordFullSheetBefore } from './history-record'
import { nextRevisionOrThrow } from './revision'
import type { StaticBackendState } from './state'
import {
  getDimensionMap,
  getOrCreateCellFormats,
  getOrCreateRangeFormats,
  getOrCreateSheetCells,
} from './state'
import {
  shiftDimensionMap,
  shiftFreezeConfig,
  shiftMergeRanges,
  shiftRows,
} from './structural-shift'
import { applyTableShift } from './tables/geometry-shift'

interface StaticRowsRemovalMutation {
  readonly cells: Map<string, DisplayCell>
  readonly revision: ProjectionRevision
}

export function applyStaticRowsRemoval(
  state: StaticBackendState,
  sheetId: string,
  descendingRows: readonly number[],
  nextRevision: ProjectionRevision,
): StaticRowsRemovalMutation {
  const expectedRevision = nextRevisionOrThrow(state.revision)
  if (!Object.is(nextRevision, expectedRevision)) {
    throw new Error('static row removal revision plan is stale')
  }

  beginUndoableMutation(state)
  recordFullSheetBefore(state, sheetId)

  const cells = getOrCreateSheetCells(state, sheetId)
  const cellFormats = getOrCreateCellFormats(state, sheetId)
  const rangeFormats = getOrCreateRangeFormats(state, sheetId)
  const rowHeights = getDimensionMap(state.rowHeightsBySheetId, sheetId)
  const hiddenRows = state.hiddenRowsBySheetId.get(sheetId)

  // Each descending row is a single-row delete band. Applying the W3
  // delete-shift semantics (shiftMergeRanges / shiftFreezeConfig) once
  // per row, bottom-up, composes to exactly the same result as applying
  // one shift per contiguous band: indices below the current band are
  // untouched, so earlier (lower) bands keep their original coordinates.
  for (const rowIndex of descendingRows) {
    shiftRows(cells, cellFormats, rangeFormats, rowIndex, 1, -1)
    shiftDimensionMap(rowHeights, rowIndex, 1, -1)
    if (hiddenRows) shiftHiddenIndexSet(hiddenRows, rowIndex, 1, -1)
    shiftFilterHiddenRows(state, sheetId, rowIndex, 1, -1)
    shiftMergeRanges(state, sheetId, 'row', rowIndex, 1, -1)
    shiftFreezeConfig(state, sheetId, 'row', rowIndex, 1, -1)
    applyTableShift(state, sheetId, 'row', rowIndex, 1, -1)
  }
  if (hiddenRows?.size === 0) state.hiddenRowsBySheetId.delete(sheetId)

  state.revision = nextRevision
  return { cells, revision: nextRevision }
}

interface StaticRemoveRowsExactPlan {
  readonly requestId: number
  readonly sheetId: string
  readonly targetRange: CellRange
  readonly ascendingRows: number[]
  readonly descendingRows: number[]
  readonly nextRevision: number
}

function rejectStaticRemoveRowsExact(reason: string): never {
  throw Object.assign(new Error(`invalid removeRowsExact request: ${reason}`), {
    code: 'INVALID_REMOVE_ROWS_EXACT_REQUEST',
  })
}

export function planStaticRemoveRowsExact(
  state: StaticBackendState,
  request: unknown,
): StaticRemoveRowsExactPlan {
  if (!isObject(request)) rejectStaticRemoveRowsExact('request must be an object')
  if (request.kind !== 'remove-rows') {
    rejectStaticRemoveRowsExact('kind must be remove-rows')
  }
  if (!isSafeInteger(request.requestId) || request.requestId < 0) {
    rejectStaticRemoveRowsExact('requestId must be a non-negative safe integer')
  }
  if (typeof request.sheetId !== 'string' || request.sheetId.length === 0) {
    rejectStaticRemoveRowsExact('sheetId must be a non-empty string')
  }
  if (!state.sheets.some((sheet) => sheet.id === request.sheetId)) {
    rejectStaticRemoveRowsExact(`unknown sheet ${request.sheetId}`)
  }

  const range = request.targetRange
  if (!isObject(range)) rejectStaticRemoveRowsExact('targetRange must be an object')
  const { rowStart, rowEnd, colStart, colEnd } = range
  if (
    !isSafeInteger(rowStart) ||
    !isSafeInteger(rowEnd) ||
    !isSafeInteger(colStart) ||
    !isSafeInteger(colEnd) ||
    rowStart < 0 ||
    colStart < 0 ||
    rowStart > rowEnd ||
    colStart > colEnd
  ) {
    rejectStaticRemoveRowsExact('targetRange must contain ordered non-negative safe integers')
  }

  const rows = request.rows
  if (!Array.isArray(rows) || rows.length === 0) {
    rejectStaticRemoveRowsExact('rows must be a non-empty array')
  }
  const ascendingRows: number[] = []
  for (const row of rows) {
    if (
      !isSafeInteger(row) ||
      row < rowStart ||
      row > rowEnd ||
      (ascendingRows.length > 0 && ascendingRows[ascendingRows.length - 1] >= row)
    ) {
      rejectStaticRemoveRowsExact('rows must be canonical, strictly ascending, and in range')
    }
    ascendingRows.push(row)
  }

  const currentRevision = state.revision
  if (
    !isFiniteNumber(request.revision) ||
    !isFiniteNumber(currentRevision) ||
    request.revision !== currentRevision
  ) {
    rejectStaticRemoveRowsExact('revision must equal the current finite numeric revision')
  }
  const nextRevision = currentRevision + 1
  if (!Number.isFinite(nextRevision) || Object.is(nextRevision, currentRevision)) {
    rejectStaticRemoveRowsExact('current revision cannot advance to a distinct finite number')
  }

  return {
    requestId: request.requestId,
    sheetId: request.sheetId,
    targetRange: { rowStart, rowEnd, colStart, colEnd },
    ascendingRows,
    descendingRows: [...ascendingRows].reverse(),
    nextRevision,
  }
}
