import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import { createWorkbookApi, startEditingAtom } from '../../src'
import { executeHostOperation } from '../../src/host/operation-worker'
import type { RuntimeContext } from '../../src/rust-workbook/dispatch/context'

function runtime() {
  let sequence = 0
  const sheetsById = new Map([
    ['deleted', { id: 'deleted', index: -1, name: 'Archived', rowCount: 100, colCount: 10 }],
    ['a', { id: 'a', index: 1, name: 'A', rowCount: 100, colCount: 10 }],
    ['b', { id: 'b', index: 0, name: 'B', rowCount: 200, colCount: 20 }],
  ])
  const context = { sheetsById, revision: 4,
    currentWorkbook: () => ({ host_mutation_state: () => ({ sequence }) }),
  } as unknown as RuntimeContext
  return { context, commit: () => sequence++ }
}

test('host sheet directories exclude archived identities and follow native tab order', async () => {
  const { context } = runtime(), dispatch = vi.fn(async () => ({}))
  const result = await executeHostOperation(context, { type: 'sheet-add', name: 'New' }, dispatch)
  expect(result.sheets.map(sheet => sheet.id)).toEqual(['b', 'a'])
  expect(dispatch).toHaveBeenCalledWith('workbook.editSheet', { name: 'New', rowCount: 100, colCount: 10 })
  await expect(executeHostOperation(context, { type: 'sheet-delete', sheetId: 'deleted' }, dispatch))
    .rejects.toThrow('INVALID_SHEET')
  expect(dispatch).toHaveBeenCalledOnce()
})

test('post-commit projection failures preserve native outcome and directory', async () => {
  const { context, commit } = runtime()
  const result = await executeHostOperation(context, { type: 'sheet-rename', sheetId: 'b', name: 'New' },
    async () => { commit(); throw new Error('projection failed') })
  expect(result).toMatchObject({ changed: true, revision: 5,
    displayError: { code: 'DISPLAY_FAILED', message: 'projection failed' } })
  expect(result.sheets).toHaveLength(2)
})

test('editing observers report source transitions rather than draft object replacements', () => {
  const store = createStore(), api = createWorkbookApi(store), listener = vi.fn()
  const stop = api.onEditingChange(listener)
  store.setter(startEditingAtom, { sheetId: 'a', cell: { row: 0, col: 0 }, source: 'cell', draft: '' })
  api.setDraft('one'); api.setDraft('two')
  api.cancelEditing()
  expect(listener).toHaveBeenCalledTimes(2)
  stop()
  store.setter(startEditingAtom, { sheetId: 'a', cell: { row: 0, col: 1 }, source: 'cell', draft: '' })
  expect(listener).toHaveBeenCalledTimes(2)
})

test('host A1 formatting rejects unbounded coordinates before generating column labels', () => {
  const api = createWorkbookApi(createStore())
  for (const col of [Infinity, NaN, -1, 16384, 0.5])
    expect(() => api.coordToA1({ row: 0, col })).toThrow('INVALID_COORDINATE')
  expect(api.coordToA1({ row: 1048575, col: 16383 })).toBe('XFD1048576')
})
