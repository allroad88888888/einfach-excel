import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi, numberFormatPanelAtom, runNumberFormatPanelAtom, runVisibleProjectionAtom,
  selectCellAtom, setRustWorkbookConnectionAtom, setSelectionBoundsAtom,
  type RustWorkbookCommands, type SetFormatRangeRequest, type VisibleProjectionRequest,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

async function setup() {
  const preview = vi.fn(async (_: RustWorkbookCommands['format.preview']['payload']) => '12.50')
  const write = vi.fn(async (
    request: SetFormatRangeRequest, projection: VisibleProjectionRequest,
  ) => ({
    acknowledgement: { sheetId: request.sheetId, requestId: request.requestId, revision: 1 },
    projection: { kind: 'visible-window' as const, sheetId: projection.sheetId,
      requestId: projection.requestId, revision: 1, window: projection.window, cells: [] },
  }))
  const connection = createTestRustWorkbookConnection({
    previewNumberFormat: preview, setRangeFormat: write,
    readVisibleProjection: async (request) => ({
      kind: 'visible-window', sheetId: request.sheetId, requestId: request.requestId,
      revision: 0, window: request.window, cells: [],
    }),
  })
  const { store } = createSpreadsheetUi({ connection })
  store.setter(setSelectionBoundsAtom, { rowCount: 10, colCount: 10 })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 2, col: 1 } })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: 's', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 9 }, reason: 'viewport',
  })
  return { store, preview, write }
}

test('opens from the actual active cell and forwards the same format for preview and Apply', async () => {
  const { store, preview, write } = await setup()
  await store.setter(runNumberFormatPanelAtom, 'open')
  expect(preview).toHaveBeenLastCalledWith({ sheetId: 's', addr: 'B3',
    numberFormat: { kind: 'number', digits: 2, thousands: false } })
  expect(store.getter(numberFormatPanelAtom).preview).toEqual({ text: '12.50' })
  preview.mockResolvedValueOnce('29-Feb-24')
  await store.setter(runNumberFormatPanelAtom, { type: 'draft', patch: {
    category: 'date', datePattern: 'dd-mmm-yy', digits: '',
  } })
  expect(write).not.toHaveBeenCalled()
  expect(store.getter(numberFormatPanelAtom).preview).toEqual({ text: '29-Feb-24' })
  await store.setter(runNumberFormatPanelAtom, 'apply')
  expect(write.mock.calls[0]?.[0].format?.numberFormat)
    .toEqual(preview.mock.lastCall?.[0].numberFormat)
})

test.each([false, true])('latest draft wins over an older preview, rejection: %s', async (reject) => {
  const { store, preview } = await setup()
  const first = deferred<string>()
  preview.mockReturnValueOnce(first.promise)
  const open = store.setter(runNumberFormatPanelAtom, 'open')
  expect(store.getter(numberFormatPanelAtom).preview).toBeNull()
  await store.setter(runNumberFormatPanelAtom, { type: 'draft', patch: { category: 'text' } })
  const latest = store.getter(numberFormatPanelAtom)
  if (reject) first.reject(new Error('old request'))
  else first.resolve('obsolete')
  await open
  expect(store.getter(numberFormatPanelAtom)).toBe(latest)
  expect(latest.draft.category).toBe('text')
})

test('close and reopen ignores an earlier response without reviving the old dialog', async () => {
  const { store, preview } = await setup()
  const first = deferred<string>()
  preview.mockReturnValueOnce(first.promise)
  const open = store.setter(runNumberFormatPanelAtom, 'open')
  await store.setter(runNumberFormatPanelAtom, 'close')
  await store.setter(runNumberFormatPanelAtom, 'open')
  const reopened = store.getter(numberFormatPanelAtom)
  first.resolve('obsolete')
  await open
  expect(store.getter(numberFormatPanelAtom)).toBe(reopened)
  await store.setter(runNumberFormatPanelAtom, 'close')
  expect(store.getter(numberFormatPanelAtom).target).toBeNull()
})

test('a late preview cannot clear the busy flag or interfere with the pending mutation', async () => {
  const { store, preview, write } = await setup()
  const reading = deferred<string>()
  const writing = deferred<void>()
  preview.mockReturnValueOnce(reading.promise)
  const perform = write.getMockImplementation()!
  write.mockImplementationOnce(async (...args) => {
    await writing.promise
    return perform(...args)
  })
  const open = store.setter(runNumberFormatPanelAtom, 'open')
  const apply = store.setter(runNumberFormatPanelAtom, 'apply')
  await Promise.resolve()
  const pending = store.getter(numberFormatPanelAtom)
  expect(pending.busy).toBe(true)
  reading.resolve('late')
  await open
  expect(store.getter(numberFormatPanelAtom)).toBe(pending)
  writing.resolve()
  expect(await apply).toBe(true)
  expect(store.getter(numberFormatPanelAtom).target).toBeNull()
  expect(write).toHaveBeenCalledTimes(1)
})

