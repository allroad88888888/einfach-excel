import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import {
  acquireHistoryProducerReservationAtom,
  historyStackAtom,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'

import { installGridClipboard } from '../src/grid/grid-clipboard'
import { installGridEditingController } from '../src/grid/grid-editing-controller'
import { installGridFormatController } from '../src/grid/grid-format-controller'
import { spreadsheetProjectionSnapshotAtom } from '../src/provider'

const SHEET_ID = 'sheet-1'
const RANGE = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }

type HistoryCapability = 'full' | 'undo-only' | 'redo-only' | 'none'

function createBackend(capability: HistoryCapability, withImportCells = true) {
  const calls = { input: 0, clear: 0, import: 0, format: 0 }
  const backend: SpreadsheetBackend = {
    async readVisibleProjection(request) {
      return {
        kind: 'visible-window',
        sheetId: request.sheetId,
        requestId: request.requestId,
        window: request.window,
        cells: [],
      }
    },
    async readRangeProjection(request) {
      return {
        kind: 'range',
        sheetId: request.sheetId,
        requestId: request.requestId,
        range: request.range,
        cells: [],
      }
    },
    async setCellInput(request) {
      calls.input += 1
      return { sheetId: request.sheetId, revision: 11 }
    },
    async clearRange(request) {
      calls.clear += 1
      return { sheetId: request.sheetId, revision: 12, affectedRange: request.range }
    },
    async setFormatRange(request) {
      calls.format += 1
      return { sheetId: request.sheetId, revision: 14, affectedRange: request.range }
    },
  }
  if (withImportCells) {
    backend.importCells = async (request) => {
      calls.import += 1
      return { sheetId: request.sheetId, revision: 13, affectedRange: request.range }
    }
  }
  if (capability === 'full' || capability === 'undo-only') {
    backend.undoTransaction = async (request) => ({
      transactionId: request.transactionId,
      requestId: request.requestId,
      revision: 21,
    })
  }
  if (capability === 'full' || capability === 'redo-only') {
    backend.redoTransaction = async (request) => ({
      transactionId: request.transactionId,
      requestId: request.requestId,
      revision: 22,
    })
  }
  return { backend, calls }
}

function createRuntime(store: ReturnType<typeof createStore>, backend: SpreadsheetBackend) {
  let refreshCount = 0
  const selection = {
    kind: 'cell' as const,
    sheetId: SHEET_ID,
    anchor: { row: 0, col: 0 },
    focus: { row: 0, col: 0 },
  }
  return {
    props: { sheetId: SHEET_ID, viewport: { rowCount: 3, colCount: 3 } },
    store,
    backend,
    selectionRegions: () => [selection],
    getSelectionBounds: () => ({ rowCount: 3, colCount: 3 }),
    focusGrid: () => undefined,
    selectionSnapshot: () => ({
      selection,
      activeCell: { sheetId: SHEET_ID, row: 0, col: 0 },
      range: RANGE,
    }),
    projectionSnapshot: () => ({ result: undefined }),
    requestProjection: () => undefined,
    loadProjection: async () => {
      refreshCount += 1
    },
    readRangeProjection: async () => null,
    clearSelectionRange: async () => undefined,
    refreshCount: () => refreshCount,
  }
}

let restoreClipboard: (() => void) | undefined

afterEach(() => {
  restoreClipboard?.()
  restoreClipboard = undefined
})

function setClipboardText(text: string) {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { readText: async () => text },
  })
  restoreClipboard = () => {
    if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor)
    else Reflect.deleteProperty(navigator, 'clipboard')
  }
}

function blockHistoryProducer(store: ReturnType<typeof createStore>) {
  const reservation = store.setter(acquireHistoryProducerReservationAtom)
  if (reservation === null)
    throw new Error('expected the test to reserve the history producer lane')
}

function expectUnknownHistoryOutcome(
  store: ReturnType<typeof createStore>,
  runtime: ReturnType<typeof createRuntime>,
) {
  expect(store.getter(historyStackAtom).entries).toEqual([])
  expect(runtime.refreshCount()).toBe(0)
  expect(store.getter(spreadsheetProjectionSnapshotAtom)).toMatchObject({
    status: 'error',
    error: { message: expect.stringContaining('could not be recorded in history') },
  })
}

