// 一句话：静态后端的序列填充（fillSeries）实现。

import { excelGeneralToText } from '@einfach/excel-core-ts'
import type {
  CellRange,
  FillSeriesRequest,
  ProjectionRevision,
  SpreadsheetCellFormat,
} from '@einfach/spreadsheet-ui-core'
import {
  cloneFormat,
  cloneRange,
  getEffectiveFormat,
  getFillHandleSourceCoord,
  getFillHandleWriteRange,
  keyFor,
} from '@einfach/spreadsheet-ui-core'
import { assertAutoFillWithinCellBudget } from './auto-fill-budget'
import { createFillSeriesValueGenerator } from './fill-series-generator'
import {
  fillSeriesSourceRelativeIndex,
  getFillSeriesSourceCellCount,
  invalidFillSeries,
  isFillSeriesDirection,
  validateFillSeriesGeometry,
} from './fill-series-geometry'
import { getOrderedStaticFillSeriesSourceCells } from './fill-series-source'
import {
  beginUndoableMutation,
  recordCellBefore,
  recordCellFormatBefore,
  recordCellFormatsBeforeInRange,
  recordRangeFormatsBefore,
} from './history-record'
import { clearRangeFormats } from './range-clear'
import { bumpRevision } from './revision'
import type { StaticBackendState } from './state'
import { getOrCreateCellFormats, getOrCreateRangeFormats } from './state'

interface StaticFillSeriesCellPlan {
  readonly row: number
  readonly col: number
  readonly value: number | string
  readonly valueKind: 'number' | 'string'
  readonly format?: SpreadsheetCellFormat
}

type StaticFillSeriesPlan =
  | { readonly status: 'noop' }
  | {
      readonly status: 'ready'
      readonly writeRange: CellRange
      readonly cells: readonly StaticFillSeriesCellPlan[]
      readonly nextRevision: ProjectionRevision
    }

export function preflightFillSeries(
  state: StaticBackendState,
  request: FillSeriesRequest,
): StaticFillSeriesPlan {
  const runtimeRequest = request as { readonly kind?: unknown; readonly direction?: unknown }
  if (runtimeRequest.kind !== 'fill-series') {
    invalidFillSeries('request kind must be fill-series')
  }
  if (!isFillSeriesDirection(runtimeRequest.direction)) {
    invalidFillSeries('direction must be up, down, left, or right')
  }
  if (!state.sheets.some((sheet) => sheet.id === request.sheetId)) {
    invalidFillSeries(`unknown sheet: ${request.sheetId}`)
  }
  if (request.revision !== undefined && request.revision !== state.revision) {
    invalidFillSeries(
      `stale revision ${String(request.revision)}; current revision is ${String(state.revision)}`,
    )
  }
  validateFillSeriesGeometry(request)
  assertAutoFillWithinCellBudget(request.targetRange)

  if (typeof request.step !== 'number' || !Number.isFinite(request.step) || request.step === 0) {
    invalidFillSeries('step must be finite and non-zero')
  }
  const requestedStep = request.step
  const sourceCellCount = getFillSeriesSourceCellCount(request)
  const minimumSourceCellCount =
    request.series === 'linear-trend'
      ? 3
      : request.series === 'integer-step' || request.series === 'decimal-step'
        ? 2
        : 1
  if (sourceCellCount < minimumSourceCellCount) {
    invalidFillSeries(`${request.series} requires at least ${minimumSourceCellCount} source cells`)
  }

  const sheetCells = state.cellsBySheet.get(request.sheetId)
  if (!sheetCells) invalidFillSeries('source sheet has no canonical cell store')
  const cellFormats = state.cellFormatsBySheetId.get(request.sheetId) ?? new Map()
  const rangeFormats = state.rangeFormatsBySheetId.get(request.sheetId) ?? []
  const sourceCells = getOrderedStaticFillSeriesSourceCells(
    sheetCells,
    cellFormats,
    rangeFormats,
    request,
  )
  const generateValue = createFillSeriesValueGenerator(request, requestedStep, sourceCells)

  const writeRange = getFillHandleWriteRange(
    request.sourceRange,
    request.targetRange,
    request.direction,
  )
  if (writeRange === null) return { status: 'noop' }

  const cells: StaticFillSeriesCellPlan[] = []

  for (let row = writeRange.rowStart; row <= writeRange.rowEnd; row += 1) {
    for (let col = writeRange.colStart; col <= writeRange.colEnd; col += 1) {
      const generated = generateValue(fillSeriesSourceRelativeIndex(request, row, col))
      if (generated === null) {
        invalidFillSeries('generated series contains a non-finite value')
      }

      const sourceCoord = getFillHandleSourceCoord(request.sourceRange, { row, col })
      const format = getEffectiveFormat(sourceCoord.row, sourceCoord.col, cellFormats, rangeFormats)
      cells.push({
        row,
        col,
        value: generated.value,
        valueKind: generated.valueKind,
        ...(format ? { format: cloneFormat(format) } : {}),
      })
    }
  }

  const nextRevision = bumpRevision(state.revision)
  if (Object.is(nextRevision, state.revision)) {
    invalidFillSeries(`cannot advance projection revision ${String(state.revision)}`)
  }
  return { status: 'ready', writeRange: cloneRange(writeRange), cells, nextRevision }
}

export function applyFillSeriesPlan(
  state: StaticBackendState,
  sheetId: string,
  plan: Extract<StaticFillSeriesPlan, { status: 'ready' }>,
): void {
  beginUndoableMutation(state)
  const sheetCells = state.cellsBySheet.get(sheetId)!
  const cellFormats = getOrCreateCellFormats(state, sheetId)
  const rangeFormats = getOrCreateRangeFormats(state, sheetId)
  recordCellFormatsBeforeInRange(state, sheetId, plan.writeRange)
  recordRangeFormatsBefore(state, sheetId)
  clearRangeFormats(cellFormats, rangeFormats, plan.writeRange)
  for (const cellPlan of plan.cells) {
    const key = keyFor(cellPlan.row, cellPlan.col)
    recordCellBefore(state, sheetId, key)
    recordCellFormatBefore(state, sheetId, key)
    sheetCells.set(
      key,
      cellPlan.valueKind === 'number'
        ? {
            row: cellPlan.row,
            col: cellPlan.col,
            // 同上：显示走 Excel General 规格，`numericValue` 保留原始双精度。
            // 这是粘贴写入路径 —— `=5/3` 经「除」粘贴落地时也必须显示
            // `1.66666666666667`，否则与 worker runtime 差一个写入口。
            displayValue: excelGeneralToText(cellPlan.value as number),
            valueKind: 'number',
            numericValue: cellPlan.value as number,
          }
        : {
            row: cellPlan.row,
            col: cellPlan.col,
            displayValue: cellPlan.value as string,
            valueKind: 'string',
          },
    )
    if (cellPlan.format) {
      cellFormats.set(key, cloneFormat(cellPlan.format))
    } else {
      cellFormats.delete(key)
    }
  }
  state.revision = plan.nextRevision
}
