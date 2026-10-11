import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import { startRustWorkbookRuntimeAtom, disposeRustWorkbookRuntimeAtom,
  runWorkbookFileAtom, workbookFilePanelAtom, workbookDocumentAtom, rustWorkbookConnectionAtom,
  runVisibleProjectionAtom, projectionSnapshotAtom, startEditingAtom } from '../src'
import type { WorkerLike } from '../src/rust-worker'
import { TEST_FUNCTION_CATALOG } from './support/function-catalog'
import { viewportSizeOverridesAtom } from '../src/viewport/size-overrides'

type WireRequest = { id: number; command: string; payload: Record<string, unknown> }
function worker(reply: (request: WireRequest) => unknown | Promise<unknown>) {
  let listener: ((event: MessageEvent) => void) | undefined
  const terminate = vi.fn()
  const requests: WireRequest[] = []
  const instance: WorkerLike = {
    postMessage(message) {
      const request = message as WireRequest
      requests.push(request)
      void Promise.resolve().then(() => request.command === 'formula.catalog'
        ? TEST_FUNCTION_CATALOG : reply(request)).then((result) => {
        listener?.({ data: { id: request.id, ok: true, result } } as MessageEvent)
      }, (error) => {
        listener?.({ data: { id: request.id, ok: false, error: {
          code: 'FAILED', message: String(error),
        } } } as MessageEvent)
      })
    },
    addEventListener(type, callback) { if (type === 'message') listener = callback },
    removeEventListener(type) { if (type === 'message') listener = undefined },
    terminate,
  }
  return { instance, terminate, requests }
}
const shape = { rowCount: 10, colCount: 4 }
const restored = { title: 'Opened', sheets: [
  { id: 'workbook-2-0', name: 'Restored', index: 0, ...shape },
] }
async function setup(
  candidateReply: (request: WireRequest) => unknown | Promise<unknown> = () => restored,
  oldReply?: (request: WireRequest) => unknown | Promise<unknown>) {
  const old = worker((request) => request.command === 'workbook.initialize'
    ? [{ id: 'old', index: 0, name: 'Old', ...shape }]
    : oldReply?.(request) ?? { text: 'native-json', filename: 'Book.einfach.json' })
  const candidate = worker(candidateReply)
  const store = createStore()
  const factory = vi.fn().mockReturnValueOnce(old.instance).mockReturnValue(candidate.instance)
  await store.setter(startRustWorkbookRuntimeAtom, { workerFactory: factory, definition: {
    title: 'Old book', sheets: [{ id: 'old', name: 'Old', ...shape }], createImportChunks: () => [],
  } })
  return { store, old, candidate, factory }
}
const open = { action: 'open' as const, confirmed: true, size: 10, read: async () => 'native-json' }

test('download requests a native snapshot and hands the file to the DOM callback', async () => {
  const { store, old, candidate } = await setup()
  const write = vi.fn(async () => {})
  expect(await store.setter(runWorkbookFileAtom, { action: 'download', write })).toBe(true)
  expect(old.requests.at(-1)).toMatchObject({ command: 'workbook.exportFile', payload: { title: 'Old book' } })
  expect(write).toHaveBeenCalledWith({ text: 'native-json', filename: 'Book.einfach.json' })
  expect(candidate.requests).toEqual([])
  expect(store.getter(workbookFilePanelAtom).message).toMatch(/Download requested/)
})

test('open swaps only after validation, resets the view and disposes the old worker', async () => {
  let finish!: (value: unknown) => void
  const { store, old, candidate } = await setup(() =>
    new Promise((resolve) => { finish = resolve }))
  const connection = store.getter(rustWorkbookConnectionAtom)
  store.setter(viewportSizeOverridesAtom, {
    rowHeightsBySheet: { old: { 0: 90 } }, colWidthsBySheet: {},
  })
  const pending = store.setter(runWorkbookFileAtom, open)
  await vi.waitFor(() => expect(candidate.requests).toHaveLength(1))
  expect(store.getter(rustWorkbookConnectionAtom)).toBe(connection)
  expect(old.terminate).not.toHaveBeenCalled()
  finish(restored)
  expect(await pending).toBe(true)
  expect(store.getter(workbookDocumentAtom)).toEqual(restored)
  expect(store.getter(rustWorkbookConnectionAtom)).not.toBe(connection)
  expect(store.getter(viewportSizeOverridesAtom).rowHeightsBySheet).toEqual({})
  expect(old.terminate).toHaveBeenCalledOnce()
  expect(candidate.terminate).not.toHaveBeenCalled()
  expect(store.getter(projectionSnapshotAtom).status).toBe('idle')
})

test('native errors leave current document, connection and view untouched', async () => {
  const { store, old, candidate } = await setup(() => { throw new Error('invalid file') })
  const document = store.getter(workbookDocumentAtom)
  const connection = store.getter(rustWorkbookConnectionAtom)
  expect(await store.setter(runWorkbookFileAtom, open)).toBe(false)
  expect(store.getter(workbookDocumentAtom)).toBe(document)
  expect(store.getter(rustWorkbookConnectionAtom)).toBe(connection)
  expect(old.terminate).not.toHaveBeenCalled()
  expect(candidate.terminate).toHaveBeenCalledOnce()
  expect(store.getter(workbookFilePanelAtom)).toMatchObject({ busy: false, error: true })
})

