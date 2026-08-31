import { createWorkbook, type Workbook } from '@einfach/excel-core-ts'

import type { AsyncCustomCallable } from '../async-custom-pump'
import type { ImportCellWire, SparseRangeWire, WorkbookSheetMeta } from '../worker-protocol'
import type { TsConditionalFormatConfigs } from '../worker-runtime-ts-conditional-format'
import { rpcError } from './runtime-errors'

export interface SheetEntry {
  id: string
  idx: number
  name: string
}

export interface SnapshotSession {
  range: SparseRangeWire
  rowsPerChunk: number
  totalRows: number
  nextRow: number
}

export interface RuntimeState {
  workbook: Workbook
  /** Stable display order of sheets in the TypeScript workbook. */
  sheets: SheetEntry[]
  customFormulas: Map<string, { source: string; isAsync: boolean; callable?: AsyncCustomCallable }>
  rowHeightsBySheetName: Map<string, Map<number, number>>
  colWidthsBySheetName: Map<string, Map<number, number>>
  conditionalFormatsBySheetId: TsConditionalFormatConfigs
  importSessions: Map<number, { mode: 'atomic' | 'direct'; cells: ImportCellWire[] }>
  nextImportSessionId: number
  snapshotSessions: Map<number, SnapshotSession>
  nextSnapshotSessionId: number
}

export const DEFAULT_INITIAL_SHEETS = ['Sheet1']

function newSheetId(idx: number): string {
  return `sheet-${idx + 1}`
}

export function makeWorkbookFor(sheetNames: ReadonlyArray<string>): {
  wb: Workbook
  sheets: SheetEntry[]
} {
  const names = sheetNames.length > 0 ? sheetNames : DEFAULT_INITIAL_SHEETS
  const seeds = names.map((name, idx) => ({ id: newSheetId(idx), name }))
  const wb = createWorkbook(seeds)
  const sheets = seeds.map((seed, idx) => ({ id: seed.id, idx, name: seed.name }))
  return { wb, sheets }
}

export function createInitialState(): RuntimeState {
  const { wb, sheets } = makeWorkbookFor(DEFAULT_INITIAL_SHEETS)
  return {
    workbook: wb,
    sheets,
    customFormulas: new Map(),
    rowHeightsBySheetName: new Map(),
    colWidthsBySheetName: new Map(),
    conditionalFormatsBySheetId: new Map(),
    importSessions: new Map(),
    nextImportSessionId: 1,
    snapshotSessions: new Map(),
    nextSnapshotSessionId: 1,
  }
}

export function assertSheetIdx(state: RuntimeState, sheet: number): SheetEntry {
  if (!Number.isInteger(sheet) || sheet < 0 || sheet >= state.sheets.length) {
    throw rpcError('INVALID_SHEET', `invalid sheet index: ${sheet}`)
  }
  return state.sheets[sheet]
}

export function listSheetMeta(state: RuntimeState): WorkbookSheetMeta[] {
  return state.sheets.map((sheet) => ({ idx: sheet.idx, name: sheet.name }))
}
