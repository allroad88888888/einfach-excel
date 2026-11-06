import { createStore } from '@einfach/core'
import { vi } from 'vitest'
import {
  activateSheetTabAtom, beginProjectionAtom, initializeWorkbookDocumentAtom, resolveProjectionAtom,
  setRustWorkbookConnectionAtom, setViewportMetricsAtom,
  type RustWorkbookConnection, type SheetDrawing, type VisibleProjectionRequest,
} from '../../src'

export const SHEETS = [
  { id: 's', index: 0, name: 'Sheet1', rowCount: 100, colCount: 20 },
  { id: 't', index: 1, name: 'Sheet2', rowCount: 100, colCount: 20 },
]
export const WINDOW = { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 9 }

export function drawing(id: string, patch: Partial<SheetDrawing> = {}): SheetDrawing {
  return { id, kind: 'chart', refs: [], payload: { title: id },
    anchor: { row: 2, col: 3, offsetX: 5, offsetY: 7, width: 200, height: 100 }, ...patch }
}

type Store = ReturnType<typeof createStore>

/** 发布一次可见区投影（带给定修订），让命令有投影见证与修订可用。 */
export function publishProjection(store: Store, sheetId: string, revision = 1) {
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId,
    reason: 'test', window: WINDOW })
  if (read.status !== 'started') throw new Error('Expected projection')
  store.setter(resolveProjectionAtom, { request: read.request as VisibleProjectionRequest,
    result: { ...read.request, cells: [], revision } as never })
}

export const switchSheet = (store: Store, sheetId: string) =>
  store.setter(activateSheetTabAtom, { sheetId })

/** 一个会记账的假 Rust：按工作表保存对象目录，每次写入推进一个修订。 */
export function setupDrawings(initial: Record<string, SheetDrawing[]> = {}, project = true) {
  const store = createStore()
  const rust = { sheets: { s: [] as SheetDrawing[], t: [] as SheetDrawing[], ...initial },
    revision: 1, failWith: null as string | null }
  const handle = async (command: string, payload: any) => {
    if (rust.failWith && command.startsWith('drawings.')) throw new Error(rust.failWith)
    if (command === 'projection.readVisible')
      return { ...payload.request, cells: [], revision: rust.revision }
    const list = rust.sheets[payload.sheetId as 's' | 't']
    if (command === 'drawings.read') return { drawings: [...list], revision: rust.revision }
    let changed = true
    if (command === 'drawings.set') {
      const at = list.findIndex((entry) => entry.id === payload.drawing.id)
      if (at >= 0) list[at] = payload.drawing
      else list.push(payload.drawing)
    } else if (command === 'drawings.remove') {
      const at = list.findIndex((entry) => entry.id === payload.id)
      changed = at >= 0
      if (changed) list.splice(at, 1)
    } else if (command === 'drawings.reorder') {
      const at = list.findIndex((entry) => entry.id === payload.id)
      const [entry] = list.splice(at, 1)
      if (payload.toFront) list.push(entry!)
      else list.unshift(entry!)
    }
    if (changed) rust.revision += 1
    return { changed, drawings: [...list],
      projection: { ...payload.projection, cells: [], revision: rust.revision } }
  }
  const request = vi.fn(handle)
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: SHEETS })
  store.setter(setRustWorkbookConnectionAtom, {
    request: request as unknown as RustWorkbookConnection['request'], dispose() {},
  })
  store.setter(setViewportMetricsAtom, { sheetId: 's', rowCount: 100, colCount: 20, rowHeight: 20,
    colWidth: 100, viewportWidth: 800, viewportHeight: 400, scrollTop: 0, scrollLeft: 0,
    overscanRows: 2, overscanCols: 2 })
  if (project) publishProjection(store, 's')
  return { store, rust, request, callsOf: (command: string) =>
    request.mock.calls.filter(([name]) => name === command).map(([, payload]) => payload as any) }
}
