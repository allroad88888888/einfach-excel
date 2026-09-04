/** @jsxImportSource solid-js */

import { expect, it } from 'vitest'
import * as toolbar from './vnext-toolbar-test-support'

export function registerTextStyleScenarios(): void {
  it('toggles bold off when the active cell is already bold', async () => {
    const store = toolbar.createStore()
    const { backend, setFormatRangeCalls } = toolbar.createRecordingBackend()

    store.setter(toolbar.setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    store.setter(toolbar.selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
    toolbar.seedVisibleProjection(store, {
      kind: 'visible-window',
      sheetId: 'sheet-1',
      requestId: 1,
      window: { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 4 },
      cells: [
        {
          row: 0,
          col: 0,
          displayValue: 'A1',
          valueKind: 'string',
          format: { bold: true },
        },
      ],
    })

    const { container } = toolbar.render(() => (
      <toolbar.SpreadsheetUiProvider backend={backend} store={store}>
        <toolbar.SpreadsheetToolbar />
      </toolbar.SpreadsheetUiProvider>
    ))

    const buttons = toolbar.getButtons(container)
    expect(buttons.bold.getAttribute('aria-pressed')).toBe('true')

    toolbar.fireEvent.click(buttons.bold)

    await toolbar.waitFor(() => expect(setFormatRangeCalls).toHaveLength(1))
    expect(setFormatRangeCalls[0].format).toEqual({ bold: false })
  })

  it('clicking Italic toggles italic on the active cell and pushes a history entry', async () => {
    const store = toolbar.createStore()
    const { backend, setFormatRangeCalls } = toolbar.createRecordingBackend()

    store.setter(toolbar.setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    store.setter(toolbar.selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
    toolbar.seedVisibleProjection(store, {
      kind: 'visible-window',
      sheetId: 'sheet-1',
      requestId: 1,
      window: { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 4 },
      cells: [{ row: 0, col: 0, displayValue: '', valueKind: 'string', format: {} }],
    })

    const { container } = toolbar.render(() => (
      <toolbar.SpreadsheetUiProvider backend={backend} store={store}>
        <toolbar.SpreadsheetToolbar />
      </toolbar.SpreadsheetUiProvider>
    ))

    toolbar.fireEvent.click(toolbar.getButtons(container).italic)

    await toolbar.waitFor(() => expect(setFormatRangeCalls).toHaveLength(1))
    expect(setFormatRangeCalls[0].format).toEqual({ italic: true })
    await toolbar.waitFor(() =>
      expect(store.getter(toolbar.historyStackAtom).entries.length).toBe(1),
    )
    expect(store.getter(toolbar.historyStackAtom).entries[0].kind).toBe('format.set')
  })

  it('clicking Underline toggles underline on the active cell', async () => {
    const store = toolbar.createStore()
    const { backend, setFormatRangeCalls } = toolbar.createRecordingBackend()

    store.setter(toolbar.setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    store.setter(toolbar.selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
    toolbar.seedVisibleProjection(store, {
      kind: 'visible-window',
      sheetId: 'sheet-1',
      requestId: 1,
      window: { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 4 },
      cells: [{ row: 0, col: 0, displayValue: '', valueKind: 'string', format: {} }],
    })

    const { container } = toolbar.render(() => (
      <toolbar.SpreadsheetUiProvider backend={backend} store={store}>
        <toolbar.SpreadsheetToolbar />
      </toolbar.SpreadsheetUiProvider>
    ))

    const buttons = toolbar.getButtons(container)
    expect(buttons.underline).not.toBeNull()
    expect(buttons.underline.disabled).toBe(false)
    toolbar.fireEvent.click(buttons.underline)

    await toolbar.waitFor(() => expect(setFormatRangeCalls).toHaveLength(1))
    expect(setFormatRangeCalls[0].format).toEqual({ underline: true })
  })
}
