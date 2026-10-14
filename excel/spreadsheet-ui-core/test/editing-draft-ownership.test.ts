import { createStore } from '@einfach/core'
import { describe, expect, test, vi } from 'vitest'
import {
  cancelEditingAtom,
  commitCellEditingAtom,
  editingCommitLifecycleAtom,
  editingSessionAtom,
  initializeWorkbookDocumentAtom,
  selectCellAtom,
  selectionSnapshotAtom,
  startCellEditingFromProjectionAtom,
  type EditingCommitRequest,
} from '../src'
import { bindEditingMutation, deferred, startCellEdit } from './editing-test-support'
import { setRustWorkbookConnectionAtom } from '../src/runtime/workbook-connection'

function draftStore() {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Draft ownership',
    sheets: [{ id: 'sheet-1', name: 'Sheet', index: 0, rowCount: 20, colCount: 10 }],
  })
  store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 4, col: 2 } })
  startCellEdit(store, 'Unsaved draft')
  return store
}

const anotherCell = { sheetId: 'sheet-1', cell: { row: 4, col: 3 } }

describe('editing draft ownership', () => {
  test('starting another projected editor cannot silently replace an unsaved draft', () => {
    const store = draftStore()
    const draft = store.getter(editingSessionAtom)
    expect(store.setter(startCellEditingFromProjectionAtom, anotherCell)).toBe(false)
    expect(store.getter(editingSessionAtom)).toBe(draft)
  })

  test('a rejected edit resumes its original source without losing the error or retrying', async () => {
    const store = draftStore()
    const write = vi.fn(async () => { throw new Error('DATA_VALIDATION_FAILED') })
    bindEditingMutation(store, write)
    expect(await store.setter(commitCellEditingAtom)).toBe('rejected')
    const draft = store.getter(editingSessionAtom)
    const error = store.getter(editingCommitLifecycleAtom)
    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: anotherCell.cell })
    expect(store.setter(startCellEditingFromProjectionAtom, anotherCell)).toBe(false)
    expect(store.getter(editingSessionAtom)).toBe(draft)
    expect(store.getter(editingCommitLifecycleAtom)).toBe(error)
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 4, col: 2 })
    expect(write).toHaveBeenCalledOnce()
  })

  test('pending write reports no new editor and keeps the exact submitted draft', async () => {
    const store = draftStore()
    const gate = deferred<void>()
    const write = vi.fn(async (request: EditingCommitRequest) => {
      await gate.promise
      return { sheetId: request.sheetId, requestId: request.requestId, revision: 1 }
    })
    bindEditingMutation(store, write)
    const draft = store.getter(editingSessionAtom)
    const commit = store.setter(commitCellEditingAtom)
    expect(store.setter(startCellEditingFromProjectionAtom, anotherCell)).toBe(false)
    expect(store.getter(editingSessionAtom)).toBe(draft)
    gate.resolve()
    expect(await commit).toBe('completed')
    expect(write).toHaveBeenCalledOnce()
  })

  test('explicit cancellation releases the draft for the next cell', () => {
    const store = draftStore()
    expect(store.setter(cancelEditingAtom)).toBe(true)
    expect(store.setter(startCellEditingFromProjectionAtom, anotherCell)).toBe(true)
    expect(store.getter(editingSessionAtom).source?.cell).toEqual(anotherCell.cell)
    expect(store.getter(editingSessionAtom).draft).toBe('')
  })

  test('double-click waits for the same write, then opens the next cell exactly once', async () => {
    const store = draftStore()
    const gate = deferred<void>()
    const write = vi.fn(async (request: EditingCommitRequest) => {
      await gate.promise
      return { sheetId: request.sheetId, requestId: request.requestId, revision: 1 }
    })
    bindEditingMutation(store, write)
    const draft = store.getter(editingSessionAtom)
    const commit = store.setter(commitCellEditingAtom)
    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: anotherCell.cell })
    const next = store.setter(startCellEditingFromProjectionAtom, {
      ...anotherCell, waitForPending: true,
    })
    expect(next).toBeInstanceOf(Promise)
    expect(store.getter(editingSessionAtom)).toBe(draft)
    gate.resolve()
    expect(await commit).toBe('completed')
    expect(await next).toBe(true)
    expect(store.getter(editingSessionAtom)).toMatchObject({
      source: { cell: anotherCell.cell }, draft: '',
    })
    expect(write).toHaveBeenCalledOnce()
  })

  test('rejection while waiting keeps the source draft and error without retrying', async () => {
    const store = draftStore()
    const gate = deferred<void>()
    const write = vi.fn(async () => { await gate.promise; throw new Error('DATA_VALIDATION_FAILED') })
    bindEditingMutation(store, write)
    const draft = store.getter(editingSessionAtom)
    const commit = store.setter(commitCellEditingAtom)
    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: anotherCell.cell })
    const next = store.setter(startCellEditingFromProjectionAtom, {
      ...anotherCell, waitForPending: true,
    })
    gate.resolve()
    expect(await commit).toBe('rejected')
    expect(await next).toBe(false)
    expect(store.getter(editingSessionAtom)).toBe(draft)
    expect(store.getter(editingCommitLifecycleAtom)).toMatchObject({
      status: 'rejected', error: expect.stringContaining('DATA_VALIDATION_FAILED'),
    })
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 4, col: 2 })
    expect(write).toHaveBeenCalledOnce()
  })

  test.each(['selection', 'focus', 'connection'] as const)(
    'new %s ownership cancels a delayed double-click', async (change) => {
      const store = draftStore()
      const gate = deferred<void>()
      bindEditingMutation(store, async (request) => {
        await gate.promise
        return { sheetId: request.sheetId, requestId: request.requestId, revision: 1 }
      })
      const commit = store.setter(commitCellEditingAtom)
      store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: anotherCell.cell })
      let current = true
      const next = store.setter(startCellEditingFromProjectionAtom, {
        ...anotherCell, waitForPending: true, isCurrent: () => current,
      })
      if (change === 'selection')
        store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 7, col: 1 } })
      if (change === 'focus') current = false
      if (change === 'connection') store.setter(setRustWorkbookConnectionAtom, null)
      gate.resolve()
      await commit
      expect(await next).toBe(false)
      expect(store.getter(editingSessionAtom).source).toBeNull()
      if (change === 'selection')
        expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 7, col: 1 })
    },
  )

  test('an unknown write result ends waiting without opening an editor or releasing the lock', async () => {
    vi.useFakeTimers()
    try {
      const store = draftStore()
      const gate = deferred<void>()
      const write = vi.fn(async (request: EditingCommitRequest) => {
        await gate.promise
        return { sheetId: request.sheetId, requestId: request.requestId, revision: 1 }
      })
      bindEditingMutation(store, write)
      const draft = store.getter(editingSessionAtom)
      const commit = store.setter(commitCellEditingAtom, { timeoutMs: 10 })
      const next = store.setter(startCellEditingFromProjectionAtom, {
        ...anotherCell, waitForPending: true,
      })
      await vi.advanceTimersByTimeAsync(10)
      expect(await commit).toBe('outcome-unknown')
      expect(await next).toBe(false)
      gate.resolve()
      await vi.advanceTimersByTimeAsync(10)
      expect(store.getter(editingSessionAtom)).toBe(draft)
      expect(store.setter(cancelEditingAtom)).toBeNull()
      expect(await store.setter(commitCellEditingAtom)).toBe('blocked')
      expect(write).toHaveBeenCalledOnce()
    } finally { vi.useRealTimers() }
  })
})
