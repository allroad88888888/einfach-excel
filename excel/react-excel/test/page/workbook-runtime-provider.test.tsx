import { createStore } from '@einfach/core'
import {
  spreadsheetRuntimeAtom,
  workbookDocumentAtom,
  type RustWorkbookDefinition,
  type StartRustWorkbookRuntimeInput,
} from '@einfach-excel/spreadsheet-ui-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { WorkbookRuntimeProvider } from '../../src/page/WorkbookRuntimeProvider'

const { mockCreateWorker } = vi.hoisted(() => ({ mockCreateWorker: vi.fn() }))

vi.mock(
  '../../src/worker/create-workbook-worker',
  () => ({ createDefaultWorkbookWorker: mockCreateWorker }),
)

type RuntimeWorker = ReturnType<StartRustWorkbookRuntimeInput['workerFactory']>

function createReadyWorker(holdInitialize = false) {
  const terminate = vi.fn()
  let onMessage: ((event: MessageEvent) => void) | undefined
  let deliverInitialize: ((error?: string) => void) | undefined
  const postMessage = vi.fn((message: unknown) => {
    const request = message as { id: number; command: string }
    const listener = onMessage
    const deliver = (error?: string) => {
      const result = request.command === 'formula.catalog'
        ? { version: 1, functions: [{ name: 'SUM', category: 'Math', note: undefined }] }
        : [{ id: 'sheet-1', index: 0, name: 'Sheet 1' }]
      listener?.({ data: error
        ? { id: request.id, ok: false, error: { code: 'START_FAILED', message: error } }
        : { id: request.id, ok: true, result } } as MessageEvent)
    }
    if (holdInitialize && request.command === 'workbook.initialize') deliverInitialize = deliver
    else deliver()
  })
  const worker: RuntimeWorker = {
    postMessage,
    addEventListener(type, listener) {
      if (type === 'message') onMessage = listener
    },
    removeEventListener(type) {
      if (type === 'message') onMessage = undefined
    },
    terminate,
  }
  return {
    worker,
    postMessage,
    terminate,
    // 保留已捕获的旧 listener，模拟清理之前已经排队的响应。
    finishInitialize(error?: string) {
      expect(deliverInitialize).toBeDefined()
      deliverInitialize!(error)
    },
  }
}

afterEach(() => mockCreateWorker.mockReset())

const DEFINITION: RustWorkbookDefinition = {
  title: 'Test workbook',
  sheets: [{ id: 'sheet-1', name: 'Sheet 1', rowCount: 10, colCount: 5 }],
  createImportChunks: () => [],
}