describe('grid history producer guard', () => {
  it('records a full-capability range clear', async () => {
    const store = createStore()
    const { backend, calls } = createBackend('full')
    const runtime = createRuntime(store, backend)
    const controller = installGridEditingController(runtime as never)

    await expect(controller.clearSelectionRange()).resolves.toBeUndefined()

    expect(calls.clear).toBe(1)
    expect(runtime.refreshCount()).toBe(1)
    expect(store.getter(historyStackAtom).entries).toMatchObject([
      {
        kind: 'range.clear',
        sheetId: SHEET_ID,
        projectionRevision: 12,
        affectedRange: RANGE,
      },
    ])
  })

  it('records a full-capability single-cell values clear', async () => {
    const store = createStore()
    const { backend, calls } = createBackend('full')
    const runtime = createRuntime(store, backend)
    const controller = installGridEditingController(runtime as never)

    await controller.clearSelectionRange('values')

    expect(calls.input).toBe(1)
    expect(runtime.refreshCount()).toBe(1)
    expect(store.getter(historyStackAtom).entries[0]).toMatchObject({ kind: 'cell.set-input' })
  })

  it('records a full-capability clipboard import', async () => {
    const store = createStore()
    const { backend, calls } = createBackend('full')
    const runtime = createRuntime(store, backend)
    const controller = installGridClipboard(runtime as never)
    setClipboardText('paste value')

    await controller.pasteFromClipboard()

    expect(calls.import).toBe(1)
    expect(runtime.refreshCount()).toBe(1)
    expect(store.getter(historyStackAtom).entries[0]).toMatchObject({ kind: 'cells.import' })
  })

  it('records a full-capability clipboard cell-write fallback', async () => {
    const store = createStore()
    const { backend, calls } = createBackend('full', false)
    const runtime = createRuntime(store, backend)
    const controller = installGridClipboard(runtime as never)
    setClipboardText('paste value')

    await controller.pasteFromClipboard()

    expect(calls.input).toBe(1)
    expect(runtime.refreshCount()).toBe(1)
    expect(store.getter(historyStackAtom).entries[0]).toMatchObject({ kind: 'cell.set-input' })
  })

  it('records a full-capability format change', async () => {
    const store = createStore()
    const { backend, calls } = createBackend('full')
    const runtime = createRuntime(store, backend)
    const controller = installGridFormatController(runtime as never)

    await controller.toggleActiveFormatField('bold')

    expect(calls.format).toBe(1)
    expect(runtime.refreshCount()).toBe(1)
    expect(store.getter(historyStackAtom).entries[0]).toMatchObject({ kind: 'format.set' })
  })

  it('keeps an acknowledged editing mutation successful without an undo-only history contract', async () => {
    const store = createStore()
    const { backend, calls } = createBackend('undo-only')
    const controller = installGridEditingController(createRuntime(store, backend) as never)

    await controller.clearSelectionRange()

    expect(calls.clear).toBe(1)
    expect(store.getter(historyStackAtom).entries).toEqual([])
  })

  it('keeps an acknowledged clipboard import successful without a history contract', async () => {
    const store = createStore()
    const { backend, calls } = createBackend('none')
    const runtime = createRuntime(store, backend)
    const controller = installGridClipboard(runtime as never)
    setClipboardText('paste value')

    await controller.pasteFromClipboard()

    expect(calls.import).toBe(1)
    expect(runtime.refreshCount()).toBe(1)
    expect(store.getter(historyStackAtom).entries).toEqual([])
  })

  it('keeps an acknowledged format mutation successful without a redo-only history contract', async () => {
    const store = createStore()
    const { backend, calls } = createBackend('redo-only')
    const runtime = createRuntime(store, backend)
    const controller = installGridFormatController(runtime as never)

    await controller.toggleActiveFormatField('bold')

    expect(calls.format).toBe(1)
    expect(runtime.refreshCount()).toBe(1)
    expect(store.getter(historyStackAtom).entries).toEqual([])
  })

  it('treats rejected editing history as an unknown outcome', async () => {
    const store = createStore()
    const { backend, calls } = createBackend('full')
    const runtime = createRuntime(store, backend)
    blockHistoryProducer(store)

    await installGridEditingController(runtime as never).clearSelectionRange()

    expect(calls.clear).toBe(1)
    expectUnknownHistoryOutcome(store, runtime)
  })

  it('treats rejected clipboard history as an unknown outcome', async () => {
    const store = createStore()
    const { backend, calls } = createBackend('full')
    const runtime = createRuntime(store, backend)
    blockHistoryProducer(store)
    setClipboardText('paste value')

    await installGridClipboard(runtime as never).pasteFromClipboard()

    expect(calls.import).toBe(1)
    expectUnknownHistoryOutcome(store, runtime)
  })

  it('treats rejected format history as an unknown outcome', async () => {
    const store = createStore()
    const { backend, calls } = createBackend('full')
    const runtime = createRuntime(store, backend)
    blockHistoryProducer(store)

    await installGridFormatController(runtime as never).toggleActiveFormatField('bold')

    expect(calls.format).toBe(1)
    expectUnknownHistoryOutcome(store, runtime)
  })
})
