import type { WasmWorkbookRuntime } from './wasm-workbook-surface'
import type {
  ImportCellIssueWire,
  ImportCellWire,
  WorkbookImportStatsWire,
} from './worker-protocol'

/**
 * 导入会话的入口关卡：把宿主送来的 wire 单元格规范化成引擎能接受的形状，
 * 拒收的记成 issue 而不是抛错，并在会话累计量顶破上限时抛结构化错误。
 */

export type ImportSessionMode = 'atomic' | 'direct'

export type AtomicImportSession = {
  mode: 'atomic'
  workbook: WasmWorkbookRuntime
  normalizedCount: number
  stats: WorkbookImportStatsWire
  normalizationIssues: ImportCellIssueWire[]
  finalTouches: Map<string, ImportCellWire>
}

export type DirectImportSession = {
  mode: 'direct'
  workbook: WasmWorkbookRuntime
  normalizedCount: number
  stats: WorkbookImportStatsWire
  normalizationIssues: ImportCellIssueWire[]
}

export type ImportSession = AtomicImportSession | DirectImportSession

export type NormalizedImportChunk = {
  cells: ImportCellWire[]
  issues: ImportCellIssueWire[]
}

export const MAX_IMPORT_CHUNK_CELLS = 10_000
export const MAX_IMPORT_SESSION_NORMALIZED_CELLS = 200_000
export const MAX_IMPORT_SESSION_FINAL_TOUCHES = 200_000
export const MAX_IMPORT_SESSION_ISSUES = 25_000

type ImportLimits = {
  chunkCells: number
  normalizedCells: number
  finalTouches: number
  issues: number
}

const DEFAULT_IMPORT_LIMITS: ImportLimits = {
  chunkCells: MAX_IMPORT_CHUNK_CELLS,
  normalizedCells: MAX_IMPORT_SESSION_NORMALIZED_CELLS,
  finalTouches: MAX_IMPORT_SESSION_FINAL_TOUCHES,
  issues: MAX_IMPORT_SESSION_ISSUES,
}

let importLimits: ImportLimits = { ...DEFAULT_IMPORT_LIMITS }

export function __setImportLimitsForTest(limits: Partial<ImportLimits>) {
  importLimits = { ...DEFAULT_IMPORT_LIMITS, ...limits }
}

export function __resetImportLimitsForTest() {
  importLimits = { ...DEFAULT_IMPORT_LIMITS }
}

export function normalizeImportSessionMode(mode: unknown, atomic: unknown): ImportSessionMode {
  if (mode === undefined || mode === null) return atomic === false ? 'direct' : 'atomic'
  if (mode === 'atomic') return 'atomic'
  if (mode === 'direct' || mode === 'non-atomic' || mode === 'nonAtomic') return 'direct'
  throw Object.assign(new Error(`invalid import mode: ${String(mode)}`), {
    code: 'INVALID_IMPORT_MODE',
  })
}

export function importCellIssue(
  cell: Partial<ImportCellWire>,
  code: string,
  message: string,
): ImportCellIssueWire {
  const sheet = Number(cell.sheet)
  const row = Number(cell.row)
  const col = Number(cell.col)
  return {
    ...(Number.isFinite(sheet) ? { sheet } : {}),
    ...(Number.isFinite(row) ? { row } : {}),
    ...(Number.isFinite(col) ? { col } : {}),
    ...(typeof cell.kind === 'string' ? { kind: cell.kind } : {}),
    code,
    message,
  }
}

function importCellInput(cell: unknown): Partial<ImportCellWire> {
  return cell && typeof cell === 'object' ? (cell as Partial<ImportCellWire>) : {}
}

function normalizeImportCell(cell: unknown): ImportCellWire | ImportCellIssueWire {
  const input = importCellInput(cell)
  const sheet = Number(input.sheet)
  const row = Number(input.row)
  const col = Number(input.col)
  if (
    !Number.isInteger(sheet) ||
    sheet < 0 ||
    !Number.isInteger(row) ||
    row < 0 ||
    !Number.isInteger(col) ||
    col < 0
  ) {
    return importCellIssue(
      input,
      'INVALID_IMPORT_CELL_COORDINATES',
      'invalid import cell coordinates',
    )
  }

  switch (input.kind) {
    case 'number':
      if (typeof input.value !== 'number' || !Number.isFinite(input.value)) break
      return { sheet, row, col, kind: 'number', value: input.value }
    case 'text':
      if (typeof input.value !== 'string') break
      return { sheet, row, col, kind: 'text', value: input.value }
    case 'boolean':
      if (typeof input.value !== 'boolean') break
      return { sheet, row, col, kind: 'boolean', value: input.value }
    case 'error':
      if (typeof input.value !== 'string') break
      return { sheet, row, col, kind: 'error', value: input.value }
    case 'formula':
      if (typeof input.value !== 'string') break
      return { sheet, row, col, kind: 'formula', value: input.value }
    case 'null':
      return { sheet, row, col, kind: 'null' }
    default:
      return importCellIssue(input, 'INVALID_IMPORT_CELL_KIND', 'invalid import cell kind')
  }

  return importCellIssue(input, 'INVALID_IMPORT_CELL_VALUE', 'invalid import cell value')
}

export function normalizeImportCells(cells: unknown[]): NormalizedImportChunk {
  const session: NormalizedImportChunk = { cells: [], issues: [] }
  for (const cell of cells) {
    const normalized = normalizeImportCell(cell)
    if ('message' in normalized) session.issues.push(normalized)
    else session.cells.push(normalized)
  }
  return session
}

export function ensureImportChunkSize(cells: unknown[]) {
  if (cells.length > importLimits.chunkCells) {
    throw Object.assign(new Error(`import chunk too large: ${cells.length}`), {
      code: 'IMPORT_CHUNK_TOO_LARGE',
    })
  }
}

export function importCellKey(cell: Pick<ImportCellWire, 'sheet' | 'row' | 'col'>): string {
  return `${cell.sheet}:${cell.row}:${cell.col}`
}

function projectedFinalTouches(session: AtomicImportSession, cells: ImportCellWire[]): number {
  if (cells.length === 0) return session.finalTouches.size
  const next = session.finalTouches.size
  const uniqueNewTouches = new Set<string>()
  for (const cell of cells) {
    uniqueNewTouches.add(importCellKey(cell))
  }
  let projected = next
  for (const key of uniqueNewTouches) {
    if (!session.finalTouches.has(key)) projected += 1
  }
  return projected
}

export function ensureImportSessionLimits(session: ImportSession, chunk: NormalizedImportChunk) {
  if (session.normalizationIssues.length + chunk.issues.length > importLimits.issues) {
    throw Object.assign(new Error('import session exceeded issue limit'), {
      code: 'IMPORT_ISSUES_LIMIT_EXCEEDED',
    })
  }
  if (session.mode === 'direct') return

  if (session.normalizedCount + chunk.cells.length > importLimits.normalizedCells) {
    throw Object.assign(new Error('import session exceeded normalized cell limit'), {
      code: 'IMPORT_SESSION_LIMIT_EXCEEDED',
    })
  }
  const nextFinalTouches = projectedFinalTouches(session, chunk.cells)
  if (nextFinalTouches > importLimits.finalTouches) {
    throw Object.assign(new Error('import session exceeded final touch limit'), {
      code: 'IMPORT_SESSION_LIMIT_EXCEEDED',
    })
  }
}
