import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import {
  selectionAggregatesAtom, setSelectionAtom, setSelectionBoundsAtom,
  configureSelectionStatisticsAtom, copySelectionStatisticAtom, selectionStatisticCopyFeedbackAtom,
  type RustWorkbookConnection, type RustWorkbookCommands,
} from '../src'
import { projectionSnapshotBackingAtom } from '../src/projection/state'
import { setRustWorkbookConnectionAtom } from '../src/runtime/workbook-connection'

type Numbers = RustWorkbookCommands['selection.aggregate']['result']
const numbers: Numbers = {
  count: 5, numericCount: 3, sum: 12, average: 4, min: 1, max: 7, revision: 0,
}
function setup() {
  const store = createStore()
  const request = vi.fn(async (_command: string, _input: unknown): Promise<Numbers> => numbers)
  const connection = { request: request as RustWorkbookConnection['request'], dispose() {} }
  store.setter(setRustWorkbookConnectionAtom, connection)
  store.setter(setSelectionBoundsAtom, { rowCount: 1_048_576, colCount: 16_384 })
  const select = (row: number) => store.setter(setSelectionAtom, {
    kind: 'cell', sheetId: 's', anchor: { row, col: 0 }, focus: { row, col: 0 },
  })
  const project = (revision: number, rowStart = 0) => store.setter(projectionSnapshotBackingAtom, {
    status: 'ready', result: {
      kind: 'visible-window', sheetId: 's', requestId: 1, revision,
      window: { rowStart, rowEnd: rowStart + 9, colStart: 0, colEnd: 9 }, cells: [],
    },
  })
  select(0)
  project(0)
  return { store, request, select, project, read: () => store.getter(selectionAggregatesAtom) }
}

test('whole-column query sends geometry, never the visible cells', async () => {
  const r = setup()
  r.store.setter(setSelectionAtom, { kind: 'column', sheetId: 's', colAnchor: 0, colFocus: 0 })
  expect(await r.read()).toEqual({ status: 'ready', numbers: { count: 5, numericCount: 3, sum: 12, average: 4, min: 1, max: 7 } })
  expect(r.request).toHaveBeenCalledWith('selection.aggregate', { targets: [{
    sheetId: 's', range: { rowStart: 0, rowEnd: 1_048_575, colStart: 0, colEnd: 0 },
  }] })
  expect('write' in selectionAggregatesAtom).toBe(false)
})

test('scrolling at the same revision does not query again; a data revision does', async () => {
  const r = setup()
  const unsubscribe = r.store.sub(selectionAggregatesAtom, () => {})
  await r.read()
  r.project(0, 900)
  await r.read()
  expect(r.request).toHaveBeenCalledTimes(1)
  r.request.mockResolvedValue({ ...numbers, sum: 30, average: 10, min: 10, max: 10, revision: 1 })
  r.project(1, 900)
  expect(await r.read()).toMatchObject({ numbers: { sum: 30 } })
  expect(r.request).toHaveBeenCalledTimes(2)
  unsubscribe()
})

test('late results cannot replace the current selection result', async () => {
  const r = setup()
  let finish!: (value: Numbers) => void
  r.request.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
  const unsubscribe = r.store.sub(selectionAggregatesAtom, () => {})
  const old = r.read()
  r.request.mockResolvedValue({ ...numbers, sum: 99, average: 33, min: 33, max: 33 })
  r.select(900)
  expect(await r.read()).toMatchObject({ numbers: { sum: 99 } })
  finish(numbers)
  await old
  expect(await r.read()).toMatchObject({ numbers: { sum: 99 } })
  unsubscribe()
})

test('disconnect clears statistics and workbooks do not share results', async () => {
  const a = setup()
  const b = setup()
  b.request.mockResolvedValue({ ...numbers, sum: 25, average: 25 / 3, min: 1, max: 20 })
  expect(await a.read()).toMatchObject({ numbers: { sum: 12 } })
  expect(await b.read()).toMatchObject({ numbers: { sum: 25 } })
  a.store.setter(setRustWorkbookConnectionAtom, null)
  expect(await a.read()).toEqual({ status: 'idle' })
  expect(await b.read()).toMatchObject({ numbers: { sum: 25 } })
})

