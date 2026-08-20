/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from '@jest/globals'
import { cleanup, fireEvent, render } from '@solidjs/testing-library'
import { createStore } from '@einfach/core'
import {
  sheetTabsAtom,
  workspaceSessionAtom,
  type SpreadsheetBackend,
  type SpreadsheetSheetMetadata,
} from '@einfach/spreadsheet-ui-core'

import { SpreadsheetSheetTabs } from '../src-vnext/sheet-tabs'
import { SpreadsheetUiProvider } from '../src-vnext/provider'

afterEach(cleanup)

const sheets: SpreadsheetSheetMetadata[] = [
  { id: 'sheet-1', name: 'Sheet One', index: 0 },
  { id: 'sheet-2', name: 'Sheet Two', index: 1 },
  { id: 'sheet-3', name: 'Sheet Three', index: 2 },
]

function createBackend(listSheets = async () => ({ revision: 0, sheets })): SpreadsheetBackend {
  return {
    listSheets,
    async renameSheet(request) {
      return {
        requestId: request.requestId,
        sheetId: request.sheetId,
        activeSheetId: request.sheetId,
        revision: 1,
        sheets: sheets.map((sheet) =>
          sheet.id === request.sheetId ? { ...sheet, name: request.name } : sheet,
        ),
      }
    },
    async reorderSheet(request) {
      return {
        requestId: request.requestId,
        sheetId: request.sheetId,
        activeSheetId: request.sheetId,
        revision: 1,
        sheets,
      }
    },
    async readVisibleProjection() {
      throw new Error('not used')
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    async setCellInput() {
      throw new Error('not used')
    },
  }
}

async function flushAsyncWork() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function renderSheetTabs(store = createStore(), backend = createBackend()) {
  const view = render(() => (
    <SpreadsheetUiProvider backend={backend} store={store}>
      <SpreadsheetSheetTabs sheets={sheets} />
    </SpreadsheetUiProvider>
  ))
  return { ...view, store }
}

describe('vNext SpreadsheetSheetTabs keyboard interaction', () => {
  it('moves the roving focus and active sheet through the ordered tab list', async () => {
    const { getByRole, store } = renderSheetTabs()
    await flushAsyncWork()

    const first = getByRole('tab', { name: 'Sheet One' })
    const second = getByRole('tab', { name: 'Sheet Two' })
    const third = getByRole('tab', { name: 'Sheet Three' })
    expect(first.getAttribute('aria-selected')).toBe('true')
    expect(first.getAttribute('tabindex')).toBe('0')
    expect(second.getAttribute('aria-selected')).toBe('false')
    expect(second.getAttribute('tabindex')).toBe('-1')

    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(store.getter(workspaceSessionAtom).activeSheetId).toBe('sheet-2')
    expect(document.activeElement).toBe(second)
    expect(second.getAttribute('tabindex')).toBe('0')

    fireEvent.keyDown(second, { key: 'End' })
    expect(store.getter(workspaceSessionAtom).activeSheetId).toBe('sheet-3')
    expect(document.activeElement).toBe(third)

    fireEvent.keyDown(third, { key: 'ArrowRight' })
    expect(store.getter(workspaceSessionAtom).activeSheetId).toBe('sheet-1')
    expect(document.activeElement).toBe(first)
  })

  it('keeps keyboard rename and menu escape paths inside Sheet Tabs atoms', async () => {
    const { getByRole, queryByRole, store } = renderSheetTabs()
    await flushAsyncWork()

    const first = getByRole('tab', { name: 'Sheet One' })
    first.focus()
    fireEvent.keyDown(first, { key: 'F2' })
    const editor = getByRole('textbox')
    await flushAsyncWork()
    expect(store.getter(sheetTabsAtom).rename).toEqual({
      sheetId: 'sheet-1',
      draftName: 'Sheet One',
      source: 'keyboard',
    })
    expect(document.activeElement).toBe(editor)

    fireEvent.keyDown(editor, { key: 'Escape' })
    expect(store.getter(sheetTabsAtom).rename).toBeNull()
    await flushAsyncWork()
    const restoredFirst = getByRole('tab', { name: 'Sheet One' })
    expect(document.activeElement).toBe(restoredFirst)

    fireEvent.keyDown(restoredFirst, { key: 'ContextMenu' })
    await flushAsyncWork()
    expect(getByRole('menu')).toBeTruthy()
    expect(document.activeElement).toBe(getByRole('menuitem', { name: 'Rename' }))

    fireEvent.keyDown(document, { key: 'Escape' })
    await flushAsyncWork()
    expect(queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(restoredFirst)
  })

  it('cancels the pointer reorder session when its handle loses the pointer stream', async () => {
    const { getByRole, store } = renderSheetTabs()
    await flushAsyncWork()

    // 拖页签本体:down 不进 reorder,越过 4px 阈值的 move 才进。
    const handle = getByRole('tab', { name: 'Sheet One' })
    // jsdom 没有 elementFromPoint;返回 null = 本次 move 无落点,不影响会话。
    const originalElementFromPoint = document.elementFromPoint
    document.elementFromPoint = () => null
    try {
      fireEvent.pointerDown(handle, { pointerId: 4, clientX: 10, clientY: 10 })
      expect(store.getter(sheetTabsAtom).reorder).toBeNull()
      fireEvent.pointerMove(window, { pointerId: 4, clientX: 30, clientY: 10 })
      expect(store.getter(sheetTabsAtom).reorder?.sheetId).toBe('sheet-1')
    } finally {
      document.elementFromPoint = originalElementFromPoint
    }

    fireEvent.pointerCancel(handle, { pointerId: 4 })
    expect(store.getter(sheetTabsAtom).reorder).toBeNull()
    expect(store.getter(sheetTabsAtom).lastIntent).toEqual({
      type: 'sheet-tab.reorder.cancel',
      sheetId: 'sheet-1',
      reason: 'blur',
    })
  })

  it('disposes the UI session before a pending live-list response can settle', async () => {
    const store = createStore()
    let resolveList:
      | ((result: { revision: number; sheets: SpreadsheetSheetMetadata[] }) => void)
      | undefined
    const backend = createBackend(
      () => new Promise((resolve) => {
        resolveList = resolve
      }),
    )
    const { unmount } = renderSheetTabs(store, backend)

    expect(store.getter(sheetTabsAtom).phase).toBe('loading')
    unmount()
    expect(store.getter(sheetTabsAtom).phase).toBe('unloaded')

    resolveList?.({ revision: 1, sheets })
    await flushAsyncWork()
    expect(store.getter(sheetTabsAtom).phase).toBe('unloaded')
  })
})
