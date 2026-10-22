import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import { configureHostControlsAtom, hostControlsAtom, readWorkbookRangesAtom,
  writeWorkbookCellsAtom, workbookChangeAtom, resolveSpreadsheetRuntimeAtom,
  beginSpreadsheetRuntimeAtom } from '../../src'
import { createRustWorkbookConnection } from '../../src/rust-workbook/commands'
import type { WorkerLike } from '../../src/rust-worker/types'

const range = { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 4 }
function worker() {
  let listener: ((event: MessageEvent) => void) | undefined
  let oldListener: typeof listener
  const pending: { id: number; command: string; payload: unknown }[] = []
  const terminate = vi.fn()
  const instance: WorkerLike = {
    postMessage(message) { pending.push(message as typeof pending[number]) },
    addEventListener(type, callback) { if (type === 'message') listener = oldListener = callback },
    removeEventListener(type) { if (type === 'message') listener = undefined }, terminate,
  }
  const connection = createRustWorkbookConnection(() => instance)
  const reply = (result: unknown) => {
    const request = pending.shift()!
    listener?.({ data: { id: request.id, ok: true, result } } as MessageEvent)
  }
  const event = { operationId: 'native-1', revision: 2, source: 'user', kind: 'cell.setInput',
    changes: [{ sheetId: 'a', ranges: [range] }] }
  return { connection, pending, reply, terminate,
    emit: () => listener?.({ data: { type: 'event', event } } as MessageEvent),
    lateEmit: () => oldListener?.({ data: { type: 'event', event } } as MessageEvent) }
}

test('same Store forwards one typed batch and receives bounded native events with connection identity', async () => {
  const store = createStore(), first = worker()
  store.setter(resolveSpreadsheetRuntimeAtom, { connection: first.connection })
  const imported = store.getter(workbookChangeAtom)!
  expect(imported.source).toBe('import')
  const input = { cells: [{ sheetId: 'a', row: 0, col: 0,
    input: { kind: 'literal' as const, value: { kind: 'string' as const, value: '=00123' } } }] }
  const writing = store.setter(writeWorkbookCellsAtom, input)
  expect(first.pending).toHaveLength(1)
  expect(first.pending[0]).toMatchObject({ command: 'host.writeCells', payload: input })
  first.emit()
  first.reply({ changed: true, revision: 2 })
  await expect(writing).resolves.toEqual({ status: 'ok', changed: true, revision: 2 })
  const committed = store.getter(workbookChangeAtom)!
  expect(committed).toMatchObject({ connectionId: imported.connectionId, revision: 2, source: 'user' })
  expect(committed.operationId).toBe(`${imported.connectionId}:native-1`)
  expect(Object.isFrozen(committed.changes[0]!.ranges)).toBe(true)
  const reading = store.setter(readWorkbookRangesAtom, { targets: [{ sheetId: 'a', range }] })
  first.reply([{ sheetId: 'a', range, revision: 2, cells: [{ row: 0, col: 0,
    input: '=00123', value: { kind: 'string', value: '=00123' } }] }])
  const read = await reading
  expect(read.status).toBe('ok')
  if (read.status === 'ok') expect(read.ranges[0]!.cells[0]!.value).toEqual({ kind: 'string', value: '=00123' })
  first.connection.dispose()
})

test('readOnly gates Core and direct connection writes while busy permits explicit API patches', async () => {
  const store = createStore(), r = worker()
  store.setter(resolveSpreadsheetRuntimeAtom, { connection: r.connection })
  const locking = store.setter(configureHostControlsAtom, { readOnly: true })
  expect(r.pending[0]!.command).toBe('host.configure')
  r.reply(undefined)
  await locking
  expect(await store.setter(writeWorkbookCellsAtom, { cells: [] }))
    .toMatchObject({ status: 'error', error: { code: 'HOST_READ_ONLY' } })
  await expect(r.connection.request('range.clear', {} as never)).rejects.toThrow('HOST_READ_ONLY')
  await expect(r.connection.request('workbook.importCells', { cells: [] })).rejects.toThrow('HOST_LIFECYCLE_CLOSED')
  expect(r.pending).toHaveLength(0)
  const unlocking = store.setter(configureHostControlsAtom, { readOnly: false, busy: true })
  r.reply(undefined); await unlocking
  expect(store.getter(hostControlsAtom)).toEqual({ readOnly: false, busy: true,
    allowSheetStructure: true })
  await expect(r.connection.request('history.apply', {} as never)).rejects.toThrow('HOST_BUSY')
  const write = store.setter(writeWorkbookCellsAtom, { cells: [], source: 'refresh' })
  r.reply({ changed: false, revision: 2 }); await write
  r.connection.dispose()
})

test('old connection responses and late events cannot publish into a replacement Store workbook', async () => {
  const store = createStore(), first = worker(), second = worker()
  store.setter(resolveSpreadsheetRuntimeAtom, { connection: first.connection })
  const reading = store.setter(readWorkbookRangesAtom, { targets: [{ sheetId: 'a', range }] })
  const writing = store.setter(writeWorkbookCellsAtom, { cells: [] })
  store.setter(resolveSpreadsheetRuntimeAtom, { connection: second.connection })
  const imported = store.getter(workbookChangeAtom)
  first.emit()
  expect(store.getter(workbookChangeAtom)).toBe(imported)
  first.reply([])
  first.reply({ changed: true, revision: 99 })
  expect(await reading).toMatchObject({ status: 'error', error: { code: 'WORKBOOK_CONNECTION_REPLACED' } })
  expect(await writing).toMatchObject({ status: 'error', error: {
    code: 'WORKBOOK_CONNECTION_REPLACED', commitStatus: 'unknown',
  } })
  first.connection.dispose()
  first.lateEmit()
  expect(store.getter(workbookChangeAtom)).toBe(imported)
  second.emit()
  expect(store.getter(workbookChangeAtom)!.connectionId).toBe(imported!.connectionId)
  store.setter(beginSpreadsheetRuntimeAtom)
  expect(store.getter(workbookChangeAtom)).toBeNull()
  second.emit()
  expect(store.getter(workbookChangeAtom)).toBeNull()
  second.connection.dispose()
})

test('transport disposal rejects pending reads and removes native event subscriptions', async () => {
  const store = createStore(), r = worker()
  store.setter(resolveSpreadsheetRuntimeAtom, { connection: r.connection })
  const reading = store.setter(readWorkbookRangesAtom, { targets: [{ sheetId: 'a', range }] })
  const listener = vi.fn()
  r.connection.subscribe!(listener)
  r.connection.dispose()
  expect(await reading).toMatchObject({ status: 'error', error: { code: 'WORKER_DISPOSED' } })
  r.lateEmit()
  expect(listener).not.toHaveBeenCalled()
  expect(r.terminate).toHaveBeenCalledOnce()
})
