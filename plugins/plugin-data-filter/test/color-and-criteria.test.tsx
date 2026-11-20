import { expect, test, vi } from 'vitest'
import {
  activateSheetTabAtom, createSpreadsheetUi, configureNativeFilterAtom,
  initializeWorkbookDocumentAtom, runVisibleProjectionAtom, selectCellAtom,
  type RustFilterValuesPage, type RustWorkbookConnection, type VisibleProjectionRequest,
} from '@einfach-excel/spreadsheet-ui-core'
import {
  colorCandidateBrowserAtom, configureColorCandidatesAtom, configureColorFilterAtom,
  configureWorksheetCriteriaAtom, worksheetCriteriaPanelAtom,
} from '../src/core'

test('switching sheets during in-flight worksheet criteria clears orphaned busy state', async () => {
  let resolvePreview!: (value: unknown) => void
  const request = vi.fn(async (command: string, payload: unknown) => {
    if (command === 'advancedFilter.previewCopy') {
      return new Promise(resolve => { resolvePreview = resolve })
    }
    return { ...(payload as { request: VisibleProjectionRequest }).request, cells: [], revision: 1 }
  })
  const connection: RustWorkbookConnection = {
    request: request as RustWorkbookConnection['request'], dispose() {},
  }
  const core = createSpreadsheetUi({ connection })
  const sheetA = { id: 's1', name: 'Sheet1', index: 0, rowCount: 30, colCount: 8 }
  const sheetB = { id: 's2', name: 'Sheet2', index: 1, rowCount: 30, colCount: 8 }
  core.store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book', sheets: [sheetA, sheetB],
  })
  core.store.setter(selectCellAtom, { sheetId: 's1', coord: { row: 0, col: 0 } })
  core.store.setter(selectCellAtom, { sheetId: 's1', coord: { row: 4, col: 2 }, extend: true })
  await core.store.setter(configureWorksheetCriteriaAtom, 'open')
  await core.store.setter(configureWorksheetCriteriaAtom, { type: 'mode', mode: 'copy' })
  await core.store.setter(configureWorksheetCriteriaAtom, {
    type: 'draft', patch: { destination: 'E1' },
  })
  const submitting = core.store.setter(configureWorksheetCriteriaAtom, 'submit')
  await Promise.resolve()
  expect(core.store.getter(worksheetCriteriaPanelAtom)?.busy).toBe(true)
  // Switch active sheet while preview request is in flight.
  core.store.setter(activateSheetTabAtom, { sheetId: 's2' })
  resolvePreview({ matchedRows: 1, target: { rowStart: 0, rowEnd: 1, colStart: 4, colEnd: 6 },
    overwrittenCells: 0, sample: [], revision: 1 })
  expect(await submitting).toBe(false)
  // Switching back to Sheet1 must NOT resurrect a stuck busy dialog.
  core.store.setter(activateSheetTabAtom, { sheetId: 's1' })
  expect(core.store.getter(worksheetCriteriaPanelAtom)).toBeNull()
})

test('switching filter column during color candidate load clears orphaned loading state', async () => {
  let resolvePage!: (value: RustFilterValuesPage & { readonly revision: number }) => void
  const request = vi.fn(async (command: string, payload: unknown) => {
    if (command === 'sheet.filterValues') {
      return new Promise<RustFilterValuesPage & { readonly revision: number }>(
        resolve => { resolvePage = resolve },
      )
    }
    return { ...(payload as { request: VisibleProjectionRequest }).request, cells: [], revision: 1 }
  })
  const connection: RustWorkbookConnection = {
    request: request as RustWorkbookConnection['request'], dispose() {},
  }
  const core = createSpreadsheetUi({ connection })
  core.store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [{ id: 's', name: 'Sheet1', index: 0, rowCount: 30, colCount: 8 }],
  })
  core.store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  await core.store.setter(runVisibleProjectionAtom, {
    sheetId: 's', reason: 'viewport', window: { rowStart: 0, rowEnd: 20, colStart: 0, colEnd: 4 },
  })
  await core.store.setter(configureNativeFilterAtom, 'open')
  core.store.setter(configureColorFilterAtom, { type: 'activate', index: 0 })
  const loading = core.store.setter(configureColorCandidatesAtom, {
    index: 0, type: 'read', offset: 0,
  })
  await Promise.resolve()
  expect(core.store.getter(colorCandidateBrowserAtom)?.status).toBe('loading')
  // Switch condition column from 0 -> 1 while page fetch is in flight.
  await core.store.setter(configureNativeFilterAtom, {
    type: 'change', index: 0, patch: { col: 1 },
  })
  resolvePage({ revision: 1, offset: 0, total: 1, values: [{ value: '#ff0000', count: 1 }] })
  await loading
  // Switch back to column 0: must NOT resurrect a stuck 'loading' browser.
  await core.store.setter(configureNativeFilterAtom, {
    type: 'change', index: 0, patch: { col: 0 },
  })
  expect(core.store.getter(colorCandidateBrowserAtom)).toBeNull()
})