test.each(['selection', 'connection'] as const)('pending preview rejects a changed %s target', async (change) => {
  const { store, preview, write } = await setup()
  const reading = deferred<string>()
  preview.mockReturnValueOnce(reading.promise)
  const open = store.setter(runNumberFormatPanelAtom, 'open')
  if (change === 'selection') store.setter(selectCellAtom, { sheetId: 's', coord: { row: 4, col: 2 } })
  else store.setter(setRustWorkbookConnectionAtom, createTestRustWorkbookConnection())
  reading.resolve('wrong target')
  await open
  expect(store.getter(numberFormatPanelAtom).preview).toEqual({ error: expect.stringContaining('changed') })
  expect(await store.setter(runNumberFormatPanelAtom, 'apply')).toBe(false)
  expect(write).not.toHaveBeenCalled()
  expect(preview).toHaveBeenCalledTimes(1)
})

test('a rejected Apply while preview is pending does not leave an orphan loading indicator', async () => {
  const { store, preview, write } = await setup()
  const reading = deferred<string>()
  preview.mockReturnValueOnce(reading.promise)
  write.mockRejectedValueOnce(new Error('write failed'))
  const open = store.setter(runNumberFormatPanelAtom, 'open')
  expect(await store.setter(runNumberFormatPanelAtom, 'apply')).toBe(false)
  expect(store.getter(numberFormatPanelAtom).preview)
    .toEqual({ error: expect.stringContaining('unavailable') })
  reading.resolve('old preview')
  await open
  expect(store.getter(numberFormatPanelAtom).preview)
    .toEqual({ error: expect.stringContaining('unavailable') })
  await store.setter(runNumberFormatPanelAtom, { type: 'draft', patch: { digits: '3' } })
  expect(store.getter(numberFormatPanelAtom).preview).toEqual({ text: '12.50' })
  expect(write).toHaveBeenCalledTimes(1)
})

test('invalid date draft skips native preview and Apply; switching to Text ignores decimal fields', async () => {
  const { store, preview, write } = await setup()
  await store.setter(runNumberFormatPanelAtom, 'open')
  preview.mockClear()
  await store.setter(runNumberFormatPanelAtom, { type: 'draft', patch: {
    category: 'date', datePattern: 'unsupported', digits: 'not a number',
  } })
  expect(store.getter(numberFormatPanelAtom).preview).toEqual({ error: expect.stringContaining('date formats') })
  expect(await store.setter(runNumberFormatPanelAtom, 'apply')).toBe(false)
  expect(preview).not.toHaveBeenCalled()
  expect(write).not.toHaveBeenCalled()
  await store.setter(runNumberFormatPanelAtom, { type: 'draft', patch: { category: 'text' } })
  expect(preview.mock.lastCall?.[0].numberFormat).toEqual({ kind: 'text' })
  expect(await store.setter(runNumberFormatPanelAtom, 'apply')).toBe(true)
})

test('empty result stays empty; read errors recover on a draft change without writing', async () => {
  const { store, preview, write } = await setup()
  preview.mockResolvedValueOnce('')
  await store.setter(runNumberFormatPanelAtom, 'open')
  expect(store.getter(numberFormatPanelAtom).preview).toEqual({ text: '' })
  preview.mockRejectedValueOnce(new Error('Worker unavailable'))
  await store.setter(runNumberFormatPanelAtom, { type: 'draft', patch: { digits: '3' } })
  expect(store.getter(numberFormatPanelAtom).preview).toEqual({ error: expect.stringContaining('unavailable') })
  await store.setter(runNumberFormatPanelAtom, { type: 'draft', patch: { digits: '4' } })
  expect(store.getter(numberFormatPanelAtom).preview).toEqual({ text: '12.50' })
  expect(write).not.toHaveBeenCalled()
})

test('date and time patterns remain independent while switching categories', async () => {
  const { store, preview } = await setup()
  await store.setter(runNumberFormatPanelAtom, 'open')
  await store.setter(runNumberFormatPanelAtom, { type: 'draft', patch: {
    category: 'date', datePattern: 'dd-mmm-yy',
  } })
  await store.setter(runNumberFormatPanelAtom, { type: 'draft', patch: { category: 'time' } })
  expect(preview.mock.lastCall?.[0].numberFormat).toEqual({ kind: 'time', pattern: 'hh:mm:ss' })
  await store.setter(runNumberFormatPanelAtom, { type: 'draft', patch: { category: 'date' } })
  expect(preview.mock.lastCall?.[0].numberFormat).toEqual({ kind: 'date', pattern: 'dd-mmm-yy' })
})
