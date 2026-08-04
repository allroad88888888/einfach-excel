// 一句话：把 state 装配成一次窗口/区域投影结果。

import type {
  DisplayCell,
  RangeProjectionResult,
  VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { DEFAULT_WORKBOOK_LOCALE, cloneFormat, keyFor } from '@einfach/spreadsheet-ui-core'
import type { EvalCellLookup } from '../static-formula-eval'
import type { StaticProjectionRequest, StaticProjectionResult } from '../types'
import { compareCells, isCellInsideRange } from './cell-map'
import { getConditionalFormatForCell } from './conditional-format'
import { evalHiddenRowsForSheet, filterHiddenRowsForSheet } from './hidden-rows'
import { applyMergeMetadata } from './merge-overlay'
import { addFormatOnlyCells, projectSourceCell } from './projection-cell'
import type { StaticBackendState } from './state'
import { getOrCreateCellFormats, getOrCreateRangeFormats, getOrCreateSheetCells } from './state'
import { makeStructuredRefResolver } from './tables/structured-ref'

export function buildProjectionResult(
  request: StaticProjectionRequest,
  state: StaticBackendState,
): StaticProjectionResult {
  const range = request.kind === 'visible-window' ? request.window : request.range
  const resultCellMap = new Map<string, DisplayCell>()
  const sheetCells = getOrCreateSheetCells(state, request.sheetId)
  const cellFormats = getOrCreateCellFormats(state, request.sheetId)
  const rangeFormats = getOrCreateRangeFormats(state, request.sheetId)
  const conditionalRules = state.conditionalFormatRulesBySheetId.get(request.sheetId) ?? []
  const workbookLocale = state.workbookLocale ?? DEFAULT_WORKBOOK_LOCALE

  const filterHiddenRows = filterHiddenRowsForSheet(state, request.sheetId)
  const lookup: EvalCellLookup = {
    get(row: number, col: number) {
      return sheetCells.get(keyFor(row, col))
    },
    resolveStructuredRef: makeStructuredRefResolver(state, request.sheetId),
    hiddenRows: evalHiddenRowsForSheet(state, request.sheetId),
    filterHiddenRows,
  }

  // Excel hidden-row semantics: display row IS source row. A filter no longer
  // compacts survivors into consecutive slots; it withholds the hidden rows and
  // leaves every other row at its own index, which is what makes the row header
  // skip (1, 4, 5) and what removed the second coordinate system the retired
  // per-cell source-row echo existed to translate between.
  for (const cell of sheetCells.values()) {
    if (!isCellInsideRange(cell, range)) continue
    if (filterHiddenRows?.has(cell.row)) continue
    const clone = projectSourceCell(cell, {
      displayRow: cell.row,
      displayCol: cell.col,
      lookup,
      cellFormats,
      rangeFormats,
      workbookLocale,
    })
    resultCellMap.set(keyFor(clone.row, clone.col), clone)
  }

  addFormatOnlyCells(resultCellMap, range, cellFormats, rangeFormats, filterHiddenRows)
  for (const [cellKey, cell] of resultCellMap) {
    const conditionalFormat = getConditionalFormatForCell(
      cell.row,
      cell.col,
      cell,
      conditionalRules,
    )
    if (conditionalFormat) {
      resultCellMap.set(cellKey, {
        ...cell,
        conditionalFormat: {
          ...(cell.conditionalFormat ? cloneFormat(cell.conditionalFormat) : {}),
          ...conditionalFormat,
        },
      })
    }
  }
  // #04 x #29: merge metadata used to be suppressed WHOLESALE under an active
  // filter, because merge coordinates are source facts and the projection emitted
  // a permuted row space — a span drawn across non-adjacent surviving rows was a
  // lie, so the honest answer was to draw nothing. Identity mapping removes the
  // permutation, so the suppression goes with it and merged cells stay visible
  // inside a filtered region, as Excel draws them.
  applyMergeMetadata(resultCellMap, range, state.mergeRangesBySheetId.get(request.sheetId) ?? [])
  const resultCells = [...resultCellMap.values()].sort(compareCells)

  if (request.kind === 'visible-window') {
    const result: VisibleProjectionResult = {
      kind: 'visible-window',
      sheetId: request.sheetId,
      requestId: request.requestId,
      revision: request.revision ?? state.revision,
      window: {
        rowStart: range.rowStart,
        rowEnd: range.rowEnd,
        colStart: range.colStart,
        colEnd: range.colEnd,
      },
      cells: resultCells,
    }
    return result
  }

  const result: RangeProjectionResult = {
    kind: 'range',
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision: request.revision ?? state.revision,
    range: {
      rowStart: range.rowStart,
      rowEnd: range.rowEnd,
      colStart: range.colStart,
      colEnd: range.colEnd,
    },
    cells: resultCells,
  }
  return result
}
