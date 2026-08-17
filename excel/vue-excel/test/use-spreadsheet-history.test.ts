import { createStore, type Store } from '@einfach/core'
import {
  historyStackAtom,
  pushHistoryAtom,
  type HistoryEntry,
  type HistoryMutationResult,
  type HistoryRedoRequest,
  type HistoryUndoRequest,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { describe, expect, it, jest } from '@jest/globals'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { SpreadsheetUiProvider } from '../src/spreadsheet-ui-provider'
import { useSpreadsheetHistory, type SpreadsheetHistory } from '../src/use-spreadsheet-history'

function entry(transactionId: string, revision: number): HistoryEntry {
  return {
    transactionId,
    kind: 'cell.set-input',
    sheetId: 'sheet-1',
    projectionRevision: revision,
  }
}

function createBackend() {
  const undoTransaction = jest.fn(
    async (request: HistoryUndoRequest): Promise<HistoryMutationResult> => ({
      transactionId: request.transactionId,
      requestId: request.requestId,
      revision: 3,
    }),
  )
  const redoTransaction = jest.fn(
    async (request: HistoryRedoRequest): Promise<HistoryMutationResult> => ({
      transactionId: request.transactionId,
      requestId: request.requestId,
      revision: 4,
    }),
  )

  return {
    backend: { undoTransaction, redoTransaction } as unknown as SpreadsheetBackend,
    undoTransaction,
    redoTransaction,
  }
}

interface MountedHistory {
  readonly app: ReturnType<typeof createApp>
  readonly history: SpreadsheetHistory
}

function mountHistory(store: Store, backend: SpreadsheetBackend): MountedHistory {
  let history: SpreadsheetHistory | undefined
  const Capture = defineComponent({
    name: 'HistoryCapture',
    setup: function HistoryCaptureSetup() {
      history = useSpreadsheetHistory()
      return () => null
    },
  })
  const Root = defineComponent({
    setup() {
      return () => h(SpreadsheetUiProvider, { backend, store }, { default: () => h(Capture) })
    },
  })
  const app = createApp(Root)
  app.mount(document.createElement('div'))
  if (history === undefined) throw new Error('History hook was not mounted.')
  return { app, history }
}

function trackUnsubscribe(store: Store, onUnsubscribe: () => void): Store {
  const trackedStore = Object.create(store) as Store
  Object.defineProperty(trackedStore, 'sub', {
    value(atom: Parameters<Store['sub']>[0], listener: Parameters<Store['sub']>[1]) {
      const unsubscribe = store.sub(atom, listener)
      return () => {
        onUnsubscribe()
        unsubscribe()
      }
    },
  })
  return trackedStore
}

describe('useSpreadsheetHistory', () => {
  it('reactively projects history state without leaking across sibling providers', async () => {
    const firstStore = createStore()
    const secondStore = createStore()
    const { backend } = createBackend()
    let first: SpreadsheetHistory | undefined
    let second: SpreadsheetHistory | undefined
    const Capture = defineComponent({
      props: { id: { type: String, required: true } },
      setup: function HistorySiblingCaptureSetup(props) {
        const history = useSpreadsheetHistory()
        if (props.id === 'first') first = history
        else second = history
        return () => null
      },
    })
    const Root = defineComponent({
      setup() {
        return () => [
          h(
            SpreadsheetUiProvider,
            { backend, store: firstStore },
            { default: () => h(Capture, { id: 'first' }) },
          ),
          h(
            SpreadsheetUiProvider,
            { backend, store: secondStore },
            { default: () => h(Capture, { id: 'second' }) },
          ),
        ]
      },
    })
    const app = createApp(Root)
    app.mount(document.createElement('div'))

    firstStore.setter(pushHistoryAtom, entry('first-change', 1))
    await nextTick()

    expect(first?.stack.value.cursor).toBe(1)
    expect(first?.canUndo.value).toBe(true)
    expect(second?.stack.value.cursor).toBe(0)
    expect(second?.canUndo.value).toBe(false)
    app.unmount()
  })

  it('uses the nearest provider backend for acknowledged undo and redo before refreshing', async () => {
    const store = createStore()
    const { backend, redoTransaction, undoTransaction } = createBackend()
    const mounted = mountHistory(store, backend)
    const refreshProjection = jest.fn(async () => undefined)
    store.setter(pushHistoryAtom, entry('first-change', 1))
    store.setter(pushHistoryAtom, entry('second-change', 2))
    await nextTick()

    expect(await mounted.history.undo({ refreshProjection, timeoutMs: 100 })).toBe('completed')
    expect(undoTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'second-change' }),
    )
    expect(refreshProjection).toHaveBeenCalledTimes(1)
    expect(mounted.history.stack.value.cursor).toBe(1)
    expect(mounted.history.canRedo.value).toBe(true)

    expect(await mounted.history.redo({ refreshProjection })).toBe('completed')
    expect(redoTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'second-change' }),
    )
    expect(refreshProjection).toHaveBeenCalledTimes(2)
    expect(mounted.history.stack.value.cursor).toBe(2)

    expect(mounted.history.clear()).toBe(true)
    expect(store.getter(historyStackAtom)).toMatchObject({ cursor: 0, entries: [] })
    mounted.app.unmount()
  })

  it('forwards refresh retry to UI core after an acknowledged refresh failure', async () => {
    const store = createStore()
    const { backend } = createBackend()
    const mounted = mountHistory(store, backend)
    const failedRefresh = jest.fn(async () => {
      throw new Error('refresh failed')
    })
    const retryRefresh = jest.fn(async () => undefined)
    store.setter(pushHistoryAtom, entry('change', 1))

    await expect(mounted.history.undo({ refreshProjection: failedRefresh })).resolves.toBe(
      'refresh-failed',
    )
    await nextTick()
    expect(mounted.history.canRetryRefresh.value).toBe(true)
    expect(mounted.history.lifecycle.value.status).toBe('refresh-failed')

    await expect(mounted.history.retryRefresh({ refreshProjection: retryRefresh })).resolves.toBe(
      'completed',
    )
    expect(retryRefresh).toHaveBeenCalledTimes(1)
    expect(mounted.history.lifecycle.value.status).toBe('ready')
    expect(mounted.history.canRetryRefresh.value).toBe(false)
    mounted.app.unmount()
  })

  it('resubscribes every history projection after provider replacement and cleans up on unmount', async () => {
    const backingFirstStore = createStore()
    const backingSecondStore = createStore()
    let unsubscribeCalls = 0
    const firstStore = trackUnsubscribe(backingFirstStore, () => {
      unsubscribeCalls += 1
    })
    const secondStore = trackUnsubscribe(backingSecondStore, () => {
      unsubscribeCalls += 1
    })
    const { backend: firstBackend } = createBackend()
    const { backend: secondBackend } = createBackend()
    const activeStore = ref<Store>(firstStore)
    const activeBackend = ref<SpreadsheetBackend>(firstBackend)
    let history: SpreadsheetHistory | undefined
    const Capture = defineComponent({
      setup: function ReplacementHistoryCaptureSetup() {
        history = useSpreadsheetHistory()
        return () => null
      },
    })
    const Root = defineComponent({
      setup() {
        return () =>
          h(
            SpreadsheetUiProvider,
            { backend: activeBackend.value, store: activeStore.value },
            { default: () => h(Capture) },
          )
      },
    })
    const app = createApp(Root)
    app.mount(document.createElement('div'))

    activeStore.value = secondStore
    activeBackend.value = secondBackend
    await nextTick()
    backingFirstStore.setter(pushHistoryAtom, entry('stale-change', 1))
    await nextTick()

    expect(unsubscribeCalls).toBe(5)
    expect(history?.stack.value).toMatchObject({ cursor: 0, entries: [] })
    secondStore.setter(pushHistoryAtom, entry('current-change', 1))
    await nextTick()
    expect(history?.stack.value.cursor).toBe(1)

    app.unmount()
    expect(unsubscribeCalls).toBe(10)
  })
})
