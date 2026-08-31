import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { createStore } from '@einfach/core'
import {
  clipboardStateAtom,
  type MenuCommandIntent,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'

import { createContextMenuClipboardExecutor } from '../src/context-menu/context-menu-clipboard-executor'

class ClipboardItemMock {
  readonly types: readonly string[]

  constructor(readonly contents: Record<string, Blob>) {
    this.types = Object.keys(contents)
  }

  async getType(type: string): Promise<Blob> {
    return this.contents[type]
  }
}

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
const clipboardItemDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'ClipboardItem')
const execCommandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand')

afterEach(() => {
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
  else Reflect.deleteProperty(navigator, 'clipboard')
  if (clipboardItemDescriptor)
    Object.defineProperty(globalThis, 'ClipboardItem', clipboardItemDescriptor)
  else Reflect.deleteProperty(globalThis, 'ClipboardItem')
  if (execCommandDescriptor) Object.defineProperty(document, 'execCommand', execCommandDescriptor)
  else Reflect.deleteProperty(document, 'execCommand')
})

function installClipboard(clipboard: object) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard })
}

function createBackend() {
  const clearRange = jest.fn<NonNullable<SpreadsheetBackend['clearRange']>>(async (request) => ({
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision: request.revision,
    affectedRange: request.range,
  }))
  const setCellInput = jest.fn<SpreadsheetBackend['setCellInput']>(async (request) => ({
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision: request.revision,
    affectedRange: {
      rowStart: request.row,
      rowEnd: request.row,
      colStart: request.col,
      colEnd: request.col,
    },
  }))
  const backend: SpreadsheetBackend = {
    async readVisibleProjection(request) {
      return { ...request, kind: 'visible-window', cells: [] }
    },
    async readRangeProjection(request) {
      return {
        ...request,
        kind: 'range',
        cells: [
          { row: request.range.rowStart, col: request.range.colStart, displayValue: 'Ada' },
          {
            row: request.range.rowStart,
            col: request.range.colStart + 1,
            displayValue: '42',
          },
        ],
      }
    },
    setCellInput,
    clearRange,
  }
  return { backend, clearRange, setCellInput }
}

function intent(
  command: 'clipboard.copy' | 'clipboard.cut' | 'clipboard.paste',
): MenuCommandIntent {
  return {
    type: 'menu.command',
    command,
    surface: 'cell',
    target: {
      kind: 'range',
      sheetId: 'sheet-1',
      range: { rowStart: 2, rowEnd: 2, colStart: 1, colEnd: 2 },
    },
  }
}

describe('vNext context-menu browser clipboard transport', () => {
  it('writes a rich clipboard item while retaining the existing copy Atom lifecycle', async () => {
    const write = jest.fn(async (_items: readonly ClipboardItemMock[]) => undefined)
    installClipboard({ write })
    Object.defineProperty(globalThis, 'ClipboardItem', {
      configurable: true,
      value: ClipboardItemMock,
    })
    const store = createStore()
    const { backend } = createBackend()

    await createContextMenuClipboardExecutor({ store, backend }).execute(intent('clipboard.copy'))

    const item = write.mock.calls[0][0][0]
    expect(item.types).toEqual(['text/html', 'text/plain'])
    expect(store.getter(clipboardStateAtom)).toMatchObject({
      status: 'ready',
      intent: { type: 'clipboard.copy' },
      payload: { includesFormulas: false },
    })
  })

  it('reports copy and cut transport failures through the existing Atom without clearing cells', async () => {
    installClipboard({
      writeText: jest.fn(async () => Promise.reject(new Error('NotAllowedError'))),
    })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: () => false })
    const store = createStore()
    const { backend, clearRange, setCellInput } = createBackend()

    const executor = createContextMenuClipboardExecutor({ store, backend })
    await executor.execute(intent('clipboard.copy'))
    expect(store.getter(clipboardStateAtom)).toMatchObject({
      status: 'error',
      error: { code: 'BACKEND_ERROR', message: 'Clipboard write failed.' },
    })

    await executor.execute(intent('clipboard.cut'))

    expect(clearRange).not.toHaveBeenCalled()
    expect(setCellInput).not.toHaveBeenCalled()
    expect(store.getter(clipboardStateAtom)).toMatchObject({
      status: 'error',
      error: { code: 'BACKEND_ERROR', message: 'Clipboard write failed.' },
    })
  })

  it('reports a paste read failure through the existing Atom without a backend mutation', async () => {
    installClipboard({
      readText: jest.fn(async () => Promise.reject(new Error('NotAllowedError'))),
    })
    const store = createStore()
    const { backend, clearRange, setCellInput } = createBackend()

    await createContextMenuClipboardExecutor({ store, backend }).execute(intent('clipboard.paste'))

    expect(clearRange).not.toHaveBeenCalled()
    expect(setCellInput).not.toHaveBeenCalled()
    expect(store.getter(clipboardStateAtom)).toMatchObject({
      status: 'error',
      error: { code: 'BACKEND_ERROR', message: 'Clipboard read failed.' },
    })
  })
})
