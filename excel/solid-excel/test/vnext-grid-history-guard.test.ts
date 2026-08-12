import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { historyStackAtom, type SpreadsheetBackend } from '@einfach/spreadsheet-ui-core'

import { installGridClipboard } from '../src-vnext/grid/grid-clipboard'
import { installGridEditingController } from '../src-vnext/grid/grid-editing-controller'
import { installGridFormatController } from '../src-vnext/grid/grid-format-controller'

const SHEET_ID = 'sheet-1'
const RANGE = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }

type HistoryCapability = 'full' | 'undo-only' | 'redo-only' | 'none'

function createBackend(capability: HistoryCapability) {
  const calls = { clear: 0, import: 0, format: 0 }
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
      return { sheetId: request.sheetId, revision: 11 }
    },
    async clearRange(request) {
      calls.clear += 1
      return { sheetId: request.sheetId, revision: 12, affectedRange: request.range }
    },
    async importCells(request) {
      calls.import += 1
      return { sheetId: request.sheetId, revision: 13, affectedRange: request.range }
    },
    async setFormatRange(request) {
      calls.format += 1
      return { sheetId: request.sheetId, revision: 14, affectedRange: request.range }
    },
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

describe('grid history producer guard', () => {
  it('records an acknowledged editing mutation only with full undo and redo support', async () => {
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

  it('keeps an acknowledged clipboard import successful without an undo-only history contract', async () => {
    const store = createStore()
    const { backend, calls } = createBackend('undo-only')
    const runtime = createRuntime(store, backend)
    const controller = installGridClipboard(runtime as never)
    setClipboardText('paste value')

    await expect(controller.pasteFromClipboard()).resolves.toBeUndefined()

    expect(calls.import).toBe(1)
    expect(runtime.refreshCount()).toBe(1)
    expect(store.getter(historyStackAtom).entries).toEqual([])
  })

  it('keeps an acknowledged format mutation successful without a redo-only history contract', async () => {
    const store = createStore()
    const { backend, calls } = createBackend('redo-only')
    const runtime = createRuntime(store, backend)
    const controller = installGridFormatController(runtime as never)

    await expect(controller.toggleActiveFormatField('bold')).resolves.toBeUndefined()

    expect(calls.format).toBe(1)
    expect(runtime.refreshCount()).toBe(1)
    expect(store.getter(historyStackAtom).entries).toEqual([])
  })

  it('keeps an acknowledged clipboard import successful when neither history port exists', async () => {
    const store = createStore()
    const { backend, calls } = createBackend('none')
    const runtime = createRuntime(store, backend)
    const controller = installGridClipboard(runtime as never)
    setClipboardText('paste value')

    await expect(controller.pasteFromClipboard()).resolves.toBeUndefined()

    expect(calls.import).toBe(1)
    expect(runtime.refreshCount()).toBe(1)
    expect(store.getter(historyStackAtom).entries).toEqual([])
  })
})
