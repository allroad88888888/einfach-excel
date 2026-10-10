import { createStore, type Store } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import {
  activeWorkbookSheetAtom, cancelEditingAtom, commitCellEditingAtom,
  dispatchFormulaInputKeyAtom, editingDraftAtom, editingSessionAtom,
  formulaReferenceCaretAtom, formulaReferenceSessionAtom, initializeWorkbookDocumentAtom,
  pickFormulaReferenceAtom, runVisibleProjectionAtom, runWorkbookSheetCommandAtom,
  selectionSnapshotAtom, setRustWorkbookConnectionAtom, startEditingAtom,
  selectCellAtom,
  syncFormulaReferenceCaretAtom, updateFormulaDraftAtom, viewportMetricsAtom,
  type EditingCommitRequest, type VisibleProjectionRequest,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

function setup(name = 'Summary') {
  const store = createStore()
  const write = vi.fn(async (request: EditingCommitRequest) => ({
    sheetId: request.sheetId, requestId: request.requestId, revision: 1,
  }))
  const project = vi.fn(async (request: VisibleProjectionRequest) => ({
    kind: 'visible-window' as const, sheetId: request.sheetId,
    requestId: request.requestId, window: request.window, cells: [],
  }))
  store.setter(initializeWorkbookDocumentAtom, { title: 'Test', sheets: [
    { id: 'orders', name: 'Sales Orders', index: 0, rowCount: 1001, colCount: 16 },
    { id: 'summary', name, index: 1, rowCount: 100, colCount: 8 },
    { id: 'third', name: 'Third', index: 2, rowCount: 100, colCount: 8 },
  ] })
  store.setter(setRustWorkbookConnectionAtom, createTestRustWorkbookConnection({
    setCellInput: write, readVisibleProjection: project, setCellProjection: project,
  }))
  store.setter(startEditingAtom, {
    sheetId: 'orders', cell: { row: 500, col: 10 }, source: 'cell', draft: '=',
  })
  store.setter(syncFormulaReferenceCaretAtom, 1)
  const switchTo = (sheetId: string) =>
    store.setter(runWorkbookSheetCommandAtom, { operation: 'switch', sheetId })
  const pick = (row = 0, col = 1) => store.setter(pickFormulaReferenceAtom, {
    sheetId: store.getter(activeWorkbookSheetAtom)!.id,
    pickAnchor: { row, col }, pickFocus: { row, col }, dragging: false,
  })
  return { store, write, project, switchTo, pick }
}

function key(store: Store, keyName: string, shiftKey = false) {
  const caret = store.getter(formulaReferenceCaretAtom)
  return store.setter(dispatchFormulaInputKeyAtom, {
    key: keyName, shiftKey, start: caret, end: caret,
  })
}

test.each(['Summary', "O'Brien 预算"])(
  'cross-sheet picks quote %s without changing source or writing, cancel returns offscreen source',
  async (name) => {
    const { store, write, switchTo, pick } = setup(name)
    expect(await switchTo('summary')).toBe(true)
    expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 0, scrollLeft: 0 })
    pick()
    expect(store.getter(editingDraftAtom)).toBe(`='${name.replace(/'/g, "''")}'!B1`)
    expect(store.getter(editingSessionAtom).source).toEqual({
      sheetId: 'orders', cell: { row: 500, col: 10 }, source: 'formula-bar',
    })
    expect(write).not.toHaveBeenCalled()
    store.setter(cancelEditingAtom)
    expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('orders')
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 500, col: 10 })
    expect(store.getter(viewportMetricsAtom).scrollTop).toBeGreaterThan(0)
    expect(store.getter(formulaReferenceSessionAtom)).toBeNull()
  },
)

test('drag, F4, Shift and F2 keep the sheet qualifier and row/column locks', async () => {
  const { store, switchTo } = setup()
  await switchTo('summary')
  store.setter(pickFormulaReferenceAtom, {
    sheetId: 'summary', pickAnchor: { row: 2, col: 2 },
    pickFocus: { row: 0, col: 1 }, dragging: true,
  })
  expect(store.getter(editingDraftAtom)).toBe("='Summary'!B1:C3")
  key(store, 'F4')
  key(store, 'ArrowDown')
  expect(store.getter(editingDraftAtom)).toBe("='Summary'!$B$2")
  key(store, 'ArrowDown', true)
  expect(store.getter(editingDraftAtom)).toBe("='Summary'!$B$2:$B$3")
  key(store, 'F2')
  expect(key(store, 'ArrowDown')).toEqual({ handled: false })
  key(store, 'F2')
  key(store, 'ArrowDown')
  expect(store.getter(editingDraftAtom)).toBe("='Summary'!$B$4")
})