test('new requires confirmation and creates one full blank canvas without seed import', async () => {
  const { store, candidate } = await setup(({ payload }) =>
    (payload.sheets as object[]).map((sheet, index) => ({ ...sheet, index })))
  expect(await store.setter(runWorkbookFileAtom, { action: 'new', confirmed: false })).toBe(false)
  expect(candidate.requests).toEqual([])
  expect(await store.setter(runWorkbookFileAtom, { action: 'new', confirmed: true })).toBe(true)
  expect(candidate.requests.map((request) => request.command)).toEqual(['workbook.initialize', 'formula.catalog'])
  expect(store.getter(workbookDocumentAtom)).toMatchObject({ title: 'Untitled workbook', sheets: [
    { name: 'Sheet1', rowCount: 1_048_576, colCount: 16_384 },
  ] })
})

test('leaving the page during native validation disposes the candidate instead of resurrecting it', async () => {
  let finish!: (value: unknown) => void
  const { store, candidate } = await setup(() => new Promise((resolve) => { finish = resolve }))
  const pending = store.setter(runWorkbookFileAtom, open)
  await vi.waitFor(() => expect(candidate.requests).toHaveLength(1))
  store.setter(disposeRustWorkbookRuntimeAtom)
  finish(restored)
  expect(await pending).toBe(false)
  expect(store.getter(workbookDocumentAtom).sheets).toEqual([])
  expect(candidate.terminate).toHaveBeenCalledOnce()
})

test('old in-flight projections cannot reject or drain the new workbook queue', async () => {
  const { store, old } = await setup(({ command, payload }) => command === 'workbook.openFile'
    ? restored : { ...(payload.request as object), cells: [] }, () => new Promise(() => {}))
  const reading = store.setter(runVisibleProjectionAtom, { sheetId: 'old',
    window: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 }, reason: 'viewport' })
  await vi.waitFor(() => expect(old.requests.at(-1)?.command).toBe('projection.readVisible'))
  expect(await store.setter(runWorkbookFileAtom, open)).toBe(true)
  expect(await reading).toEqual({ status: 'superseded' })
  expect(store.getter(projectionSnapshotAtom).status).toBe('idle')
  expect(await store.setter(runVisibleProjectionAtom, { sheetId: 'workbook-2-0',
    window: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 }, reason: 'viewport' }))
    .toEqual({ status: 'ready' })
  expect(store.getter(projectionSnapshotAtom).result?.sheetId).toBe('workbook-2-0')
})

test('invalid file sizes and canceled file replacement never create a worker', async () => {
  const { store, factory } = await setup()
  const read = vi.fn(async () => 'x')
  for (const size of [0, -1, 64 * 1024 * 1024 + 1])
    expect(await store.setter(runWorkbookFileAtom, { ...open, size, read })).toBe(false)
  expect(await store.setter(runWorkbookFileAtom, { ...open, confirmed: false, read })).toBe(false)
  expect(factory).toHaveBeenCalledOnce()
  expect(read).not.toHaveBeenCalled()
})

test('editing drafts cannot be lost through a file action', async () => {
  const { store, factory } = await setup()
  store.setter(startEditingAtom, { sheetId: 'old', cell: { row: 0, col: 0 },
    draft: 'draft', source: 'cell' })
  expect(store.getter(workbookFilePanelAtom).disabled).toBe(true)
  expect(await store.setter(runWorkbookFileAtom, open)).toBe(false)
  expect(factory).toHaveBeenCalledOnce()
})

test('duplicate file actions cannot race two replacement workers', async () => {
  let finish!: (value: unknown) => void
  const { store, candidate, factory } = await setup(() =>
    new Promise((resolve) => { finish = resolve }))
  const pending = store.setter(runWorkbookFileAtom, open)
  await vi.waitFor(() => expect(candidate.requests).toHaveLength(1))
  expect(await store.setter(runWorkbookFileAtom, open)).toBe(false)
  expect(await store.setter(runWorkbookFileAtom, { action: 'new', confirmed: true })).toBe(false)
  expect(factory).toHaveBeenCalledTimes(2)
  finish(restored)
  expect(await pending).toBe(true)
})

test('invalid worker metadata rejects without losing the old runtime', async () => {
  const { store, candidate, old } = await setup(() => ({ ...restored, sheets: [] }))
  expect(await store.setter(runWorkbookFileAtom, open)).toBe(false)
  expect(store.getter(workbookDocumentAtom).title).toBe('Old book')
  expect(candidate.terminate).toHaveBeenCalledOnce()
  expect(old.terminate).not.toHaveBeenCalled()
})

test('a stale OS file read cannot replace the next page workbook', async () => {
  const { store, candidate } = await setup()
  let finish!: (text: string) => void
  const read = vi.fn(() => new Promise<string>((resolve) => { finish = resolve }))
  const pending = store.setter(runWorkbookFileAtom, { ...open, read })
  expect(read).toHaveBeenCalledOnce()
  store.setter(disposeRustWorkbookRuntimeAtom)
  finish('too late')
  expect(await pending).toBe(false)
  expect(candidate.requests).toEqual([])
  expect(store.getter(workbookDocumentAtom).sheets).toEqual([])
})
