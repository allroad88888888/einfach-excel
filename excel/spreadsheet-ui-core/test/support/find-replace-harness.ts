import { vi } from 'vitest'
import {
  createSpreadsheetUi,
  initializeWorkbookDocumentAtom,
  runVisibleProjectionAtom,
  setSelectionAtom,
  runFindReplaceAtom,
  findReplacePanelAtom,
  setViewportMetricsAtom,
  type FindReplaceAction,
  type RustWorkbookCommands,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../../src'

type Find = RustWorkbookCommands['workbook.find']['payload']
type Replace = RustWorkbookCommands['workbook.replace']['payload']
export const findRange = { rowStart: 1, rowEnd: 9, colStart: 0, colEnd: 2 }
export const projectFind = (request: VisibleProjectionRequest) => ({
  ...request,
  revision: 0,
  cells: [],
})

export async function findHarness() {
  const matches = [5, 8].map((row) => ({ sheetId: 's', row, col: 1, start: 0, end: 3 }))
  const find = vi.fn(async (input: Find) => ({
    total: 2,
    revision: 0,
    matches: matches.slice(input.offset, input.offset + input.limit),
  }))
  const replace = vi.fn(async (input: Replace) => ({
    cells: 1,
    occurrences: 1,
    projection: { ...projectFind(input.projection), revision: 1 },
    sizes: { rowHeights: [{ rowIndex: 89, heightPx: 60 }], colWidths: [] },
  }))
  const request = vi.fn(async (command: string, payload: unknown) => {
    if (command === 'workbook.find') return find(payload as Find)
    if (command === 'workbook.replace') return replace(payload as Replace)
    return projectFind((payload as { request: VisibleProjectionRequest }).request)
  })
  const { store } = createSpreadsheetUi({
    connection: { request: request as RustWorkbookConnection['request'], dispose() {} },
  })
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [
      { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 8 },
      { id: 'other', index: 1, name: 'Other', rowCount: 1000, colCount: 16 },
    ],
  })
  store.setter(setSelectionAtom, {
    kind: 'range',
    sheetId: 's',
    anchor: { row: 1, col: 0 },
    focus: { row: 9, col: 2 },
  })
  store.setter(setViewportMetricsAtom, {
    sheetId: 's',
    rowCount: 100,
    colCount: 8,
    rowHeight: 28,
    colWidth: 120,
    viewportHeight: 300,
    viewportWidth: 600,
    scrollTop: 0,
    scrollLeft: 0,
    overscanRows: 2,
    overscanCols: 2,
  })
  await store.setter(runVisibleProjectionAtom, { sheetId: 's', window: findRange, reason: 'test' })
  const run = (action: FindReplaceAction) => store.setter(runFindReplaceAtom, action)
  await run({ open: 'find' })
  await run({ form: { needle: 'old', replacement: 'new' } })
  return { store, find, replace, request, run, state: () => store.getter(findReplacePanelAtom) }
}
