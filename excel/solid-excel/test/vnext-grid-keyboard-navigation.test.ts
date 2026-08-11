import { describe, expect, it, jest } from '@jest/globals'
import { createStore } from '@einfach/core'
import type { SpreadsheetBackend } from '@einfach/spreadsheet-ui-core'
import {
  selectCellAtom,
  selectionSnapshotAtom,
  setSelectionAtom,
  setSelectionBoundsAtom,
  setViewportMetricsAtom,
  viewportMetricsAtom,
} from '@einfach/spreadsheet-ui-core'
import { installGridKeyboardController } from '../src-vnext/grid/grid-keyboard-controller'
import { createGridDomAdapter } from '../src-vnext/grid/grid-dom-adapter'

type KeyboardRuntime = Parameters<typeof installGridKeyboardController>[0]
type CellCoord = { row: number; col: number }

const SHEET_ID = 'sheet-1'
const VIEWPORT = {
  scrollTop: 0,
  scrollLeft: 0,
  viewportHeight: 3,
  viewportWidth: 4,
  rowHeight: 1,
  colWidth: 1,
  rowCount: 10,
  colCount: 8,
  overscanRows: 0,
  overscanCols: 0,
}

function setActiveCell(store: ReturnType<typeof createStore>, coord: CellCoord) {
  store.setter(setSelectionAtom, {
    kind: 'cell',
    sheetId: SHEET_ID,
    anchor: coord,
    focus: coord,
  })
}

function createKeyboardHarness() {
  const store = createStore()
  store.setter(setSelectionBoundsAtom, {
    rowCount: VIEWPORT.rowCount,
    colCount: VIEWPORT.colCount,
  })
  store.setter(setViewportMetricsAtom, VIEWPORT)
  setActiveCell(store, { row: 5, col: 3 })

  const moveSelectionToDataEdge = jest.fn(async (event: KeyboardEvent) => {
    event.preventDefault()
    store.setter(selectCellAtom, {
      sheetId: SHEET_ID,
      coord: { row: 9, col: 7 },
    })
    return true
  })
  const runtime = {
    props: { sheetId: SHEET_ID, viewport: VIEWPORT },
    store,
    backend: {
      resolveDataEdge: jest.fn(),
    } as unknown as SpreadsheetBackend,
    atoms: {},
    dom: createGridDomAdapter(),
    getKeyboardContextMenuInput: () => null,
    getDataEdgeDirection: (key: string) => {
      if (key === 'ArrowUp') return 'up' as const
      if (key === 'ArrowDown') return 'down' as const
      if (key === 'ArrowLeft') return 'left' as const
      if (key === 'ArrowRight') return 'right' as const
      return null
    },
    moveSelectionToDataEdge,
    selectionSnapshot: () => store.getter(selectionSnapshotAtom),
    startEditingCell: () => undefined,
    clearSelectionRange: async () => undefined,
    copySelectionToClipboard: async () => undefined,
    pasteFromClipboard: async () => undefined,
    toggleActiveFormatField: async () => undefined,
  }

  return {
    controller: installGridKeyboardController(runtime as unknown as KeyboardRuntime),
    moveSelectionToDataEdge,
    store,
  }
}

function keyboardEvent(key: string, options: KeyboardEventInit = {}) {
  return new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
    ...options,
  })
}

describe('vNext grid keyboard navigation controller', () => {
  const navigationCases = [
    {
      name: 'ArrowRight',
      initial: { row: 5, col: 3 },
      options: {},
      expected: { row: 5, col: 4 },
    },
    {
      name: 'PageDown',
      initial: { row: 2, col: 3 },
      options: {},
      expected: { row: 5, col: 3 },
    },
    {
      name: 'Home',
      initial: { row: 5, col: 3 },
      options: {},
      expected: { row: 5, col: 0 },
    },
    {
      name: 'End',
      initial: { row: 5, col: 3 },
      options: {},
      expected: { row: 5, col: 7 },
    },
    {
      name: 'Ctrl+Home',
      initial: { row: 5, col: 3 },
      options: { ctrlKey: true },
      expected: { row: 0, col: 0 },
    },
    {
      name: 'Ctrl+End',
      initial: { row: 5, col: 3 },
      options: { ctrlKey: true },
      expected: { row: 9, col: 7 },
    },
  ]

  for (const { name, initial, options, expected } of navigationCases) {
    it(`maps ${name} to the selection atom command`, async () => {
      const { controller, store } = createKeyboardHarness()
      setActiveCell(store, initial)
      const event = keyboardEvent(name.replace('Ctrl+', ''), options)

      await controller.handleGridKeyDown(event)

      expect(event.defaultPrevented).toBe(true)
      expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject(expected)
    })
  }

  it('extends the atom range for Shift+Arrow without changing the anchor', async () => {
    const { controller, store } = createKeyboardHarness()
    setActiveCell(store, { row: 3, col: 3 })

    await controller.handleGridKeyDown(keyboardEvent('ArrowDown', { shiftKey: true }))

    expect(store.getter(selectionSnapshotAtom).range).toEqual({
      rowStart: 3,
      rowEnd: 4,
      colStart: 3,
      colEnd: 3,
    })
  })

  it('scrolls the Atom viewport after Ctrl+Arrow reaches a data edge', async () => {
    const { controller, moveSelectionToDataEdge, store } = createKeyboardHarness()
    const event = keyboardEvent('ArrowRight', { ctrlKey: true })

    await controller.handleGridKeyDown(event)

    expect(moveSelectionToDataEdge).toHaveBeenCalledTimes(1)
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 9, col: 7 })
    expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 7, scrollLeft: 4 })
  })

  it('leaves text-editor and IME key events to their own scope', async () => {
    const { controller, store } = createKeyboardHarness()
    const editor = document.createElement('input')
    editor.addEventListener('keydown', (event) => {
      void controller.handleGridKeyDown(event)
    })
    const editorEvent = keyboardEvent('ArrowRight')

    editor.dispatchEvent(editorEvent)
    const composingEvent = keyboardEvent('ArrowRight')
    Object.defineProperty(composingEvent, 'isComposing', { value: true })
    await controller.handleGridKeyDown(composingEvent)

    expect(editorEvent.defaultPrevented).toBe(false)
    expect(composingEvent.defaultPrevented).toBe(false)
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 5, col: 3 })
  })
})
