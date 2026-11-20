import { vi } from 'vitest'
import type { Store } from '@einfach/core'
import {
  createSpreadsheetUi, runVisibleProjectionAtom, selectCellAtom, setSelectionBoundsAtom,
  setFillSeriesLocaleAtom, configureFillSeriesAtom,
  type RustWorkbookCommands, type RustWorkbookConnection, type VisibleProjectionRequest,
} from '@einfach-excel/spreadsheet-ui-core'

export type SortInput = RustWorkbookCommands['range.sort']['payload']
export const sorted = (p: SortInput) => ({
  movedRows: 3, projection: { ...p.projection, cells: [], revision: 2 },
})
export async function setup() {
  const sort = vi.fn(async (p: SortInput) => sorted(p))
  const request = vi.fn(async (command: string, p: unknown) => command === 'range.sort'
    ? sort(p as SortInput)
    : { ...(p as { request: VisibleProjectionRequest }).request, cells: [], revision: 1 })
  const connection: RustWorkbookConnection = { request: request as RustWorkbookConnection['request'], dispose() {} }
  const core = createSpreadsheetUi({ connection })
  const store: Store = core.store
  store.setter(setSelectionBoundsAtom, { rowCount: 100, colCount: 8 })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 10, col: 1 } })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 20, col: 3 }, extend: true })
  store.setter(setFillSeriesLocaleAtom, { locale: 'en', customLists: { Priority: ['Low', 'High'] } })
  await store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport',
    window: { rowStart: 0, rowEnd: 30, colStart: 0, colEnd: 4 } })
  return { store, sort, request, connection }
}

export async function saveList(store: Awaited<ReturnType<typeof setup>>['store'],
  name: string, text: string) {
  await store.setter(configureFillSeriesAtom, 'open')
  await store.setter(configureFillSeriesAtom, 'new-list')
  await store.setter(configureFillSeriesAtom, { field: 'listName', value: name })
  await store.setter(configureFillSeriesAtom, { field: 'listText', value: text })
  const saved = await store.setter(configureFillSeriesAtom, 'save-list')
  await store.setter(configureFillSeriesAtom, 'close')
  return saved
}
