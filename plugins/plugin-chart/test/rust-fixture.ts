import { createStore } from '@einfach/core'
import { vi } from 'vitest'
import {
  activateSheetTabAtom, beginProjectionAtom, initializeWorkbookDocumentAtom, resolveProjectionAtom,
  setMultiRegionSelectionAtom, setRustWorkbookConnectionAtom, type DisplayCell,
  type RustWorkbookConnection, type SheetDrawing, type VisibleProjectionRequest,
} from '@einfach-excel/spreadsheet-ui-core'

type Store = ReturnType<typeof createStore>
type Handler = (command: string, payload: any) => Promise<unknown>

const WINDOW = { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 9 }
const SHEETS = [
  { id: 's', index: 0, name: 'Sheet1', rowCount: 300, colCount: 50 },
  { id: 't', index: 1, name: 'Sheet2', rowCount: 300, colCount: 50 },
]

export const num = (row: number, col: number, value: number): DisplayCell =>
  ({ row, col, displayValue: String(value), numericValue: value, valueKind: 'number' } as DisplayCell)
export const text = (row: number, col: number, value: string): DisplayCell =>
  ({ row, col, displayValue: value, valueKind: 'string' } as DisplayCell)

export function chartDrawing(id: string, refs: SheetDrawing['refs'], patch: Partial<SheetDrawing> = {}):
  SheetDrawing {
  return { id, kind: 'chart', refs, payload: {},
    anchor: { row: 0, col: 5, offsetX: 0, offsetY: 0, width: 480, height: 288 }, ...patch }
}

export function publishProjection(store: Store, sheetId = 's', revision = 1) {
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId,
    reason: 'test', window: WINDOW })
  if (read.status !== 'started') throw new Error('Expected projection')
  store.setter(resolveProjectionAtom, { request: read.request as VisibleProjectionRequest,
    result: { ...read.request, cells: [], revision } as never })
}

export const switchSheet = (store: Store, sheetId: string) =>
  store.setter(activateSheetTabAtom, { sheetId })

export interface RangeSelection {
  rowStart: number; rowEnd: number; colStart: number; colEnd: number
}
export function select(store: Store, ...ranges: RangeSelection[]) {
  store.setter(setMultiRegionSelectionAtom, { primaryIndex: 0, regions: ranges.map((range) => ({
    kind: 'range' as const, sheetId: 's',
    anchor: { row: range.rowStart, col: range.colStart },
    focus: { row: range.rowEnd, col: range.colEnd } })) })
}

/** 假 Rust：按显示格回应范围读取，记录对象目录；`defer` 让读取停在半路，由测试放行。 */
export function setupChartRust(cells: DisplayCell[] = []) {
  const store = createStore()
  const rust = { cells, revision: 1, drawings: [] as SheetDrawing[], defer: false,
    failRead: null as string | null, failDrawings: null as string | null,
    release: [] as (() => void)[] }
  const handle: Handler = async (command, payload) => {
    if (command === 'projection.readVisible') {
      if (rust.failRead) throw new Error(rust.failRead)
      const request = payload.request as VisibleProjectionRequest
      const { rowStart, rowEnd, colStart, colEnd } = request.window
      const result = { ...request, revision: rust.revision, cells: rust.cells.filter((cell) =>
        cell.row >= rowStart && cell.row <= rowEnd && cell.col >= colStart && cell.col <= colEnd) }
      if (!rust.defer) return result
      return new Promise((resolve) => rust.release.push(() => resolve(result)))
    }
    if (rust.failDrawings) throw new Error(rust.failDrawings)
    if (command === 'drawings.read') return { drawings: [...rust.drawings], revision: rust.revision }
    if (command === 'drawings.set') {
      const at = rust.drawings.findIndex((entry) => entry.id === payload.drawing.id)
      if (at >= 0) rust.drawings[at] = payload.drawing
      else rust.drawings.push(payload.drawing)
    }
    rust.revision += 1
    return { changed: true, drawings: [...rust.drawings],
      projection: { ...payload.projection, cells: [], revision: rust.revision } }
  }
  const request = vi.fn(handle)
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: SHEETS })
  store.setter(setRustWorkbookConnectionAtom, {
    request: request as unknown as RustWorkbookConnection['request'], dispose() {},
  })
  publishProjection(store)
  const reads = () => request.mock.calls.filter(([name]) => name === 'projection.readVisible')
  const writes = (command: string) => request.mock.calls
    .filter(([name]) => name === command).map(([, payload]) => payload as any)
  return { store, rust, request, reads, writes }
}