describe('WorkbookRuntimeProvider lifecycle', () => {
  it('uses the supplied Store and replaces a custom factory without double disposal', async () => {
    const first = createReadyWorker()
    const next = createReadyWorker()
    const store = createStore()
    const firstFactory = vi.fn(() => first.worker)
    const nextFactory = vi.fn(() => next.worker)
    const view = render(
      <WorkbookRuntimeProvider definition={DEFINITION} store={store} workerFactory={firstFactory}>
        Custom workbook
      </WorkbookRuntimeProvider>,
    )
    expect(await screen.findByText('Custom workbook')).toBeVisible()
    expect(store.getter(workbookDocumentAtom).title).toBe('Test workbook')
    expect(store.getter(spreadsheetRuntimeAtom)).toEqual({ status: 'ready' })
    view.rerender(
      <WorkbookRuntimeProvider definition={DEFINITION} store={store} workerFactory={nextFactory}>
        Custom workbook
      </WorkbookRuntimeProvider>,
    )
    expect(await screen.findByText('Custom workbook')).toBeVisible()
    expect(firstFactory).toHaveBeenCalledTimes(1)
    expect(nextFactory).toHaveBeenCalledTimes(1)
    expect(first.terminate).toHaveBeenCalledTimes(1)
    expect(next.terminate).not.toHaveBeenCalled()
    expect(mockCreateWorker).not.toHaveBeenCalled()
    view.unmount()
    expect(first.terminate).toHaveBeenCalledTimes(1)
    expect(next.terminate).toHaveBeenCalledTimes(1)
  })

  it('renders a custom factory failure through the existing Core error state', async () => {
    const factory = vi.fn(() => { throw new Error('Custom worker unavailable') })
    render(
      <WorkbookRuntimeProvider definition={DEFINITION} workerFactory={factory}>
        Custom workbook
      </WorkbookRuntimeProvider>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Custom worker unavailable')
    expect(screen.queryByText('Custom workbook')).toBeNull()
    expect(factory).toHaveBeenCalledTimes(1)
    expect(mockCreateWorker).not.toHaveBeenCalled()
  })

  it('keeps workbook content hidden until native initialization finishes', async () => {
    const runtime = createReadyWorker(true)
    mockCreateWorker.mockReturnValueOnce(runtime.worker)
    render(
      <WorkbookRuntimeProvider definition={DEFINITION}>Ready workbook</WorkbookRuntimeProvider>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Loading Rust/WASM workbook')
    expect(screen.queryByText('Ready workbook')).toBeNull()
    await act(async () => runtime.finishInitialize())
    expect(screen.getByText('Ready workbook')).toBeVisible()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows initialization failure and recovers when the owner supplies a new definition', async () => {
    const failed = createReadyWorker(true)
    const next = createReadyWorker()
    mockCreateWorker.mockReturnValueOnce(failed.worker).mockReturnValueOnce(next.worker)
    const view = render(
      <WorkbookRuntimeProvider definition={DEFINITION}>Ready workbook</WorkbookRuntimeProvider>,
    )
    await act(async () => failed.finishInitialize('Rust import failed'))
    expect(screen.getByRole('alert')).toHaveTextContent('Rust import failed')
    expect(screen.queryByText('Ready workbook')).toBeNull()
    expect(failed.terminate).toHaveBeenCalledTimes(1)
    expect(mockCreateWorker).toHaveBeenCalledTimes(1) // 不偷偷自动重试。
    view.rerender(
      <WorkbookRuntimeProvider definition={{ ...DEFINITION, title: 'Replacement' }}>
        Ready workbook
      </WorkbookRuntimeProvider>,
    )
    expect(await screen.findByText('Ready workbook')).toBeVisible()
    expect(screen.queryByRole('alert')).toBeNull()
    view.unmount()
    expect(failed.terminate).toHaveBeenCalledTimes(1)
    expect(next.terminate).toHaveBeenCalledTimes(1)
  })

  it('renders a constructor failure without mounting workbook children', async () => {
    mockCreateWorker.mockImplementationOnce(() => { throw new Error('Worker blocked') })
    render(
      <WorkbookRuntimeProvider definition={DEFINITION}>Ready workbook</WorkbookRuntimeProvider>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Worker blocked')
    expect(screen.queryByText('Ready workbook')).toBeNull()
    expect(mockCreateWorker).toHaveBeenCalledTimes(1)
  })

  it.each([undefined, 'late failure'])('ignores old initialization after replacement: %s',
    async (error) => {
      const old = createReadyWorker(true)
      const next = createReadyWorker()
      const store = createStore()
      mockCreateWorker.mockReturnValueOnce(old.worker).mockReturnValueOnce(next.worker)
      const view = render(
        <WorkbookRuntimeProvider definition={DEFINITION} store={store}>
          Ready
        </WorkbookRuntimeProvider>,
      )
      const replacement = { ...DEFINITION, title: 'New workbook' }
      view.rerender(
        <WorkbookRuntimeProvider definition={replacement} store={store}>
          Ready
        </WorkbookRuntimeProvider>,
      )
      expect(await screen.findByText('Ready')).toBeVisible()
      await act(async () => old.finishInitialize(error))
      expect(store.getter(workbookDocumentAtom).title).toBe('New workbook')
      expect(store.getter(spreadsheetRuntimeAtom)).toEqual({ status: 'ready' })
      expect(old.postMessage).toHaveBeenCalledTimes(1)
      expect(old.terminate).toHaveBeenCalledTimes(1)
      expect(next.terminate).not.toHaveBeenCalled()
      expect(screen.queryByRole('alert')).toBeNull()
      view.unmount()
      expect(next.terminate).toHaveBeenCalledTimes(1)
    })

  it('unmounting during initialization disposes once and cannot publish a late workbook', async () => {
    const runtime = createReadyWorker(true)
    const store = createStore()
    mockCreateWorker.mockReturnValueOnce(runtime.worker)
    const view = render(
      <WorkbookRuntimeProvider definition={DEFINITION} store={store}>
        Ready
      </WorkbookRuntimeProvider>,
    )
    view.unmount()
    await act(async () => runtime.finishInitialize())
    expect(runtime.terminate).toHaveBeenCalledTimes(1)
    expect(runtime.postMessage).toHaveBeenCalledTimes(1)
    expect(store.getter(workbookDocumentAtom).sheets).toEqual([])
    expect(store.getter(spreadsheetRuntimeAtom)).toEqual({ status: 'loading' })
    expect(screen.queryByText('Ready')).toBeNull()
  })

  it('starts the UI-core Rust runtime and disposes its Worker on unmount', async () => {
    const runtimeWorker = createReadyWorker()
    mockCreateWorker.mockImplementationOnce(() => runtimeWorker.worker)
    const rendered = render(
      <WorkbookRuntimeProvider definition={DEFINITION}>
        <div>Ready workbook</div>
      </WorkbookRuntimeProvider>,
    )

    expect(await screen.findByText('Ready workbook')).toBeVisible()

    rendered.unmount()
    expect(runtimeWorker.terminate).toHaveBeenCalledTimes(1)
  })
})
