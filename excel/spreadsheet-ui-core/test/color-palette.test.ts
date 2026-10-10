import { expect, test, vi } from 'vitest'
import {
  colorPaletteAtom, createSpreadsheetUi, runColorPaletteAtom, runVisibleProjectionAtom,
  selectCellAtom, setRustWorkbookConnectionAtom, toolbarActiveSurfaceAtom,
  type SetFormatRangeRequest, type VisibleProjectionRequest,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

async function setup() {
  const project = (request: VisibleProjectionRequest, revision = 1) => ({
    kind: 'visible-window' as const, sheetId: request.sheetId, requestId: request.requestId,
    revision, window: request.window,
    cells: [{ row: 0, col: 0, displayValue: 'Seed', format: { bgColor: '#fff2cc' } }],
  })
  const write = vi.fn(async (
    request: SetFormatRangeRequest, projection: VisibleProjectionRequest,
  ) => ({
    acknowledgement: { sheetId: request.sheetId, requestId: request.requestId, revision: 2 },
    projection: project(projection, 2),
  }))
  const connection = createTestRustWorkbookConnection({
    readVisibleProjection: async (request) => project(request), setRangeFormat: write,
  })
  const { store } = createSpreadsheetUi({ connection })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 9 }, reason: 'viewport',
  })
  const run = (action: Parameters<typeof runColorPaletteAtom.write>[2]) =>
    store.setter(runColorPaletteAtom, action)
  return { store, write, run }
}

test('opening uses the projected color; typing and dismissing never writes Rust', async () => {
  const { store, write, run } = await setup()
  await run({ type: 'open', kind: 'fill-color' })
  expect(store.getter(colorPaletteAtom).draft).toBe('#fff2cc')
  await run({ type: 'draft', value: '#123456' })
  expect(store.getter(colorPaletteAtom).draft).toBe('#123456')
  await run('close')
  expect(store.getter(toolbarActiveSurfaceAtom)).toBeNull()
  expect(write).not.toHaveBeenCalled()
})

test('custom colors are validated, normalized, remembered independently and cleared explicitly', async () => {
  const { store, write, run } = await setup()
  await run({ type: 'open', kind: 'fill-color' })
  await run({ type: 'draft', value: '#xyz123' })
  expect(await run('apply')).toBe(false)
  expect(store.getter(colorPaletteAtom).error).toContain('six-digit')
  expect(write).not.toHaveBeenCalled()
  await run({ type: 'draft', value: '#ABCDEF' })
  expect(await run('apply')).toBe(true)
  expect(write.mock.calls[0]![0].format).toEqual({ bgColor: '#abcdef' })
  expect(store.getter(colorPaletteAtom).last).toEqual({
    'fill-color': '#abcdef', 'text-color': '#c00000',
  })
  await run({ type: 'quick', kind: 'fill-color' })
  expect(write.mock.calls[1]![0].format).toEqual({ bgColor: '#abcdef' })
  await run({ type: 'open', kind: 'text-color' })
  await run({ type: 'choose', value: '#123456' })
  await run({ type: 'open', kind: 'fill-color' })
  await run({ type: 'choose', value: null })
  expect(write.mock.calls[3]![0]).toMatchObject({ format: {}, clearFormatFields: ['bgColor'] })
  expect(store.getter(colorPaletteAtom).last).toEqual({
    'fill-color': '#abcdef', 'text-color': '#123456',
  })
})

test('a changed selection cannot receive the old palette draft', async () => {
  const { store, write, run } = await setup()
  await run({ type: 'open', kind: 'fill-color' })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 2, col: 1 } })
  expect(await run({ type: 'choose', value: '#123456' })).toBe(false)
  expect(store.getter(colorPaletteAtom).error).toContain('selection changed')
  expect(write).not.toHaveBeenCalled()
})

test('quick-apply rejection opens a retryable palette with the intended color', async () => {
  const { store, write, run } = await setup()
  write.mockRejectedValueOnce(new Error('offline'))
  expect(await run({ type: 'quick', kind: 'text-color' })).toBe(false)
  expect(store.getter(colorPaletteAtom)).toMatchObject({
    busy: false, draft: '#c00000', error: expect.stringContaining('Check the cell'),
  })
  expect(await run('apply')).toBe(true)
  expect(write).toHaveBeenCalledTimes(2)
  expect(write.mock.calls[1]![0].format).toEqual({ fgColor: '#c00000' })
})

test('pending writes reject duplicate actions and release busy state after connection replacement', async () => {
  const { store, write, run } = await setup()
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const original = write.getMockImplementation()!
  write.mockImplementationOnce(async (...args) => { await gate; return original(...args) })
  await run({ type: 'open', kind: 'fill-color' })
  const notify = vi.fn()
  const unsubscribe = store.sub(colorPaletteAtom, notify)
  const pending = run({ type: 'choose', value: '#123456' })
  expect(store.getter(colorPaletteAtom).busy).toBe(true)
  await Promise.resolve()
  expect(notify).toHaveBeenCalled()
  expect(await run('close')).toBe(false)
  expect(await run('apply')).toBe(false)
  expect(write).toHaveBeenCalledTimes(1)
  store.setter(setRustWorkbookConnectionAtom, createTestRustWorkbookConnection())
  release()
  expect(await pending).toBe(false)
  expect(store.getter(colorPaletteAtom)).toMatchObject({ busy: false, witness: null })
  expect(store.getter(toolbarActiveSurfaceAtom)).toBeNull()
  expect(store.getter(colorPaletteAtom).last['fill-color']).toBe('#fff2cc')
  unsubscribe()
})
