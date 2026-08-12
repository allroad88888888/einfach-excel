import { createStore } from '@einfach/core'
import { describe, expect, test } from '@jest/globals'
import { historyStackAtom, type HistoryEntryRecorder } from '../src/history'
import { createInsertRowsOperation, runStructureOperationAtom } from '../src/operations'
import {
  retryToolbarMutationAtom,
  runToolbarMutationAtom,
  toolbarMutationLifecycleAtom,
} from '../src/toolbar'

describe('history entry recorder producer contract', () => {
  test('structure records only after ACK and completes refresh when history is unavailable', async () => {
    const store = createStore()
    const calls: string[] = []
    const historyEntryRecorder: HistoryEntryRecorder = () => {
      calls.push('recorder')
      return 'unavailable'
    }

    await expect(
      store.setter(runStructureOperationAtom, {
        intent: createInsertRowsOperation({ sheetId: 'sheet-1', rowIndex: 0, count: 1 }),
        source: {
          async insertRows(request) {
            calls.push('mutation')
            return { sheetId: request.sheetId, requestId: request.requestId, revision: 3 }
          },
        },
        refreshProjection: async () => {
          calls.push('refresh')
        },
        historyEntryRecorder,
      }),
    ).resolves.toBe('completed')

    expect(calls).toEqual(['mutation', 'recorder', 'refresh'])
    expect(store.getter(historyStackAtom).entries).toEqual([])
  })

  test('structure keeps an acknowledged rejected recorder outcome unknown without another write', async () => {
    const store = createStore()
    let writes = 0
    let refreshes = 0
    const historyEntryRecorder: HistoryEntryRecorder = () => 'rejected'
    const input = {
      intent: createInsertRowsOperation({ sheetId: 'sheet-1', rowIndex: 0, count: 1 }),
      source: {
        async insertRows(request: { readonly sheetId: string; readonly requestId: number }) {
          writes += 1
          return { sheetId: request.sheetId, requestId: request.requestId, revision: 4 }
        },
      },
      refreshProjection: async () => {
        refreshes += 1
      },
      historyEntryRecorder,
    }

    await expect(store.setter(runStructureOperationAtom, input)).resolves.toBe('outcome-unknown')
    await expect(store.setter(runStructureOperationAtom, input)).resolves.toBe('stale')

    expect(writes).toBe(1)
    expect(refreshes).toBe(0)
    expect(store.getter(historyStackAtom).entries).toEqual([])
  })

  test('toolbar records only after every ACK and completes refresh when history is unavailable', async () => {
    const store = createStore()
    const calls: string[] = []
    const historyEntryRecorder: HistoryEntryRecorder = () => {
      calls.push('recorder')
      return 'unavailable'
    }

    await expect(
      store.setter(runToolbarMutationAtom, {
        source: {
          async setFormatRange(request) {
            calls.push('mutation')
            return {
              kind: request.kind,
              sheetId: request.sheetId,
              requestId: request.requestId,
              affectedRange: { ...request.range },
              revision: 5,
            }
          },
        },
        sheetId: 'sheet-1',
        operation: 'format',
        affectedRange: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
        steps: [
          {
            kind: 'set-format-range',
            range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
            format: { bold: true },
          },
        ],
        refreshProjection: async () => {
          calls.push('refresh')
        },
        historyEntryRecorder,
      }),
    ).resolves.toBe('completed')

    expect(calls).toEqual(['mutation', 'recorder', 'refresh'])
    expect(store.getter(historyStackAtom).entries).toEqual([])
  })

  test('toolbar keeps an acknowledged rejected recorder outcome unknown without another write', async () => {
    const store = createStore()
    let writes = 0
    const historyEntryRecorder: HistoryEntryRecorder = () => 'rejected'

    await expect(
      store.setter(runToolbarMutationAtom, {
        source: {
          async setFormatRange(request) {
            writes += 1
            return {
              kind: request.kind,
              sheetId: request.sheetId,
              requestId: request.requestId,
              affectedRange: { ...request.range },
              revision: 6,
            }
          },
        },
        sheetId: 'sheet-1',
        operation: 'format',
        affectedRange: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
        steps: [
          {
            kind: 'set-format-range',
            range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
            format: { italic: true },
          },
        ],
        refreshProjection: async () => undefined,
        historyEntryRecorder,
      }),
    ).resolves.toBe('outcome-unknown')
    await expect(store.setter(retryToolbarMutationAtom)).resolves.toBe('blocked')

    expect(writes).toBe(1)
    expect(store.getter(toolbarMutationLifecycleAtom).status).toBe('outcome-unknown')
    expect(store.getter(historyStackAtom).entries).toEqual([])
  })
})
