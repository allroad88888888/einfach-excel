// 一句话：静态后端的物理排序（sortRange）实现。

import type {
  CellRange,
  ProjectionRevision,
  SortRangeRejectionCode,
  SortRangeRequest,
  SortRangeResult,
} from '@einfach/spreadsheet-ui-core'
import { cloneRange, keyFor, normalizeRange, rangesIntersect } from '@einfach/spreadsheet-ui-core'
import { MAX_SORT_SOURCE_CELLS, planPhysicalSort } from '../sort-order'
import type { EvalCellLookup } from '../static-formula-eval'
import { evalHiddenRowsForSheet, filterHiddenRowsForSheet } from './hidden-rows'
import { beginUndoableMutation, recordFullSheetBefore } from './history-record'
import { bumpRevision } from './revision'
import { materializeAndCutSortFormatLayers } from './sort-format-layers'
import { relocateSortedCells } from './sort-relocate'
import { cellToSortValue, toResolvedSortKeys } from './sort-value'
import type { StaticBackendState } from './state'
import { getOrCreateCellFormats, getOrCreateRangeFormats, getOrCreateSheetCells } from './state'
import { makeStructuredRefResolver } from './tables/structured-ref'

// === Engine physical sort (design-engine-sort §3-§6, parity #29) ============
//
// The static backend is an in-memory reference engine, so it implements the
// `sortRange` port by PHYSICALLY reordering its cells (values / formula text
// verbatim, per-cell formats riding along) through the shared comparator in
// `sort-order.ts` — the exact TS mirror of the Rust `sort_cmp` / slot machine.
// Structured rejections and the applied ACK match the worker adapter so the
// two backends are interchangeable behind the same UI-core command.

const SORT_EXCEL_MAX_ROWS = 1_048_576
const SORT_EXCEL_MAX_COLS = 16_384

function isMalformedSortRange(range: CellRange | undefined): boolean {
  return (
    !range ||
    typeof range !== 'object' ||
    !Number.isInteger(range.rowStart) ||
    !Number.isInteger(range.rowEnd) ||
    !Number.isInteger(range.colStart) ||
    !Number.isInteger(range.colEnd)
  )
}

function sortRejectedResult(
  request: SortRangeRequest,
  revision: ProjectionRevision,
  code: SortRangeRejectionCode,
  message: string,
): SortRangeResult {
  return {
    kind: 'sort-range-not-applied',
    sheetId: request.sheetId,
    applied: false,
    code,
    message,
    requestId: request.requestId,
    // A rejected sort never bumps: echo the current (un-bumped) witness.
    revision: request.revision ?? revision,
  }
}

/**
 * Static reference implementation of the engine physical sort. Runs the same
 * gate order as the worker adapter (payload → source-size → key-in-range →
 * merge authority), reorders the cells through the shared slot algorithm, and
 * records ONE backend-side undo entry (range cells + formats) so the sort is
 * reversible exactly like the worker path (design §7).
 */
export function applyStaticSortRange(
  state: StaticBackendState,
  request: SortRangeRequest,
): SortRangeResult {
  const revisionBefore = state.revision

  if (isMalformedSortRange(request.range)) {
    return sortRejectedResult(
      request,
      revisionBefore,
      'invalid-payload',
      'the sort request is missing a valid range',
    )
  }
  if (!Array.isArray(request.keys) || request.keys.length === 0) {
    return sortRejectedResult(request, revisionBefore, 'empty-keys', 'no sort key was provided')
  }

  const range = normalizeRange(request.range)
  if (
    range.rowStart < 0 ||
    range.colStart < 0 ||
    range.rowEnd >= SORT_EXCEL_MAX_ROWS ||
    range.colEnd >= SORT_EXCEL_MAX_COLS
  ) {
    return sortRejectedResult(request, revisionBefore, 'invalid-range', 'the sort range is invalid')
  }

  const rangeArea = (range.rowEnd - range.rowStart + 1) * (range.colEnd - range.colStart + 1)
  if (rangeArea > MAX_SORT_SOURCE_CELLS) {
    return sortRejectedResult(
      request,
      revisionBefore,
      'source-too-large',
      `sort range spans ${rangeArea} cells but the cap is ${MAX_SORT_SOURCE_CELLS}`,
    )
  }

  if (request.keys.some((key) => key.col < range.colStart || key.col > range.colEnd)) {
    return sortRejectedResult(
      request,
      revisionBefore,
      'key-out-of-range',
      'a sort key column is outside the sorted range',
    )
  }

  // Merge authority gate (design §5.2): the engine models no merge, so the
  // adapter — sole holder of the registry — rejects a sort touching a merge.
  const merges = state.mergeRangesBySheetId.get(request.sheetId) ?? []
  if (merges.some((merge) => rangesIntersect(merge, range))) {
    return sortRejectedResult(
      request,
      revisionBefore,
      'merge-in-range',
      'the sort range intersects a merged range; unmerge before sorting',
    )
  }
  // Spill gate (design §5.1): the static engine models no dynamic-array spill,
  // so there is nothing to intersect. TODO: add a spill gate here if the static
  // backend ever grows a spill model.

  const sheetCells = getOrCreateSheetCells(state, request.sheetId)
  const lookup: EvalCellLookup = {
    get(row, col) {
      return sheetCells.get(keyFor(row, col))
    },
    resolveStructuredRef: makeStructuredRefResolver(state, request.sheetId),
    hiddenRows: evalHiddenRowsForSheet(state, request.sheetId),
    filterHiddenRows: filterHiddenRowsForSheet(state, request.sheetId),
  }
  const keys = toResolvedSortKeys(request.keys)
  const plan = planPhysicalSort(
    range.rowStart,
    range.rowEnd,
    request.excludedRows ?? [],
    keys,
    (row, col) => cellToSortValue(sheetCells.get(keyFor(row, col)), lookup),
  )

  // No-op sort (identity permutation): resolves applied with movedRows 0, writes
  // nothing, records no undo entry, and does NOT bump the revision (design §7).
  if (plan.rowMap.size === 0) {
    return {
      kind: 'sort-range',
      sheetId: request.sheetId,
      applied: true,
      movedRows: 0,
      movedCells: 0,
      affectedRange: cloneRange(range),
      rowPermutation: [],
      requestId: request.requestId,
      revision: request.revision ?? revisionBefore,
    }
  }

  // A physical sort permutes the range's occupied/blank footprint (blanks and
  // non-blanks swap rows), so a granular before-image scoped to pre-existing
  // cells cannot clear positions that GAIN content on undo. Use the labeled
  // O(one-sheet) capture — the same fallback static's structural ops
  // (insert/delete rows, removeRows) use for whole-sheet rewrites.
  beginUndoableMutation(state)
  recordFullSheetBefore(state, request.sheetId)

  const cellFormats = getOrCreateCellFormats(state, request.sheetId)
  const rangeFormats = getOrCreateRangeFormats(state, request.sheetId)
  materializeAndCutSortFormatLayers(cellFormats, rangeFormats, range)
  const movedCells = relocateSortedCells(sheetCells, cellFormats, range, plan.rowMap)
  state.revision = bumpRevision(state.revision)

  return {
    kind: 'sort-range',
    sheetId: request.sheetId,
    applied: true,
    movedRows: plan.rowPermutation.length,
    movedCells,
    affectedRange: cloneRange(range),
    rowPermutation: plan.rowPermutation,
    requestId: request.requestId,
    revision: request.revision ?? state.revision,
  }
}
