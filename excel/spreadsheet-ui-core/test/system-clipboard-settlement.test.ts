import { expect, test, vi } from 'vitest'
import {
  runSystemClipboardAtom, systemClipboardFeedbackAtom, projectionSnapshotAtom,
  setRustWorkbookConnectionAtom, startCellEditingFromProjectionAtom,
  type RustClipboardCapture,
} from '../src'
import { setupClipboardStore } from './support/system-clipboard-store'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const captured = { text: 'old', rows: 1, cols: 1, cut: false, token: 'snapshot-token' }

test.each(['native-first', 'browser-first'] as const)('copy waits for both boundaries before confirming: %s', async (order) => {
  const { store, capture, finish } = await setupClipboardStore()
  const native = deferred<RustClipboardCapture>()
  const browser = deferred<void>()
  capture.mockReturnValueOnce(native.promise)
  const pending = store.setter(runSystemClipboardAtom, { operation: 'copy', write: () => browser.promise })
  if (order === 'native-first') native.resolve(captured)
  else browser.resolve()
  // 排空 Promise 回调，不靠真实延时猜测两边是否结束。
  await Promise.resolve()
  expect(finish).not.toHaveBeenCalled()
  expect(store.getter(systemClipboardFeedbackAtom).busy).toBe(true)
  native.resolve(captured)
  browser.resolve()
  expect(await pending).toBe(true)
  expect(finish.mock.calls).toEqual([[{ token: captured.token, commit: true }]])
})

test.each(['capture', 'write', 'confirm'] as const)('duplicate copy/cut/paste is rejected while waiting for %s', async (stage) => {
  const { store, capture, finish, paste } = await setupClipboardStore()
  const native = deferred<RustClipboardCapture>()
  const browser = deferred<void>()
  const confirmation = deferred<void>()
  capture.mockReturnValueOnce(native.promise)
  finish.mockReturnValueOnce(confirmation.promise)
  const write = vi.fn(() => browser.promise)
  const read = vi.fn(async () => ({ text: 'new' }))
  const pending = store.setter(runSystemClipboardAtom, { operation: 'copy', write })
  if (stage !== 'capture') native.resolve(captured)
  if (stage === 'confirm') {
    browser.resolve()
    await vi.waitFor(() => expect(finish).toHaveBeenCalledOnce())
  }
  for (const operation of ['copy', 'cut'] as const)
    expect(await store.setter(runSystemClipboardAtom, { operation, write })).toBe(false)
  expect(await store.setter(runSystemClipboardAtom, { operation: 'paste', read })).toBe(false)
  expect(capture).toHaveBeenCalledOnce()
  expect(write).toHaveBeenCalledOnce()
  expect(read).not.toHaveBeenCalled()
  expect(paste).not.toHaveBeenCalled()
  native.resolve(captured)
  browser.resolve()
  confirmation.resolve()
  expect(await pending).toBe(true)
})

test('synchronous browser failure still discards a late native capture exactly once', async () => {
  const { store, capture, finish } = await setupClipboardStore()
  const native = deferred<RustClipboardCapture>()
  capture.mockReturnValueOnce(native.promise)
  const pending = store.setter(runSystemClipboardAtom, {
    operation: 'copy', write: () => { throw new Error('permission denied') },
  })
  await Promise.resolve()
  expect(store.getter(systemClipboardFeedbackAtom).busy).toBe(true)
  expect(finish).not.toHaveBeenCalled()
  native.resolve(captured)
  expect(await pending).toBe(false)
  expect(finish.mock.calls).toEqual([[{ token: captured.token, commit: false }]])
  expect(store.getter(systemClipboardFeedbackAtom)).toMatchObject({ busy: false, error: true })
})

test('native rejection does not confirm a nonexistent snapshot and retry is possible', async () => {
  const { store, capture, finish } = await setupClipboardStore()
  capture.mockRejectedValueOnce(new Error('CLIPBOARD_PARTIAL_MERGE'))
  const write = async (data: Promise<RustClipboardCapture>) => { await data }
  expect(await store.setter(runSystemClipboardAtom, { operation: 'copy', write })).toBe(false)
  expect(finish).not.toHaveBeenCalled()
  expect(store.getter(systemClipboardFeedbackAtom).message).toContain('whole merged cells')
  expect(await store.setter(runSystemClipboardAtom, { operation: 'copy', write })).toBe(true)
  expect(finish).toHaveBeenCalledOnce()
})

test('failed confirmation preserves the projection and unlocks an explicit retry', async () => {
  const { store, finish } = await setupClipboardStore()
  const before = store.getter(projectionSnapshotAtom)
  finish.mockRejectedValueOnce(new Error('worker disconnected'))
  const action = { operation: 'copy' as const, write: async (data: Promise<RustClipboardCapture>) => { await data } }
  expect(await store.setter(runSystemClipboardAtom, action)).toBe(false)
  expect(store.getter(projectionSnapshotAtom)).toBe(before)
  expect(store.getter(systemClipboardFeedbackAtom)).toMatchObject({ busy: false, error: true, message: 'worker disconnected' })
  expect(await store.setter(runSystemClipboardAtom, action)).toBe(true)
  expect(store.getter(systemClipboardFeedbackAtom)).toMatchObject({ busy: false, error: false })
})

test.each(['connection', 'editing'] as const)('paste never sends a write if %s changes during clipboard read', async (change) => {
  const { store, paste } = await setupClipboardStore()
  const before = store.getter(projectionSnapshotAtom)
  const pending = store.setter(runSystemClipboardAtom, {
    operation: 'paste', read: async () => {
      if (change === 'connection') store.setter(setRustWorkbookConnectionAtom, createTestRustWorkbookConnection())
      else store.setter(startCellEditingFromProjectionAtom, { sheetId: 'sheet-1', cell: { row: 0, col: 0 } })
      return { text: 'new' }
    },
  })
  expect(await pending).toBe(false)
  expect(paste).not.toHaveBeenCalled()
  expect(store.getter(projectionSnapshotAtom)).toBe(before)
})

test.each(['sheet', 'request', 'revision'] as const)('invalid paste acknowledgement %s cannot publish a projection', async (field) => {
  const { store, paste } = await setupClipboardStore()
  const before = store.getter(projectionSnapshotAtom)
  const original = paste.getMockImplementation()!
  paste.mockImplementationOnce(async (...args) => {
    const result = await original(...args)
    if (field === 'sheet') result.acknowledgement.sheetId = 'wrong-sheet'
    if (field === 'request') result.acknowledgement.requestId += 1
    if (field === 'revision') result.acknowledgement.revision += 1
    return result
  })
  const action = { operation: 'paste' as const, read: async () => ({ text: 'new' }) }
  expect(await store.setter(runSystemClipboardAtom, action)).toBe(false)
  expect(store.getter(projectionSnapshotAtom)).toBe(before)
  expect(store.getter(systemClipboardFeedbackAtom).message).toBe('Invalid paste acknowledgement.')
  expect(await store.setter(runSystemClipboardAtom, action)).toBe(true)
})
