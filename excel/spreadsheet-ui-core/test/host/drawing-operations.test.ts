import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import { readWorkbookDrawingsAtom, setRustWorkbookConnectionAtom,
  type RustWorkbookConnection, type SheetDrawing } from '../../src'
import { executeHostOperation } from '../../src/host/operation-worker'
import type { RuntimeContext } from '../../src/rust-workbook/dispatch/context'

const drawing: SheetDrawing = { id: 'chart-1', kind: 'chart', refs: [], payload: {},
  anchor: { row: 0, col: 0, offsetX: 0, offsetY: 0, width: 100, height: 80 } }

function runtime() {
  let sequence = 0
  const sheetsById = new Map([
    ['a', { id: 'a', index: 0, name: 'A', rowCount: 100, colCount: 10 }],
    ['b', { id: 'b', index: 1, name: 'B', rowCount: 100, colCount: 10 }],
  ])
  const context = { sheetsById, revision: 2,
    currentWorkbook: () => ({ host_mutation_state: () => ({ sequence }) }),
  } as unknown as RuntimeContext
  return { context, commit: () => sequence++ }
}

test('host drawing operations reuse the object commands with an explicit, inactive sheet', async () => {
  const { context, commit } = runtime()
  const dispatch = vi.fn(async () => { commit(); return {} })
  const set = await executeHostOperation(context, { type: 'drawing-set', sheetId: 'b', drawing },
    dispatch)
  expect(set.changed).toBe(true)
  expect(dispatch).toHaveBeenLastCalledWith('drawings.set', expect.objectContaining({
    sheetId: 'b', drawing, projection: expect.objectContaining({ sheetId: 'b' }) }))
  await executeHostOperation(context,
    { type: 'drawing-order', sheetId: 'b', id: 'chart-1', toFront: false }, dispatch)
  expect(dispatch).toHaveBeenLastCalledWith('drawings.reorder',
    expect.objectContaining({ sheetId: 'b', id: 'chart-1', toFront: false }))
  await executeHostOperation(context, { type: 'drawing-remove', sheetId: 'b', id: 'chart-1' },
    dispatch)
  expect(dispatch).toHaveBeenLastCalledWith('drawings.remove',
    expect.objectContaining({ sheetId: 'b', id: 'chart-1' }))
  await expect(executeHostOperation(context,
    { type: 'drawing-remove', sheetId: 'missing', id: 'chart-1' }, dispatch))
    .rejects.toThrow('INVALID_SHEET')
})

test('host drawing reads return the catalog or a structured failure', async () => {
  const store = createStore()
  expect(await store.setter(readWorkbookDrawingsAtom, 'a')).toMatchObject({ status: 'error' })
  const request = vi.fn(async () => ({ drawings: [drawing], revision: 3 }))
  store.setter(setRustWorkbookConnectionAtom,
    { request: request as unknown as RustWorkbookConnection['request'], dispose() {} })
  expect(await store.setter(readWorkbookDrawingsAtom, 'b'))
    .toEqual({ status: 'ok', drawings: [drawing] })
  expect(request).toHaveBeenCalledWith('drawings.read', { sheetId: 'b' })
  request.mockRejectedValueOnce(new Error('The object worksheet no longer exists.'))
  expect(await store.setter(readWorkbookDrawingsAtom, 'gone')).toMatchObject({ status: 'error',
    error: { message: expect.stringContaining('no longer exists') } })
})
