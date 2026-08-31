import {
  anchorScalar,
  excelGeneralToText,
  formatA1,
  projectedValueAt,
  scanSpillAnchors,
  SPILL_PROJECTION_LOOKBACK,
  type Cell,
  type ErrorCode,
  type Value,
} from '@einfach/excel-core-ts'

import { errorDisplayToken } from '../error-display-token'
import type {
  CellSnapshotWire,
  CellWire,
  FormulaMutationResultWire,
  SparseCellWire,
  SpillRegionWire,
} from '../worker-protocol'
import { resolveSpillRegion, type SpillProbe } from '../worker-spill-region'
import { rpcError } from './runtime-errors'
import type { RuntimeState, SheetEntry } from './runtime-state'

function valueKindToCellType(value: Value): CellSnapshotWire['type'] {
  switch (value.kind) {
    case 'number':
      return 'number'
    case 'string':
      return 'text'
    case 'boolean':
      return 'boolean'
    case 'error':
      return 'error'
    case 'blank':
      return 'null'
    case 'array':
      return valueKindToCellType(anchorScalar(value))
  }
}

function valueDisplay(value: Value): string {
  switch (value.kind) {
    case 'number':
      return excelGeneralToText(value.value)
    case 'string':
      return value.value
    case 'boolean':
      return value.value ? 'TRUE' : 'FALSE'
    case 'error':
      return errorDisplayToken(value.code)
    case 'blank':
      return ''
    case 'array':
      return valueDisplay(anchorScalar(value))
  }
}

function spillAnchorCandidates(
  cells: ReadonlyMap<string, Cell>,
  row: number,
  col: number,
): Array<readonly [string, Cell]> {
  const out: Array<readonly [string, Cell]> = []
  const rowStart = Math.max(0, row - SPILL_PROJECTION_LOOKBACK)
  const colStart = Math.max(0, col - SPILL_PROJECTION_LOOKBACK)
  const candidateArea = (row - rowStart + 1) * (col - colStart + 1)
  if (candidateArea <= cells.size) {
    for (let anchorRow = rowStart; anchorRow <= row; anchorRow += 1) {
      for (let anchorCol = colStart; anchorCol <= col; anchorCol += 1) {
        const key = `${anchorRow}:${anchorCol}`
        const cell = cells.get(key)
        if (cell) out.push([key, cell])
      }
    }
    return out
  }
  for (const [key, cell] of cells) {
    const separator = key.indexOf(':')
    const anchorRow = Number(key.slice(0, separator))
    const anchorCol = Number(key.slice(separator + 1))
    if (anchorRow >= rowStart && anchorRow <= row && anchorCol >= colStart && anchorCol <= col) {
      out.push([key, cell])
    }
  }
  return out
}

function getSpillProjectedValue(
  state: RuntimeState,
  sheet: SheetEntry,
  row: number,
  col: number,
): Value | undefined {
  const target = state.workbook.sheet(sheet.id)
  if (!target) return undefined
  const cells = state.workbook.store.getter(target.sheetAtom)
  if (cells.has(`${row}:${col}`)) return undefined
  const query = { rowStart: row, rowEnd: row, colStart: col, colEnd: col }
  const scan = scanSpillAnchors(query, spillAnchorCandidates(cells, row, col), {
    arrayAt: (key, cell) => {
      if (!cell.input.startsWith('='))
        return cell.value.kind === 'array' ? cell.value.value : undefined
      const value = state.workbook.store.getter(target.formulaCellAtom(key))
      return value.kind === 'array' ? value.value : undefined
    },
  })
  return projectedValueAt(scan, { row, col })
}

export function spillRegionAt(
  state: RuntimeState,
  sheet: SheetEntry,
  row: number,
  col: number,
): SpillRegionWire | null {
  const target = state.workbook.sheet(sheet.id)
  if (!target) return null
  const cells = state.workbook.store.getter(target.sheetAtom)
  const probe: SpillProbe = {
    hasOwnCell: (targetRow, targetCol) => cells.has(`${targetRow}:${targetCol}`),
    arrayShapeAt: (targetRow, targetCol) => {
      const key = `${targetRow}:${targetCol}`
      const cell = cells.get(key)
      if (!cell?.input?.startsWith('=')) return null
      const value = state.workbook.store.getter(target.formulaCellAtom(key))
      if (value.kind !== 'array') return null
      const rows = value.value.length
      const cols = value.value[0]?.length ?? 0
      return rows > 0 && cols > 0 ? { rows, cols } : null
    },
  }
  const found = resolveSpillRegion(probe, row, col, SPILL_PROJECTION_LOOKBACK)
  if (!found) return null
  const anchorInput = cells.get(`${found.anchorRow}:${found.anchorCol}`)?.input
  const anchorFormula = anchorInput?.startsWith('=') ? anchorInput : undefined
  return { sheet: sheet.idx, ...found, ...(anchorFormula === undefined ? {} : { anchorFormula }) }
}

