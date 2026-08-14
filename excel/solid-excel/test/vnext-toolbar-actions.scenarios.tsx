/** @jsxImportSource solid-js */

import { expect, it, jest } from '@jest/globals'
import * as toolbar from './vnext-toolbar-test-support'

export function registerActionsScenarios(): void {
  it('renders Comment and Decimal-adjust toolbar buttons', () => {
    const store = toolbar.createStore()
    const backend = toolbar.createFakeBackend()

    store.setter(toolbar.setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    store.setter(toolbar.selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })

    const { container } = toolbar.render(() => (
      <toolbar.SpreadsheetUiProvider backend={backend} store={store}>
        <toolbar.SpreadsheetToolbar />
      </toolbar.SpreadsheetUiProvider>
    ))

    // The toolbar surfaces a Comment button alongside the existing history
    // group, plus a pair of Increase / Decrease Decimal buttons at the end
    // of the number-format group. Print Preview was removed for the Wave 5
    // Univer-parity layout (still reachable via menus); the explicit
    // negative check pins that contract.
    expect(container.querySelector('[data-testid="toolbar-btn-print-preview"]')).toBeNull()
    expect(container.querySelector('[data-testid="toolbar-btn-comment"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="toolbar-btn-inc-decimal"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="toolbar-btn-dec-decimal"]')).not.toBeNull()
  })

  it('single click on Format Painter arms the painter after the dblclick window', async () => {
    jest.useFakeTimers()
    const store = toolbar.createStore()
    const { backend } = toolbar.createRecordingBackend()

    store.setter(toolbar.setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    store.setter(toolbar.selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
    toolbar.seedVisibleProjection(store, {
      kind: 'visible-window',
      sheetId: 'sheet-1',
      requestId: 1,
      window: { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 4 },
      cells: [{ row: 0, col: 0, displayValue: '', valueKind: 'string', format: { bold: true } }],
    })

    const { container } = toolbar.render(() => (
      <toolbar.SpreadsheetUiProvider backend={backend} store={store}>
        <toolbar.SpreadsheetToolbar />
      </toolbar.SpreadsheetUiProvider>
    ))

    expect(store.getter(toolbar.formatPainterStateAtom)).toBe('idle')
    toolbar.fireEvent.click(toolbar.getButtons(container).painter)
    jest.advanceTimersByTime(250)
    expect(store.getter(toolbar.formatPainterStateAtom)).toBe('armed')
    jest.useRealTimers()
  })
}
