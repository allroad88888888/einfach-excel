/** @jsxImportSource solid-js */

import { expect, it } from '@jest/globals'
import * as toolbar from './vnext-toolbar-test-support'

export function registerMutationScenarios(): void {
  it('dispatches toolbar.format.command intent when bold is clicked', () => {
    const store = toolbar.createStore()
    const backend = toolbar.createFakeBackend()

    store.setter(toolbar.setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    store.setter(toolbar.selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })

    const { container } = toolbar.render(() => (
      <toolbar.SpreadsheetUiProvider backend={backend} store={store}>
        <toolbar.SpreadsheetToolbar />
      </toolbar.SpreadsheetUiProvider>
    ))

    toolbar.fireEvent.click(
      container.querySelector('[data-testid="toolbar-btn-bold"]') as HTMLButtonElement,
    )

    expect(store.getter(toolbar.toolbarIntentAtom)).toEqual({
      type: 'toolbar.format.command',
      source: 'toolbar',
      sheetId: 'sheet-1',
      selectionKind: 'cell',
      command: 'bold',
      value: null,
    })
  })

  it('applies bold through backend setFormatRange and refreshes the visible projection', async () => {
    const store = toolbar.createStore()
    const { backend, setFormatRangeCalls, readVisibleProjectionCalls } =
      toolbar.createRecordingBackend()

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
          format: {},
        },
      ],
    })

    const { container } = toolbar.render(() => (
      <toolbar.SpreadsheetUiProvider backend={backend} store={store}>
        <toolbar.SpreadsheetToolbar />
      </toolbar.SpreadsheetUiProvider>
    ))

    toolbar.fireEvent.click(
      container.querySelector('[data-testid="toolbar-btn-bold"]') as HTMLButtonElement,
    )

    await toolbar.waitFor(() => {
      expect(setFormatRangeCalls).toHaveLength(1)
      expect(readVisibleProjectionCalls).toHaveLength(1)
    })
    expect(setFormatRangeCalls[0]).toEqual({
      kind: 'set-format-range',
      sheetId: 'sheet-1',
      requestId: expect.any(Number),
      range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
      format: { bold: true },
    })
    expect(readVisibleProjectionCalls[0]).toMatchObject({
      kind: 'visible-window',
      sheetId: 'sheet-1',
      reason: 'toolbar',
      window: { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 4 },
    })
    expect(
      store.getter(toolbar.spreadsheetProjectionSnapshotAtom).result?.cells[0]?.format,
    ).toEqual({
      bold: true,
    })
  })
}
