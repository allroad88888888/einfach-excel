import { createStore } from '@einfach/core'
import { describe, expect, test, vi, type Mock } from 'vitest'
import {
  activeWorkbookSheetAtom,
  disposeRustWorkbookRuntimeAtom,
  rustWorkbookConnectionAtom,
  selectionBoundsAtom,
  sheetTabsSheetsAtom,
  spreadsheetRuntimeAtom,
  startRustWorkbookRuntimeAtom,
  workbookDocumentAtom,
  workspaceSessionAtom,
  type RustWorkbookDefinition,
} from '../src'
import type { WorkerLike } from '../src/rust-worker'

interface TestWorker {
  readonly commands: string[]
  readonly payloads: Record<string, unknown>[]
  readonly terminate: Mock
  readonly worker: WorkerLike
}

function createRuntimeWorker(
  importFails = false,
  initializedSheets = [{ id: 'orders', index: 0, name: 'Orders' }],
): TestWorker {
  const commands: string[] = []
  const payloads: Record<string, unknown>[] = []
  const terminate = vi.fn()
  let onMessage: ((event: MessageEvent) => void) | undefined
  const worker: WorkerLike = {
    postMessage(message) {
      const request = message as {
        id: number
        command: string
        payload: Record<string, unknown>
      }
      commands.push(request.command)
      payloads.push(request.payload)
      const result =
        request.command === 'workbook.initialize'
          ? initializedSheets
          : {
              accepted: importFails ? 0 : (request.payload.cells as readonly unknown[]).length,
              formulas: 0,
              rejectedFormulas: 0,
              cleared: 0,
              errors: importFails ? 1 : 0,
            }
      onMessage?.({ data: { id: request.id, ok: true, result } } as MessageEvent)
    },
    addEventListener(type, listener) {
      if (type === 'message') onMessage = listener
    },
    removeEventListener() {},
    terminate,
  }
  return { commands, payloads, terminate, worker }
}

function workbookDefinition(): RustWorkbookDefinition {
  return {
    title: 'Sales Orders',
    sheets: [{ id: 'orders', name: 'Orders', rowCount: 2, colCount: 1 }],
    createImportChunks: () => [
      [
        { sheet: 0, row: 0, col: 0, kind: 'text', value: 'Order' },
        { sheet: 0, row: 1, col: 0, kind: 'text', value: 'SO-10001' },
      ],
    ],
  }
}

describe('Rust workbook runtime commands', () => {
  test('passes the complete frozen sheet metadata to the worker', async () => {
    const store = createStore()
    const testWorker = createRuntimeWorker()
    const definition = workbookDefinition()
    const sheet = {
      ...definition.sheets[0]!,
      hiddenRows: [1],
      hiddenColumns: [0],
      rowHeights: [{ rowIndex: 1, heightPx: 40 }],
      colWidths: [{ colIndex: 0, widthPx: 200 }],
    }
    await store.setter(startRustWorkbookRuntimeAtom, {
      definition: { ...definition, sheets: [sheet] },
      workerFactory: () => testWorker.worker,
    })
    expect(testWorker.payloads[0]).toEqual({ sheets: [sheet] })
    expect((testWorker.payloads[0]!.sheets as unknown[])[0]).not.toBe(sheet)
    store.setter(disposeRustWorkbookRuntimeAtom)
  })
  test('own initialization, metadata publication and disposal', async () => {
    const store = createStore()
    const testWorker = createRuntimeWorker()

    await store.setter(startRustWorkbookRuntimeAtom, {
      definition: workbookDefinition(),
      workerFactory: () => testWorker.worker,
    })

    expect(testWorker.commands).toEqual(['workbook.initialize', 'workbook.importCells'])
    expect(store.getter(spreadsheetRuntimeAtom)).toEqual({ status: 'ready' })
    expect(store.getter(rustWorkbookConnectionAtom)).not.toBeNull()
    expect(store.getter(workbookDocumentAtom).title).toBe('Sales Orders')
    expect(store.getter(activeWorkbookSheetAtom)).toMatchObject({
      id: 'orders',
      rowCount: 2,
      colCount: 1,
    })
    expect(store.getter(selectionBoundsAtom)).toEqual({ rowCount: 2, colCount: 1 })
    expect(store.getter(sheetTabsSheetsAtom)).toEqual([{ id: 'orders', index: 0, name: 'Orders' }])
    expect(store.getter(workspaceSessionAtom).activeSheetId).toBe('orders')

    store.setter(disposeRustWorkbookRuntimeAtom)

    expect(testWorker.terminate).toHaveBeenCalledTimes(1)
    expect(store.getter(spreadsheetRuntimeAtom)).toEqual({ status: 'loading' })
    expect(store.getter(rustWorkbookConnectionAtom)).toBeNull()
    expect(store.getter(workbookDocumentAtom).sheets).toEqual([])
  })

  test('publishes an import failure and releases the Worker', async () => {
    const store = createStore()
    const testWorker = createRuntimeWorker(true)

    await store.setter(startRustWorkbookRuntimeAtom, {
      definition: workbookDefinition(),
      workerFactory: () => testWorker.worker,
    })

    expect(store.getter(spreadsheetRuntimeAtom)).toEqual({
      status: 'error',
      message: 'Rust import accepted 0/2 cells',
    })
    expect(store.getter(rustWorkbookConnectionAtom)).toBeNull()
    expect(testWorker.terminate).toHaveBeenCalledTimes(1)
  })

  test('rejects a Rust workbook whose initialized sheets do not match the definition', async () => {
    const store = createStore()
    const testWorker = createRuntimeWorker(false, [])

    await store.setter(startRustWorkbookRuntimeAtom, {
      definition: workbookDefinition(),
      workerFactory: () => testWorker.worker,
    })

    expect(store.getter(spreadsheetRuntimeAtom)).toEqual({
      status: 'error',
      message: 'Rust initialized 0/1 sheets',
    })
    expect(testWorker.commands).toEqual(['workbook.initialize'])
    expect(testWorker.terminate).toHaveBeenCalledTimes(1)
  })

  test('rejects an unexpected Rust sheet before importing demo data', async () => {
    const store = createStore()
    const testWorker = createRuntimeWorker(false, [{ id: 'other', index: 0, name: 'Other' }])

    await store.setter(startRustWorkbookRuntimeAtom, {
      definition: workbookDefinition(),
      workerFactory: () => testWorker.worker,
    })

    expect(store.getter(spreadsheetRuntimeAtom)).toEqual({
      status: 'error',
      message: 'Rust initialized an unexpected sheet: other',
    })
    expect(testWorker.commands).toEqual(['workbook.initialize'])
    expect(testWorker.terminate).toHaveBeenCalledTimes(1)
  })
})
