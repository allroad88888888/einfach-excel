// 一句话：静态后端的拖拽复制填充（fillRange）实现。

import type {
  CellRange,
  DisplayCell,
  FillRangeRequest,
  ProjectionRevision,
  SpreadsheetCellFormat,
} from '@einfach/spreadsheet-ui-core'
import {
  cloneCell,
  cloneFormat,
  cloneRange,
  getEffectiveFormat,
  getFillHandleSourceCoord,
  getFillHandleWriteRange,
  keyFor,
  shiftFormulaRefs,
} from '@einfach/spreadsheet-ui-core'
import { assertAutoFillWithinCellBudget } from './auto-fill-budget'
import { isCellInsideRange } from './cell-map'
import {
  recordCellBefore,
  recordCellFormatBefore,
  recordCellFormatsBeforeInRange,
  recordRangeFormatsBefore,
} from './history-record'
import { clearRangeFormats } from './range-clear'
import { nextRevisionOrThrow } from './revision'
import type { StaticBackendState } from './state'
import { getOrCreateCellFormats, getOrCreateRangeFormats, getOrCreateSheetCells } from './state'

interface StaticFillRangeCellPlan {
  readonly row: number
  readonly col: number
  readonly key: string
  readonly cell: DisplayCell | null
  readonly format?: SpreadsheetCellFormat
}

type StaticFillRangePlan =
  | { readonly status: 'noop' }
  | {
      readonly status: 'ready'
      readonly writeRange: CellRange
      readonly cells: readonly StaticFillRangeCellPlan[]
      readonly nextRevision: ProjectionRevision
    }

export function preflightFillRange(
  state: StaticBackendState,
  request: FillRangeRequest,
): StaticFillRangePlan {
  if (request.revision !== undefined && request.revision !== state.revision) {
    throw new Error(
      `fill range revision conflict: expected ${String(request.revision)}, current ${String(
        state.revision,
      )}`,
    )
  }
  assertAutoFillWithinCellBudget(request.targetRange)

  const writeRange = getFillHandleWriteRange(
    request.sourceRange,
    request.targetRange,
    request.direction,
  )
  if (writeRange === null) {
    return { status: 'noop' }
  }

  const nextRevision = nextRevisionOrThrow(state.revision)
  const sheetCells = state.cellsBySheet.get(request.sheetId) ?? new Map<string, DisplayCell>()
  const cellFormats =
    state.cellFormatsBySheetId.get(request.sheetId) ?? new Map<string, SpreadsheetCellFormat>()
  const rangeFormats = state.rangeFormatsBySheetId.get(request.sheetId) ?? []
  const sourceCells = new Map<string, DisplayCell>()
  for (const cell of sheetCells.values()) {
    if (isCellInsideRange(cell, request.sourceRange)) {
      sourceCells.set(keyFor(cell.row, cell.col), cloneCell(cell))
    }
  }

  const cells: StaticFillRangeCellPlan[] = []
  for (let row = writeRange.rowStart; row <= writeRange.rowEnd; row += 1) {
    for (let col = writeRange.colStart; col <= writeRange.colEnd; col += 1) {
      const sourceCoord = getFillHandleSourceCoord(request.sourceRange, { row, col })
      const sourceCell = sourceCells.get(keyFor(sourceCoord.row, sourceCoord.col))
      const key = keyFor(row, col)
      let cell: DisplayCell | null = null
      if (sourceCell) {
        cell = cloneCell(sourceCell)
        if (cell.formula) {
          cell.formula = shiftFormulaRefs(
            cell.formula,
            row - sourceCoord.row,
            col - sourceCoord.col,
          )
        }
        cell.row = row
        cell.col = col
      }

      const format = getEffectiveFormat(sourceCoord.row, sourceCoord.col, cellFormats, rangeFormats)
      cells.push({ row, col, key, cell, ...(format ? { format } : {}) })
    }
  }

  // Excel parity (was an SCC-based dependency-cycle rejection): a fill
  // whose formulas would close a dependency cycle now ALWAYS lands. Each
  // written formula cell is evaluated exactly like any other stored
  // formula — `evaluateFormula`'s own runtime `stack` cycle guard
  // (`static-formula-eval.ts`) returns '#CYCLE!' for whichever cell(s)
  // close the loop when the projection is next read; every other written
  // cell in the same batch computes normally.

  return {
    status: 'ready',
    writeRange: cloneRange(writeRange),
    cells,
    nextRevision,
  }
}

export function applyFillRangePlan(
  state: StaticBackendState,
  request: FillRangeRequest,
  plan: Extract<StaticFillRangePlan, { status: 'ready' }>,
): void {
  const sheetCells = getOrCreateSheetCells(state, request.sheetId)
  const cellFormats = getOrCreateCellFormats(state, request.sheetId)
  const rangeFormats = getOrCreateRangeFormats(state, request.sheetId)

  recordCellFormatsBeforeInRange(state, request.sheetId, plan.writeRange)
  recordRangeFormatsBefore(state, request.sheetId)
  clearRangeFormats(cellFormats, rangeFormats, plan.writeRange)

  for (const cellPlan of plan.cells) {
    recordCellBefore(state, request.sheetId, cellPlan.key)
    recordCellFormatBefore(state, request.sheetId, cellPlan.key)
    if (cellPlan.cell) {
      sheetCells.set(cellPlan.key, cloneCell(cellPlan.cell))
    } else {
      sheetCells.delete(cellPlan.key)
    }
    if (cellPlan.format) {
      cellFormats.set(cellPlan.key, cloneFormat(cellPlan.format))
    } else {
      cellFormats.delete(cellPlan.key)
    }
  }
}
