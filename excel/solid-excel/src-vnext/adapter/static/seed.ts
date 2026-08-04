// 一句话：把种子输入规范成一份初始 StaticBackendState。

import { excelGeneralToText } from '@einfach/excel-core-ts'
import type {
  DisplayCell,
  ProjectionRevision,
  SpreadsheetCellFormat,
  SpreadsheetSheetMetadata,
} from '@einfach/spreadsheet-ui-core'
import { cloneCell, keyFor, normalizeFormat } from '@einfach/spreadsheet-ui-core'
import type {
  StaticSeedCells,
  StaticSeedMatrix,
  StaticSeedValue,
  StaticSpreadsheetSeedInput,
  StaticSpreadsheetSheetInput,
} from '../types'
import { compareCells } from './cell-map'
import { isObject } from './guards'
import { extractMergeRanges } from './merge-overlay'
import { normalizeStaticSheets } from './sheet-metadata'
import type { StaticBackendState } from './state'

function isSeedCell(value: unknown): value is DisplayCell {
  return (
    isObject(value) &&
    typeof value.row === 'number' &&
    typeof value.col === 'number' &&
    typeof value.displayValue === 'string'
  )
}

function stripCellFormat(cell: DisplayCell): DisplayCell {
  const clone = cloneCell(cell)
  delete clone.format
  delete clone.mergedSpan
  delete clone.mergeAnchor
  return clone
}

function valueToDisplayCell(row: number, col: number, value: StaticSeedValue): DisplayCell | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    return { row, col, displayValue: value, valueKind: 'string' }
  }
  if (typeof value === 'number') {
    return {
      row,
      col,
      // 与两个真引擎共用同一份 Excel General 规格（15 位有效数字、大数/小数各自的
      // 科学计数门槛）。此前这里是 `String(value)` —— 于是 `=5/3` 在 worker
      // runtime 上显示 `1.66666666666667`、在这个静态参考后端上显示
      // `1.6666666666666667`，而 `vnext-worker-paste-special.test.ts` 的
      // `expectParity` 比的正是两者，当场红。
      displayValue: excelGeneralToText(value),
      valueKind: 'number',
    }
  }
  if (typeof value === 'boolean') {
    return { row, col, displayValue: value ? 'TRUE' : 'FALSE', valueKind: 'boolean' }
  }
  return null
}

export function matrixToCells(matrix: StaticSeedMatrix): DisplayCell[] {
  const cells: DisplayCell[] = []

  matrix.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      const cell = valueToDisplayCell(rowIndex, colIndex, value)
      if (cell) cells.push(cell)
    })
  })

  return cells
}

export function sparseCellsToCells(cells: StaticSeedCells): DisplayCell[] {
  return cells.filter(isSeedCell).map(cloneCell).sort(compareCells)
}

export function buildState(
  cells: DisplayCell[],
  revision: ProjectionRevision,
  sheets: SpreadsheetSheetMetadata[] = normalizeStaticSheets(),
): StaticBackendState {
  const defaultSheetId = sheets[0]?.id ?? 'sheet-1'
  const cellMap = new Map<string, DisplayCell>()
  const cellFormats = new Map<string, SpreadsheetCellFormat>()
  const mergeRangesBySheetId = extractMergeRanges(cells, defaultSheetId)

  for (const cell of cells) {
    const key = keyFor(cell.row, cell.col)
    const format = normalizeFormat(cell.format)
    if (format) cellFormats.set(key, format)
    cellMap.set(key, stripCellFormat(cell))
  }

  const cellsBySheet = new Map<string, Map<string, DisplayCell>>()
  cellsBySheet.set(defaultSheetId, cellMap)
  const cellFormatsBySheetId = new Map<string, Map<string, SpreadsheetCellFormat>>()
  cellFormatsBySheetId.set(defaultSheetId, cellFormats)

  return {
    cellsBySheet,
    cellFormatsBySheetId,
    rangeFormatsBySheetId: new Map(),
    conditionalFormatRulesBySheetId: new Map(),
    filterSortBySheetId: new Map(),
    namedRanges: [],
    tablesByKey: new Map(),
    mergeRangesBySheetId,
    rowHeightsBySheetId: new Map(),
    colWidthsBySheetId: new Map(),
    hiddenRowsBySheetId: new Map(),
    hiddenColsBySheetId: new Map(),
    filterHiddenRowsBySheetId: new Map(),
    freezeBySheetId: new Map(sheets.map((sheet) => [sheet.id, { rows: 0, cols: 0 }])),
    sheets,
    revision,
    undoStack: [],
    redoStack: [],
    pendingDelta: null,
  }
}

export function normalizeSeed(input: StaticSpreadsheetSeedInput): StaticBackendState {
  if (Array.isArray(input)) {
    const cells =
      input.length > 0 && input.some((item) => Array.isArray(item))
        ? matrixToCells(input as StaticSeedMatrix)
        : sparseCellsToCells(input as StaticSeedCells)

    return buildState(cells, 0)
  }

  const seed = input as StaticSpreadsheetSeedInput & {
    cells?: StaticSeedCells
    matrix?: StaticSeedMatrix
    revision?: ProjectionRevision
    sheets?: readonly (string | StaticSpreadsheetSheetInput)[]
  }
  const cells = [
    ...(seed.matrix ? matrixToCells(seed.matrix) : []),
    ...(seed.cells ? sparseCellsToCells(seed.cells) : []),
  ]

  return buildState(cells, seed.revision ?? 0, normalizeStaticSheets(seed.sheets))
}
