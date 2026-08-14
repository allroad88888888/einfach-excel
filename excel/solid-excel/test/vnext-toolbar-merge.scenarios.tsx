/** @jsxImportSource solid-js */

import { expect, it } from '@jest/globals'
import * as toolbar from './vnext-toolbar-test-support'

export function registerMergeScenarios(): void {
  it('calls backend merge and unmerge ports for the current selection range', async () => {
    const store = toolbar.createStore()
    const { backend, mergeRangeCalls, unmergeRangeCalls, readVisibleProjectionCalls } =
      toolbar.createRecordingBackend()

    store.setter(toolbar.setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    store.setter(toolbar.selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
    store.setter(toolbar.selectCellAtom, {
      sheetId: 'sheet-1',
      coord: { row: 1, col: 1 },
      extend: true,
    })
    toolbar.seedVisibleProjection(store, {
      kind: 'visible-window',
      sheetId: 'sheet-1',
      requestId: 1,
      window: { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 4 },
      cells: [],
    })

    const { container } = toolbar.render(() => (
      <toolbar.SpreadsheetUiProvider backend={backend} store={store}>
        <toolbar.SpreadsheetToolbar />
      </toolbar.SpreadsheetUiProvider>
    ))

    let buttons = toolbar.getButtons(container)
    expect(buttons.merge.disabled).toBe(false)

    // Open the dropdown and click 合并居中. The dropdown body lives inside the
    // same toolbar root, so a single toolbar.fireEvent click on the anchor toggles it
    // open, then the menu item triggers the merge.
    toolbar.fireEvent.click(buttons.merge)
    const mergeCenterItem = buttons.mergeCenterItem()
    expect(mergeCenterItem).not.toBeNull()
    expect(mergeCenterItem!.disabled).toBe(false)
    expect(buttons.unmergeItem()?.disabled).toBe(true)
    toolbar.fireEvent.click(mergeCenterItem!)
    await toolbar.waitFor(() => {
      expect(mergeRangeCalls).toHaveLength(1)
    })
    expect(mergeRangeCalls[0]).toEqual({
      kind: 'merge-range',
      sheetId: 'sheet-1',
      requestId: expect.any(Number),
      range: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 },
    })
    await toolbar.waitFor(() => {
      expect(readVisibleProjectionCalls).toHaveLength(1)
      expect(store.getter(toolbar.toolbarMutationLifecycleAtom).status).toBe('ready')
    })

    // The fake backend doesn't mutate the projection. Inject a merge anchor at
    // A1 covering A1:B2 so the unmerge button becomes enabled, then click it.
    toolbar.seedVisibleProjection(store, {
      kind: 'visible-window',
      sheetId: 'sheet-1',
      requestId: 2,
      window: { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 4 },
      cells: [
        {
          row: 0,
          col: 0,
          displayValue: '',
          mergedSpan: { rows: 2, cols: 2 },
        },
      ],
    })

    buttons = toolbar.getButtons(container)
    toolbar.fireEvent.click(buttons.merge)
    const unmergeItem = buttons.unmergeItem()
    expect(unmergeItem).not.toBeNull()
    expect(unmergeItem!.disabled).toBe(false)
    toolbar.fireEvent.click(unmergeItem!)
    await toolbar.waitFor(() => {
      expect(unmergeRangeCalls).toHaveLength(1)
    })
    expect(unmergeRangeCalls[0]).toEqual({
      kind: 'unmerge-range',
      sheetId: 'sheet-1',
      requestId: expect.any(Number),
      range: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 },
    })
    expect(readVisibleProjectionCalls).toHaveLength(2)
  })

  it('clicking Merge with a multi-cell selection records a range.merge history entry', async () => {
    const store = toolbar.createStore()
    const { backend, mergeRangeCalls } = toolbar.createRecordingBackend()

    store.setter(toolbar.setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    store.setter(toolbar.selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
    store.setter(toolbar.selectCellAtom, {
      sheetId: 'sheet-1',
      coord: { row: 1, col: 1 },
      extend: true,
    })

    const { container } = toolbar.render(() => (
      <toolbar.SpreadsheetUiProvider backend={backend} store={store}>
        <toolbar.SpreadsheetToolbar />
      </toolbar.SpreadsheetUiProvider>
    ))

    const buttons = toolbar.getButtons(container)
    toolbar.fireEvent.click(buttons.merge)
    const mergeCenterItem = buttons.mergeCenterItem()
    expect(mergeCenterItem).not.toBeNull()
    toolbar.fireEvent.click(mergeCenterItem!)
    await toolbar.waitFor(() => expect(mergeRangeCalls).toHaveLength(1))
    await toolbar.waitFor(() =>
      expect(store.getter(toolbar.historyStackAtom).entries.length).toBe(1),
    )
    expect(store.getter(toolbar.historyStackAtom).entries[0].kind).toBe('range.merge')
  })
}
