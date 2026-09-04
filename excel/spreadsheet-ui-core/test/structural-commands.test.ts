import { createStore } from '@einfach/core'
import { describe, expect, test } from 'vitest'
import type { BackendMutationResult } from '../src/backend/types'
import { getOutlineGroupsForSheet, outlineAtom, viewportHiddenAtom } from '../src'
import type { HistoryEntryRecorder } from '../src/history'
import type { StructureOperationRequest } from '../src/operations'
import { setViewportFilterHiddenRowsAtom } from '../src/viewport/effective-hidden'
import { selectColumnsAtom, selectRowsAtom } from '../src/selection'
import { runStructuralCommandAtom, type StructuralCommandSource } from '../src/structural-commands'

function createStructureSource() {
  const requests: StructureOperationRequest[] = []
  let revision = 0
  const acknowledge = (request: StructureOperationRequest): BackendMutationResult => ({
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision: ++revision,
  })
  const source: StructuralCommandSource = {
    async insertRows(request) {
      requests.push(request as StructureOperationRequest)
      return acknowledge(request as StructureOperationRequest)
    },
    async deleteRows(request) {
      requests.push(request as StructureOperationRequest)
      return acknowledge(request as StructureOperationRequest)
    },
    async insertColumns(request) {
      requests.push(request as StructureOperationRequest)
      return acknowledge(request as StructureOperationRequest)
    },
    async deleteColumns(request) {
      requests.push(request as StructureOperationRequest)
      return acknowledge(request as StructureOperationRequest)
    },
  }
  return { requests, source }
}

const recordHistoryEntry: HistoryEntryRecorder = (entry, append) =>
  append(entry) ? 'recorded' : 'rejected'

describe('structural command routing', () => {
  test('fails closed without a selected sheet', async () => {
    const store = createStore()
    const { source } = createStructureSource()

    await expect(
      store.setter(runStructuralCommandAtom, {
        command: 'insert-rows-above',
        source,
        refreshProjection: async () => undefined,
        historyEntryRecorder: recordHistoryEntry,
      }),
    ).resolves.toBe('invalid')
  })

  test('inserts one row above or below the current selected span', async () => {
    const store = createStore()
    const { requests, source } = createStructureSource()
    store.setter(selectRowsAtom, { sheetId: 'sheet-1', rowAnchor: 3, rowFocus: 4 })

    await expect(
      store.setter(runStructuralCommandAtom, {
        command: 'insert-rows-above',
        source,
        refreshProjection: async () => undefined,
        historyEntryRecorder: recordHistoryEntry,
      }),
    ).resolves.toBe('completed')
    await expect(
      store.setter(runStructuralCommandAtom, {
        command: 'insert-rows-below',
        source,
        refreshProjection: async () => undefined,
        historyEntryRecorder: recordHistoryEntry,
      }),
    ).resolves.toBe('completed')

    expect(requests).toMatchObject([
      { kind: 'insert-rows', sheetId: 'sheet-1', rowIndex: 3, count: 1 },
      { kind: 'insert-rows', sheetId: 'sheet-1', rowIndex: 5, count: 1 },
    ])
  })

  test('deletes only visible rows in a filtered selected span', async () => {
    const store = createStore()
    const { requests, source } = createStructureSource()
    store.setter(selectRowsAtom, { sheetId: 'sheet-1', rowAnchor: 2, rowFocus: 5 })
    store.setter(setViewportFilterHiddenRowsAtom, { sheetId: 'sheet-1', rows: [3] })

    await expect(
      store.setter(runStructuralCommandAtom, {
        command: 'delete-rows',
        source,
        refreshProjection: async () => undefined,
        historyEntryRecorder: recordHistoryEntry,
      }),
    ).resolves.toBe('completed')

    expect(requests).toMatchObject([
      { kind: 'delete-rows', sheetId: 'sheet-1', rowIndex: 4, count: 2 },
      { kind: 'delete-rows', sheetId: 'sheet-1', rowIndex: 2, count: 1 },
    ])
  })

  test('routes row visibility and outline state through their canonical atoms', async () => {
    const store = createStore()
    store.setter(selectRowsAtom, { sheetId: 'sheet-1', rowAnchor: 2, rowFocus: 4 })

    await expect(store.setter(runStructuralCommandAtom, { command: 'hide-rows' })).resolves.toBe(
      'committed',
    )
    expect(store.getter(viewportHiddenAtom).rowsBySheet['sheet-1']).toEqual([2, 3, 4])

    await expect(store.setter(runStructuralCommandAtom, { command: 'unhide-rows' })).resolves.toBe(
      'committed',
    )
    expect(store.getter(viewportHiddenAtom).rowsBySheet['sheet-1']).toEqual([])

    await expect(store.setter(runStructuralCommandAtom, { command: 'group-rows' })).resolves.toBe(
      'committed',
    )
    await expect(store.setter(runStructuralCommandAtom, { command: 'ungroup-rows' })).resolves.toBe(
      'committed',
    )
    expect(getOutlineGroupsForSheet(store.getter(outlineAtom), 'sheet-1', 'row')).toEqual([])
  })

  test('uses the selected column span for structural and visibility commands', async () => {
    const store = createStore()
    const { requests, source } = createStructureSource()
    store.setter(selectColumnsAtom, { sheetId: 'sheet-1', colAnchor: 1, colFocus: 3 })

    await expect(
      store.setter(runStructuralCommandAtom, {
        command: 'insert-columns-right',
        source,
        refreshProjection: async () => undefined,
        historyEntryRecorder: recordHistoryEntry,
      }),
    ).resolves.toBe('completed')
    await expect(
      store.setter(runStructuralCommandAtom, {
        command: 'delete-columns',
        source,
        refreshProjection: async () => undefined,
        historyEntryRecorder: recordHistoryEntry,
      }),
    ).resolves.toBe('completed')
    await expect(store.setter(runStructuralCommandAtom, { command: 'hide-columns' })).resolves.toBe(
      'committed',
    )

    expect(requests).toMatchObject([
      { kind: 'insert-columns', sheetId: 'sheet-1', colIndex: 4, count: 1 },
      { kind: 'delete-columns', sheetId: 'sheet-1', colIndex: 1, count: 3 },
    ])
    expect(store.getter(viewportHiddenAtom).colsBySheet['sheet-1']).toEqual([1, 2, 3])
  })
})