test('errors replace old values and a subsequent selection can recover', async () => {
  const r = setup()
  r.request.mockRejectedValueOnce(new Error('Worker stopped'))
  expect(await r.read()).toEqual({ status: 'error', message: 'Worker stopped' })
  r.select(1)
  expect(await r.read()).toMatchObject({ status: 'ready' })
  r.request.mockResolvedValue({ ...numbers, sum: NaN })
  r.select(2)
  expect(await r.read()).toMatchObject({ status: 'error' })
})

test.each([
  { count: -1 }, { count: 2 }, { count: 3.5 }, { min: NaN }, { min: null },
  { max: Infinity }, { min: 8, max: 2 }, { numericCount: 0, min: 0, max: 0 },
])('rejects malformed count or extrema: %j', async (invalid) => {
  const r = setup()
  r.request.mockResolvedValue({ ...numbers, ...invalid })
  expect(await r.read()).toMatchObject({ status: 'error' })
})

test('configuring and copying a summary reuses its native result without new requests', async () => {
  const r = setup()
  r.request.mockResolvedValue({ ...numbers, average: 1 / 3 })
  await r.read()
  r.store.setter(configureSelectionStatisticsAtom, { statistic: 'sum', visible: false })
  const write = vi.fn(async (text: Promise<string>) => { expect(await text).toBe(String(1 / 3)) })
  expect(await r.store.setter(copySelectionStatisticAtom, { statistic: 'average', value: 1 / 3, write })).toBe(true)
  expect(write).toHaveBeenCalledTimes(1)
  expect(r.request).toHaveBeenCalledTimes(1)
  expect(r.store.getter(selectionStatisticCopyFeedbackAtom)).toEqual({
    busy: false, error: false, message: 'Copied Average.',
  })
})

test('copy starts the browser write synchronously and freezes the clicked result', async () => {
  const r = setup()
  await r.read()
  let finish!: () => void
  const permission = new Promise<void>((resolve) => { finish = resolve })
  const write = vi.fn(async (text: Promise<string>) => {
    await permission
    expect(await text).toBe('12')
  })
  const pending = r.store.setter(copySelectionStatisticAtom, { statistic: 'sum', value: 12, write })
  expect(write).toHaveBeenCalledTimes(1)
  expect(r.store.getter(selectionStatisticCopyFeedbackAtom).busy).toBe(true)
  expect(await r.store.setter(copySelectionStatisticAtom, { statistic: 'max', value: 7, write })).toBe(false)
  r.request.mockResolvedValue({ ...numbers, sum: 99 })
  r.select(3)
  expect(await r.read()).toMatchObject({ numbers: { sum: 99 } })
  finish()
  expect(await pending).toBe(true)
  expect(write).toHaveBeenCalledTimes(1)
})

test('clipboard permission failures are visible and a later copy can recover', async () => {
  const r = setup()
  const denied = () => { throw new Error('Clipboard permission was denied.') }
  expect(await r.store.setter(copySelectionStatisticAtom, {
    statistic: 'sum', value: 12, write: denied,
  })).toBe(false)
  expect(r.store.getter(selectionStatisticCopyFeedbackAtom)).toMatchObject({
    busy: false, error: true,
  })
  expect(await r.store.setter(copySelectionStatisticAtom, { statistic: 'sum', value: 12, write: async (text) => {
    expect(await text).toBe('12')
  } })).toBe(true)
  expect(r.store.getter(selectionStatisticCopyFeedbackAtom).error).toBe(false)
})

test('null and non-finite statistics cannot be exported as a fabricated number', async () => {
  const r = setup()
  const write = vi.fn(async (text: Promise<string>) => { await text })
  expect(await r.store.setter(copySelectionStatisticAtom, { statistic: 'sum', value: null, write })).toBe(false)
  expect(r.store.getter(selectionStatisticCopyFeedbackAtom).message).toContain('no finite value')
  expect(await r.store.setter(copySelectionStatisticAtom, { statistic: 'count', value: NaN, write })).toBe(false)
  expect(write).not.toHaveBeenCalled()
})
