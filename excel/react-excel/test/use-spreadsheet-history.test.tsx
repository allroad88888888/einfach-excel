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
import { act, render, renderHook, waitFor } from '@testing-library/react'
import { SpreadsheetUiProvider } from '../src/spreadsheet-ui-provider'
import { useSpreadsheetHistory } from '../src/use-spreadsheet-history'

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

function HistorySnapshot({ id }: { id: string }) {
  const history = useSpreadsheetHistory()

  return (
    <section data-testid={id}>
      <output data-testid={`${id}-cursor`}>{history.stack.cursor}</output>
      <output data-testid={`${id}-lifecycle`}>{history.lifecycle.status}</output>
      <output data-testid={`${id}-undo`}>{String(history.canUndo)}</output>
      <output data-testid={`${id}-redo`}>{String(history.canRedo)}</output>
    </section>
  )
}

function renderHistory(store: Store, backend: SpreadsheetBackend) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SpreadsheetUiProvider backend={backend} store={store}>
      {children}
    </SpreadsheetUiProvider>
  )
  return renderHook(() => useSpreadsheetHistory(), { wrapper })
}

describe('useSpreadsheetHistory', () => {
  it('reactively projects history state without leaking across sibling providers', () => {
    const firstStore = createStore()
    const secondStore = createStore()
    const { backend } = createBackend()
    const view = render(
      <>
        <SpreadsheetUiProvider backend={backend} store={firstStore}>
          <HistorySnapshot id="first" />
        </SpreadsheetUiProvider>
        <SpreadsheetUiProvider backend={backend} store={secondStore}>
          <HistorySnapshot id="second" />
        </SpreadsheetUiProvider>
      </>,
    )

    act(() => firstStore.setter(pushHistoryAtom, entry('first-change', 1)))

    expect(view.getByTestId('first-cursor')).toHaveTextContent('1')
    expect(view.getByTestId('first-undo')).toHaveTextContent('true')
    expect(view.getByTestId('second-cursor')).toHaveTextContent('0')
    expect(view.getByTestId('second-undo')).toHaveTextContent('false')
  })

  it('uses the nearest provider backend for acknowledged undo and redo before refreshing', async () => {
    const store = createStore()
    const { backend, redoTransaction, undoTransaction } = createBackend()
    const hook = renderHistory(store, backend)
    const refreshProjection = jest.fn(async () => undefined)
    act(() => {
      store.setter(pushHistoryAtom, entry('first-change', 1))
      store.setter(pushHistoryAtom, entry('second-change', 2))
    })

    let undoOutcome: Awaited<ReturnType<typeof hook.result.current.undo>>
    await act(async () => {
      undoOutcome = await hook.result.current.undo({ refreshProjection, timeoutMs: 100 })
    })
    expect(undoOutcome!).toBe('completed')
    expect(undoTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'second-change' }),
    )
    expect(refreshProjection).toHaveBeenCalledTimes(1)
    expect(hook.result.current.stack.cursor).toBe(1)
    expect(hook.result.current.canRedo).toBe(true)

    let redoOutcome: Awaited<ReturnType<typeof hook.result.current.redo>>
    await act(async () => {
      redoOutcome = await hook.result.current.redo({ refreshProjection })
    })
    expect(redoOutcome!).toBe('completed')
    expect(redoTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'second-change' }),
    )
    expect(refreshProjection).toHaveBeenCalledTimes(2)
    expect(hook.result.current.stack.cursor).toBe(2)

    act(() => expect(hook.result.current.clear()).toBe(true))
    expect(store.getter(historyStackAtom)).toMatchObject({ cursor: 0, entries: [] })
  })

  it('forwards refresh retry to UI core after a failed acknowledged refresh', async () => {
    const store = createStore()
    const { backend } = createBackend()
    const hook = renderHistory(store, backend)
    const failedRefresh = jest.fn(async () => {
      throw new Error('refresh failed')
    })
    const retryRefresh = jest.fn(async () => undefined)
    act(() => store.setter(pushHistoryAtom, entry('change', 1)))

    await act(async () => {
      await expect(hook.result.current.undo({ refreshProjection: failedRefresh })).resolves.toBe(
        'refresh-failed',
      )
    })
    await waitFor(() => expect(hook.result.current.canRetryRefresh).toBe(true))
    expect(hook.result.current.lifecycle.status).toBe('refresh-failed')

    await act(async () => {
      await expect(
        hook.result.current.retryRefresh({ refreshProjection: retryRefresh }),
      ).resolves.toBe('completed')
    })
    expect(retryRefresh).toHaveBeenCalledTimes(1)
    expect(hook.result.current.lifecycle.status).toBe('ready')
    expect(hook.result.current.canRetryRefresh).toBe(false)
  })
})
