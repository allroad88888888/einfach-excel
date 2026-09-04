/** @jsxImportSource solid-js */

import { expect, it } from 'vitest'
import { cleanup } from '@solidjs/testing-library'
import * as toolbar from './vnext-toolbar-test-support'

export function registerNumberFormatScenarios(): void {
  it('closes the number-format dropdown on an outside pointer press', () => {
    const store = toolbar.createStore()
    const backend = toolbar.createFakeBackend()

    store.setter(toolbar.setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    store.setter(toolbar.selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })

    const { container } = toolbar.render(() => (
      <toolbar.SpreadsheetUiProvider backend={backend} store={store}>
        <toolbar.SpreadsheetToolbar />
      </toolbar.SpreadsheetUiProvider>
    ))

    toolbar.fireEvent.click(toolbar.getButtons(container).numberFormat)
    expect(document.body.querySelector('[data-testid="number-format-dropdown"]')).not.toBeNull()

    toolbar.fireEvent.mouseDown(document.body)

    expect(document.body.querySelector('[data-testid="number-format-dropdown"]')).toBeNull()
    expect(store.getter(toolbar.toolbarActiveSurfaceAtom)).toBeNull()
  })

  it('writes a toolbar number format to the selected row under an active filter', async () => {
    const store = toolbar.createStore()
    const { backend, setFormatRangeCalls } = toolbar.createRecordingBackend()

    store.setter(toolbar.setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    store.setter(toolbar.selectCellAtom, { sheetId: 'sheet-1', coord: { row: 5, col: 4 } })
    // A filter withheld every other row; row 5 is what the user sees AND the
    // row the engine must format (#27 — hidden, not compacted). The retired
    // compaction made this write land on source row 1 instead.
    toolbar.seedVisibleProjection(store, {
      kind: 'visible-window',
      sheetId: 'sheet-1',
      requestId: 1,
      window: { rowStart: 0, rowEnd: 8, colStart: 0, colEnd: 5 },
      cells: [
        {
          row: 5,
          col: 4,
          displayValue: '300',
          valueKind: 'number',
          format: {},
        },
      ],
    })

    const { container } = toolbar.render(() => (
      <toolbar.SpreadsheetUiProvider backend={backend} store={store}>
        <toolbar.SpreadsheetToolbar />
      </toolbar.SpreadsheetUiProvider>
    ))

    toolbar.fireEvent.click(toolbar.getButtons(container).percent)

    await toolbar.waitFor(() => expect(setFormatRangeCalls).toHaveLength(1))
    expect(setFormatRangeCalls[0]).toEqual({
      kind: 'set-format-range',
      sheetId: 'sheet-1',
      requestId: expect.any(Number),
      range: { rowStart: 5, rowEnd: 5, colStart: 4, colEnd: 4 },
      format: { numberFormat: { kind: 'percent', digits: 0 } },
    })
  })

  it('keeps the number-format dropdown clickable through a real mousedown after sorting', async () => {
    // Regression (T14): the toolbar's inline SortDropdown used to attach its
    // document-level mousedown dismiss listener in `onMount` for the whole
    // toolbar lifetime. After the sort dropdown had been opened once, its
    // `rootRef` pointed at a detached node, so a real mousedown on a
    // number-format item was judged "outside" and cleared the shared toolbar
    // surface between mousedown and click — the item unmounted before its
    // onClick could dispatch. Listeners are now attached only while each
    // popup is open.
    const store = toolbar.createStore()
    const sortedCells = [
      {
        row: 5,
        col: 4,
        displayValue: '300',
        valueKind: 'number' as const,
        format: {},
      },
    ]
    const setFormatRangeCalls: toolbar.SetFormatRangeRequest[] = []
    const sortRangeCalls: toolbar.SortRangeRequest[] = []
    const backend: toolbar.SpreadsheetBackend = {
      async readVisibleProjection(request) {
        return {
          kind: 'visible-window',
          sheetId: request.sheetId,
          requestId: request.requestId,
          revision: request.revision,
          window: { ...request.window },
          cells: sortedCells,
        }
      },
      async readRangeProjection() {
        throw new Error('not used')
      },
      async setCellInput() {
        throw new Error('not used')
      },
      async setFormatRange(request) {
        setFormatRangeCalls.push(request)
        return {
          kind: request.kind,
          sheetId: request.sheetId,
          requestId: request.requestId,
          revision: 2,
          affectedRange: { ...request.range },
        }
      },
      async setFilterSort(request) {
        return { sheetId: request.sheetId, requestId: request.requestId, revision: 4 }
      },
      // Sort is physical (#29) and capability-gated on this port (#24).
      async resolveDataEdge(request) {
        return {
          kind: 'resolve-data-edge',
          sheetId: request.sheetId,
          target: request.direction === 'down' ? { row: 7, col: 0 } : { row: 0, col: 5 },
        }
      },
      async sortRange(request) {
        sortRangeCalls.push(request)
        return {
          kind: 'sort-range',
          sheetId: request.sheetId,
          applied: true,
          movedRows: 2,
          movedCells: 8,
          affectedRange: request.range,
          requestId: request.requestId,
          revision: 5,
        }
      },
    }

    store.setter(toolbar.setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    store.setter(toolbar.selectCellAtom, { sheetId: 'sheet-1', coord: { row: 5, col: 4 } })
    toolbar.seedVisibleProjection(store, {
      kind: 'visible-window',
      sheetId: 'sheet-1',
      requestId: 1,
      window: { rowStart: 0, rowEnd: 8, colStart: 0, colEnd: 5 },
      cells: sortedCells,
    })

    const { container } = toolbar.render(() => (
      <toolbar.SpreadsheetUiProvider backend={backend} store={store}>
        <toolbar.SpreadsheetToolbar />
      </toolbar.SpreadsheetUiProvider>
    ))

    // Sort via the toolbar dropdown — opening it once is what used to arm the
    // stale-listener landmine.
    const sortButton = container.querySelector(
      '[data-testid="toolbar-btn-sort"]',
    ) as HTMLButtonElement
    await toolbar.waitFor(() => expect(sortButton.disabled).toBe(false))
    toolbar.fireEvent.click(sortButton)
    toolbar.fireEvent.click(
      document.body.querySelector('[data-testid="toolbar-sort-asc"]') as HTMLButtonElement,
    )
    await toolbar.waitFor(() =>
      expect(
        (
          document.body.querySelector(
            '[data-testid="sort-confirmation-confirm"]',
          ) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    )
    toolbar.fireEvent.click(
      document.body.querySelector('[data-testid="sort-confirmation-confirm"]') as HTMLButtonElement,
    )
    await toolbar.waitFor(() => expect(sortRangeCalls).toHaveLength(1))
    expect(sortRangeCalls[0]!.keys).toEqual([{ col: 4, direction: 'asc' }])

    toolbar.fireEvent.click(toolbar.getButtons(container).numberFormat)
    const percentItem = document.body.querySelector(
      '[data-testid="number-format-item-Percent"]',
    ) as HTMLButtonElement | null
    expect(percentItem).not.toBeNull()

    // A real pointer press hits document-level capture listeners before the
    // item's own click handler; the dropdown (and the item) must survive it.
    toolbar.fireEvent.mouseDown(percentItem!)
    expect(percentItem!.isConnected).toBe(true)
    expect(store.getter(toolbar.toolbarActiveSurfaceAtom)).toEqual({
      kind: 'dropdown',
      id: 'number-format',
    })

    toolbar.fireEvent.mouseUp(percentItem!)
    toolbar.fireEvent.click(percentItem!)

    await toolbar.waitFor(() => expect(setFormatRangeCalls).toHaveLength(1))
    // The write lands on the selected row itself — display row IS source row.
    expect(setFormatRangeCalls[0].range).toEqual({
      rowStart: 5,
      rowEnd: 5,
      colStart: 4,
      colEnd: 4,
    })
    expect(setFormatRangeCalls[0].format).toEqual({ numberFormat: { kind: 'percent', digits: 0 } })
    expect(document.body.querySelector('[data-testid="number-format-dropdown"]')).toBeNull()
  })

  it('renders the Custom row in the number-format dropdown without raw i18n keys', async () => {
    // Wave 5 dropped the per-kind submenu (currency / date-time / number) and
    // routes the Custom row to the full Format Cells dialog. The remaining
    // contract here is that the Custom row renders with a localised label and
    // no raw i18n keys in either supported locale.
    for (const locale of ['en', 'zh'] as const) {
      toolbar.setLocale(locale)
      const store = toolbar.createStore()
      const backend = toolbar.createFakeBackend()

      store.setter(toolbar.setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
      store.setter(toolbar.selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })

      const { container } = toolbar.render(() => (
        <toolbar.SpreadsheetUiProvider backend={backend} store={store}>
          <toolbar.SpreadsheetToolbar />
        </toolbar.SpreadsheetUiProvider>
      ))

      toolbar.fireEvent.click(toolbar.getButtons(container).numberFormat)
      const dropdown = document.body.querySelector('[data-testid="number-format-dropdown"]')
      expect(dropdown).not.toBeNull()
      expect(dropdown?.textContent ?? '').not.toMatch(toolbar.RAW_I18N_KEY_RE)

      const custom = document.body.querySelector(
        '[data-testid="number-format-item-Custom"]',
      ) as HTMLButtonElement | null
      expect(custom).not.toBeNull()
      expect((custom?.textContent ?? '').trim()).not.toBe('')
      expect(custom?.textContent ?? '').not.toMatch(toolbar.RAW_I18N_KEY_RE)

      // The dropdown no longer renders a nested submenu — the Custom row is a
      // plain item with no aria-haspopup and no submenu siblings.
      expect(custom?.getAttribute('aria-haspopup')).toBeNull()
      expect(document.body.querySelector('[data-testid="number-format-custom-submenu"]')).toBeNull()
      cleanup()
    }
  })
}