test('operators create new references on the browsing sheet; returning source uses unqualified A1', async () => {
  const { store, switchTo, pick } = setup()
  await switchTo('summary')
  pick()
  const draft = `${store.getter(editingDraftAtom)}+`
  store.setter(updateFormulaDraftAtom, { draft, caret: draft.length })
  pick(1, 1)
  expect(store.getter(editingDraftAtom)).toBe("='Summary'!B1+'Summary'!B2")
  await switchTo('orders')
  pick(1, 4)
  expect(store.getter(editingDraftAtom)).toBe("='Summary'!B1+E2")
  store.setter(cancelEditingAtom)
  expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 500, col: 10 })
})

test('F2 on a typed qualified token opens its actual sheet and resumes its coordinates', () => {
  const { store } = setup()
  const draft = "='Summary'!B2"
  store.setter(updateFormulaDraftAtom, { draft, caret: draft.length })
  key(store, 'F2')
  expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('summary')
  key(store, 'ArrowDown')
  expect(store.getter(editingDraftAtom)).toBe("='Summary'!B3")
})

test('structure changes are blocked while picking, including direct command calls', async () => {
  const { store, switchTo } = setup()
  await switchTo('summary')
  for (const operation of ['add', 'request-delete', 'move-left', 'move-right'] as const)
    expect(await store.setter(runWorkbookSheetCommandAtom, { operation })).toBe(false)
  expect(await store.setter(runWorkbookSheetCommandAtom, {
    operation: 'begin-rename', sheetId: 'summary',
  })).toBe(false)
})

test('commit writes the original sheet, projects the browsing sheet and returns only after acknowledgement', async () => {
  const { store, write, project, switchTo, pick } = setup()
  await switchTo('summary')
  pick()
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 'summary', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
    reason: 'viewport',
  })
  let finish!: () => void
  write.mockImplementationOnce((request) => new Promise((resolve) => {
    finish = () => resolve({ sheetId: request.sheetId, requestId: request.requestId, revision: 1 })
  }))
  const pending = store.setter(commitCellEditingAtom)
  expect(await switchTo('orders')).toBe(false)
  expect(store.setter(cancelEditingAtom)).toBeNull()
  expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('summary')
  finish()
  expect(await pending).toBe('completed')
  expect(write).toHaveBeenCalledWith(expect.objectContaining({
    sheetId: 'orders', row: 500, col: 10, input: "='Summary'!B1",
  }))
  expect(project.mock.lastCall![0].sheetId).toBe('summary')
  expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('orders')
  expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 500, col: 10 })
  expect(store.getter(editingSessionAtom).source).toBeNull()
})

test('a late acknowledgement never replaces the selection chosen while it was pending', async () => {
  const { store, write } = setup()
  store.setter(selectCellAtom, { sheetId: 'orders', coord: { row: 500, col: 10 } })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 'orders', window: { rowStart: 490, rowEnd: 510, colStart: 8, colEnd: 15 },
    reason: 'viewport',
  })
  let finish!: () => void
  write.mockImplementationOnce((request) => new Promise((resolve) => {
    finish = () => resolve({ sheetId: request.sheetId, requestId: request.requestId, revision: 1 })
  }))
  const pending = store.setter(commitCellEditingAtom)
  store.setter(selectCellAtom, { sheetId: 'orders', coord: { row: 501, col: 10 } })
  finish()
  expect(await pending).toBe('completed')
  expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 501, col: 10 })
})

test('immediate confirmation after switching returns source even before the new projection starts', async () => {
  const { store, switchTo, pick, write } = setup()
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 'orders', window: { rowStart: 490, rowEnd: 510, colStart: 8, colEnd: 15 },
    reason: 'viewport',
  })
  await switchTo('summary')
  pick()
  expect(await store.setter(commitCellEditingAtom)).toBe('completed')
  expect(write).toHaveBeenCalledTimes(1)
  expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('orders')
  expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 500, col: 10 })
})

test.each(['orders', 'summary', 'third'])(
  'switching to %s after closing a cross-sheet formula honors the requested destination',
  async (target) => {
    const { store, write, switchTo, pick } = setup()
    await switchTo('summary')
    pick()
    const draft = `${store.getter(editingDraftAtom)}+1`
    store.setter(updateFormulaDraftAtom, { draft, caret: draft.length })
    await store.setter(runVisibleProjectionAtom, {
      sheetId: 'summary', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 },
      reason: 'viewport',
    })
    expect(await switchTo(target)).toBe(true)
    expect(store.getter(activeWorkbookSheetAtom)?.id).toBe(target)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith(expect.objectContaining({
      sheetId: 'orders', row: 500, col: 10, input: "='Summary'!B1+1",
    }))
  },
)