export function readCellValue(
  state: RuntimeState,
  sheet: SheetEntry,
  row: number,
  col: number,
): Value {
  const target = state.workbook.sheet(sheet.id)
  if (!target) return { kind: 'blank' }
  const key = `${row}:${col}`
  const cells = state.workbook.store.getter(target.sheetAtom)
  if (cells.has(key)) return anchorScalar(state.workbook.store.getter(target.formulaCellAtom(key)))
  return getSpillProjectedValue(state, sheet, row, col) ?? { kind: 'blank' }
}

export function readCellSnapshot(
  state: RuntimeState,
  sheet: SheetEntry,
  row: number,
  col: number,
): CellSnapshotWire {
  const value = readCellValue(state, sheet, row, col)
  const target = state.workbook.sheet(sheet.id)
  const cell = target
    ? state.workbook.store.getter(target.sheetAtom).get(`${row}:${col}`)
    : undefined
  return {
    sheet: sheet.idx,
    addr: formatA1({ row, col }),
    display: valueDisplay(value),
    type: valueKindToCellType(value),
    isError: value.kind === 'error',
    formula: cell?.ast ? cell.input : '',
  }
}

export function readSparseCell(
  state: RuntimeState,
  sheet: SheetEntry,
  row: number,
  col: number,
): SparseCellWire | undefined {
  const target = state.workbook.sheet(sheet.id)
  if (!target) return undefined
  const cell = state.workbook.store.getter(target.sheetAtom).get(`${row}:${col}`)
  if (cell?.ast) {
    return {
      sheet: sheet.idx,
      addr: formatA1({ row, col }),
      row,
      col,
      kind: 'formula',
      value: cell.input,
    }
  }
  const value = readCellValue(state, sheet, row, col)
  const base = { sheet: sheet.idx, addr: formatA1({ row, col }), row, col }
  switch (value.kind) {
    case 'number':
      return { ...base, kind: 'number', value: value.value }
    case 'string':
      return { ...base, kind: 'text', value: value.value }
    case 'boolean':
      return { ...base, kind: 'boolean', value: value.value }
    case 'error':
      return { ...base, kind: 'error', value: value.code }
    case 'array':
    case 'blank':
      return undefined
  }
}

export function applyCellInput(
  state: RuntimeState,
  sheet: SheetEntry,
  row: number,
  col: number,
  input: string,
): void {
  state.workbook.setCell(sheet.id, row, col, input)
}

export function clearCell(state: RuntimeState, sheet: SheetEntry, row: number, col: number): void {
  state.workbook.clearCell(sheet.id, row, col, 'all')
}

export function setCellFromWire(
  state: RuntimeState,
  sheet: SheetEntry,
  row: number,
  col: number,
  value: CellWire,
): boolean {
  switch (value.type) {
    case 'number':
      state.workbook.setCellValue(sheet.id, row, col, { kind: 'number', value: value.value })
      return true
    case 'text':
      state.workbook.setCellValue(sheet.id, row, col, { kind: 'string', value: value.value })
      return true
    case 'boolean':
      state.workbook.setCellValue(sheet.id, row, col, { kind: 'boolean', value: value.value })
      return true
    case 'error':
      state.workbook.setCellValue(sheet.id, row, col, {
        kind: 'error',
        code: value.value as ErrorCode,
      })
      return true
    case 'null':
      clearCell(state, sheet, row, col)
      return true
    default:
      throw rpcError('INVALID_CELL_VALUE', 'unsupported cell wire value')
  }
}

export function setFormulaDetailed(
  state: RuntimeState,
  sheet: SheetEntry,
  row: number,
  col: number,
  formula: unknown,
): FormulaMutationResultWire {
  if (typeof formula !== 'string')
    return { ok: false, code: 'INVALID_FORMULA', message: 'formula must be a string' }
  try {
    applyCellInput(state, sheet, row, col, formula.startsWith('=') ? formula : `=${formula}`)
    const value = readCellValue(state, sheet, row, col)
    if (value.kind === 'error' && value.code === '#CIRCULAR!') {
      return {
        ok: false,
        code: 'FORMULA_CYCLE',
        message: 'formula would create a cycle',
        display: value.code,
      }
    }
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      code: 'INVALID_FORMULA',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
