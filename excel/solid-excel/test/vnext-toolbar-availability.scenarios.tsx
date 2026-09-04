/** @jsxImportSource solid-js */

import { expect, it } from 'vitest'
import * as toolbar from './vnext-toolbar-test-support'

export function registerAvailabilityScenarios(): void {
  it('enables format buttons for selected cell and range', () => {
    const store = toolbar.createStore()
    const backend = toolbar.createFakeBackend()

    store.setter(toolbar.setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    store.setter(toolbar.selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })

    const { container } = toolbar.render(() => (
      <toolbar.SpreadsheetUiProvider backend={backend} store={store}>
        <toolbar.SpreadsheetToolbar />
      </toolbar.SpreadsheetUiProvider>
    ))

    const buttons = toolbar.getButtons(container)
    expect(buttons.bold.disabled).toBe(false)
    expect(buttons.italic.disabled).toBe(false)
    expect(buttons.fillColor.disabled).toBe(false)
    expect(buttons.textColor.disabled).toBe(false)
    expect(buttons.numberFormat.disabled).toBe(false)
    // toolbar.createFakeBackend omits mergeRange so the dropdown anchor button is
    // disabled — there is no merge surface to expose.
    expect(buttons.merge.disabled).toBe(true)

    store.setter(toolbar.selectCellAtom, {
      sheetId: 'sheet-1',
      coord: { row: 2, col: 2 },
      extend: true,
    })

    expect(buttons.bold.disabled).toBe(false)
    expect(buttons.italic.disabled).toBe(false)
    expect(buttons.fillColor.disabled).toBe(false)
    expect(buttons.textColor.disabled).toBe(false)
    expect(buttons.numberFormat.disabled).toBe(false)
    // Still no mergeRange port on the fake backend.
    expect(buttons.merge.disabled).toBe(true)
    // Find/Replace is not an actionable entrypoint without searchRange.
    expect(buttons.findReplace.disabled).toBe(true)
  })

  it('opens Find from the toolbar with a search-only backend', async () => {
    const store = toolbar.createStore()
    const backend: toolbar.SpreadsheetBackend = {
      ...toolbar.createFakeBackend(),
      async searchRange(request) {
        return {
          kind: 'search-range',
          sheetId: request.sheetId,
          requestId: request.requestId,
          revision: request.revision,
          matches: [],
          pageStart: request.pageStart,
          totalCount: 0,
        }
      },
    }
    store.setter(toolbar.setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })

    const { container } = toolbar.render(() => (
      <toolbar.SpreadsheetUiProvider backend={backend} store={store}>
        <toolbar.SpreadsheetToolbar />
      </toolbar.SpreadsheetUiProvider>
    ))

    const button = toolbar.getButtons(container).findReplace
    await toolbar.waitFor(() => expect(button.disabled).toBe(false))
    expect(button.getAttribute('data-capability')).toBe('find-only')
    toolbar.fireEvent.click(button)
    expect(store.getter(toolbar.findReplaceOpenAtom)).toBe(true)
  })

  it('disables formatting commands while editing is drafting', () => {
    const store = toolbar.createStore()
    const backend = toolbar.createFakeBackend()

    store.setter(toolbar.setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    store.setter(toolbar.selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
    store.setter(toolbar.startEditingAtom, {
      sheetId: 'sheet-1',
      cell: { row: 0, col: 0 },
      draft: '=1+1',
      source: 'formula-bar',
    })

    const { container } = toolbar.render(() => (
      <toolbar.SpreadsheetUiProvider backend={backend} store={store}>
        <toolbar.SpreadsheetToolbar />
      </toolbar.SpreadsheetUiProvider>
    ))

    const buttons = toolbar.getButtons(container)
    expect(buttons.bold.disabled).toBe(true)
    expect(buttons.italic.disabled).toBe(true)
    expect(buttons.fillColor.disabled).toBe(true)
    expect(buttons.textColor.disabled).toBe(true)
    expect(buttons.numberFormat.disabled).toBe(true)
    // Drafting also gates the merge dropdown's anchor button.
    expect(buttons.merge.disabled).toBe(true)
  })

  it('disables format buttons under Excel sheet editing protection for a locked cell', () => {
    const store = toolbar.createStore()
    const backend = toolbar.createFakeBackend()

    store.setter(toolbar.setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    store.setter(toolbar.selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
    store.setter(toolbar.setSheetProtectionAtom, {
      sheetId: 'sheet-1',
      state: { mode: 'protected', unlockedRanges: [] },
    })

    const { container } = toolbar.render(() => (
      <toolbar.SpreadsheetUiProvider backend={backend} store={store}>
        <toolbar.SpreadsheetToolbar />
      </toolbar.SpreadsheetUiProvider>
    ))

    const buttons = toolbar.getButtons(container)
    expect(buttons.bold.disabled).toBe(true)
    expect(buttons.italic.disabled).toBe(true)
    expect(buttons.fillColor.disabled).toBe(true)
    expect(buttons.textColor.disabled).toBe(true)
    expect(buttons.numberFormat.disabled).toBe(true)
    // Excel editing protection disables the merge dropdown anchor button.
    expect(buttons.merge.disabled).toBe(true)
  })
}
