/** @jsxImportSource solid-js */

import { expect, it } from 'vitest'
import * as toolbar from './vnext-toolbar-test-support'

export function registerFormatCellsScenarios(): void {
  it('uses the Core active surface as the single authority for all dropdowns and palettes', async () => {
    const store = toolbar.createStore()
    const { backend } = toolbar.createRecordingBackend()

    store.setter(toolbar.setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    store.setter(toolbar.selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })

    const { container } = toolbar.render(() => (
      <toolbar.SpreadsheetUiProvider backend={backend} store={store}>
        <toolbar.SpreadsheetToolbar />
      </toolbar.SpreadsheetUiProvider>
    ))

    const surfaceCases = [
      {
        buttonTestId: 'toolbar-btn-h-align',
        surface: { kind: 'dropdown', id: 'alignment' },
        panelTestId: 'toolbar-h-align-dropdown',
      },
      {
        buttonTestId: 'toolbar-btn-v-align',
        surface: { kind: 'dropdown', id: 'vertical-alignment' },
        panelTestId: 'toolbar-v-align-dropdown',
      },
      {
        buttonTestId: 'toolbar-btn-number-format',
        surface: { kind: 'dropdown', id: 'number-format' },
        panelTestId: 'number-format-dropdown',
      },
      {
        buttonTestId: 'toolbar-btn-borders',
        surface: { kind: 'dropdown', id: 'border' },
        panelTestId: 'toolbar-borders-dropdown',
      },
      {
        buttonTestId: 'toolbar-btn-merge',
        surface: { kind: 'dropdown', id: 'merge' },
        panelTestId: 'toolbar-merge-dropdown',
      },
      {
        buttonTestId: 'toolbar-btn-font-family',
        surface: { kind: 'dropdown', id: 'font-family' },
        panelTestId: 'toolbar-font-family-dropdown',
      },
      {
        buttonTestId: 'toolbar-btn-font-size',
        surface: { kind: 'dropdown', id: 'font-size' },
        panelTestId: 'toolbar-font-size-dropdown',
      },
      {
        buttonTestId: 'toolbar-btn-rotation',
        surface: { kind: 'dropdown', id: 'rotation' },
        panelTestId: 'toolbar-rotation-dropdown',
      },
      {
        buttonTestId: 'toolbar-btn-sort',
        surface: { kind: 'dropdown', id: 'sort' },
        panelTestId: 'toolbar-sort-dropdown',
      },
      {
        buttonTestId: 'toolbar-btn-text-color',
        surface: { kind: 'palette', id: 'text-color' },
        panelTestId: 'toolbar-color-popover',
        paletteMode: 'text',
      },
      {
        buttonTestId: 'toolbar-btn-fill-color',
        surface: { kind: 'palette', id: 'fill-color' },
        panelTestId: 'toolbar-color-popover',
        paletteMode: 'fill',
      },
    ] as const

    const buttons = surfaceCases.map(({ buttonTestId }) => {
      const button = container.querySelector(
        `[data-testid="${buttonTestId}"]`,
      ) as HTMLButtonElement | null
      expect(button).not.toBeNull()
      return button!
    })

    const sortButton = buttons[surfaceCases.findIndex(({ surface }) => surface.id === 'sort')]
    await toolbar.waitFor(() => expect(sortButton.disabled).toBe(false))

    for (const [index, surfaceCase] of surfaceCases.entries()) {
      const button = buttons[index]
      expect(button.disabled).toBe(false)
      toolbar.fireEvent.click(button)

      await toolbar.waitFor(() => {
        expect(store.getter(toolbar.toolbarActiveSurfaceAtom)).toEqual(surfaceCase.surface)
        expect(
          document.body.querySelector(`[data-testid="${surfaceCase.panelTestId}"]`),
        ).not.toBeNull()
      })

      for (const [buttonIndex, candidate] of buttons.entries()) {
        expect(candidate.getAttribute('aria-expanded')).toBe(
          buttonIndex === index ? 'true' : 'false',
        )
      }

      const palette = document.body.querySelector(
        '[data-testid="toolbar-color-popover"]',
      ) as HTMLElement | null
      if ('paletteMode' in surfaceCase) {
        expect(palette?.dataset.mode).toBe(surfaceCase.paletteMode)
      } else {
        expect(palette).toBeNull()
      }
    }

    toolbar.fireEvent.click(buttons.at(-1)!)
    await toolbar.waitFor(() => {
      expect(store.getter(toolbar.toolbarActiveSurfaceAtom)).toBeNull()
      expect(document.body.querySelector('[data-testid="toolbar-color-popover"]')).toBeNull()
    })
    for (const button of buttons) {
      expect(button.getAttribute('aria-expanded')).toBe('false')
    }
  })

  it('opens the Format Cells dialog from the Custom number-format row', async () => {
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
    const custom = document.body.querySelector(
      '[data-testid="number-format-item-Custom"]',
    ) as HTMLButtonElement | null
    expect(custom).not.toBeNull()
    toolbar.fireEvent.click(custom!)

    await toolbar.waitFor(() => {
      const state = store.getter(toolbar.formatCellsEditorAtom)
      if (state.status !== 'open') throw new Error('Format Cells dialog did not open')
      // The Custom row routes to the Number tab on first open so users land
      // where the dropdown left them.
      expect(state.activeTab).toBe('number')
      expect(state.range).toEqual({ rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 })
    })

    // The lightweight per-kind dialog must NOT open along the new path.
    const lightweight = store.getter(toolbar.numberFormatDialogAtom)
    expect(lightweight.status).toBe('closed')
  })

  // Regression for the format-wiping defect: opening Format Cells with no
  // edits and saving must not erase the active cell's existing number
  // format. The toolbar entry point already passed `initialFormat` before
  // this fix (unlike the menu bar and grid Ctrl+1 entry points), so this
  // test locks in the toolbar's correct behavior against the shared
  // `activeCellFormatAtom` selector introduced to fix the other two.

  it('regression: Custom number-format row preserves the active cell format on an unedited save', async () => {
    const store = toolbar.createStore()
    const setFormatRangeCalls: toolbar.SetFormatRangeRequest[] = []
    const backend: toolbar.SpreadsheetBackend = {
      async readVisibleProjection(request) {
        return {
          kind: 'visible-window',
          sheetId: request.sheetId,
          requestId: request.requestId,
          window: { ...request.window },
          cells: [
            {
              row: 0,
              col: 0,
              displayValue: '120.000',
              valueKind: 'number',
              numericValue: 120,
              format: { numberFormat: { kind: 'decimal', digits: 3 } },
            },
          ],
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
    }

    store.setter(toolbar.setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    store.setter(toolbar.selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
    toolbar.seedVisibleProjection(store, {
      kind: 'visible-window',
      sheetId: 'sheet-1',
      requestId: 1,
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 9 },
      cells: [
        {
          row: 0,
          col: 0,
          displayValue: '120.000',
          valueKind: 'number',
          numericValue: 120,
          format: { numberFormat: { kind: 'decimal', digits: 3 } },
        },
      ],
    })

    const { container } = toolbar.render(() => (
      <toolbar.SpreadsheetUiProvider backend={backend} store={store}>
        <toolbar.SpreadsheetToolbar />
        <toolbar.SpreadsheetFormatCellsDialog />
      </toolbar.SpreadsheetUiProvider>
    ))

    toolbar.fireEvent.click(toolbar.getButtons(container).numberFormat)
    const custom = document.body.querySelector(
      '[data-testid="number-format-item-Custom"]',
    ) as HTMLButtonElement | null
    expect(custom).not.toBeNull()
    toolbar.fireEvent.click(custom!)

    // The dialog's category radio must reflect the cell's real category
    // ('decimal' -> 'number'), not fall back to 'general'.
    await toolbar.waitFor(() => {
      expect(
        (
          document.body.querySelector(
            '[data-testid="format-cells-category-number"]',
          ) as HTMLInputElement | null
        )?.checked,
      ).toBe(true)
    })
    expect(
      (
        document.body.querySelector(
          '[data-testid="format-cells-category-general"]',
        ) as HTMLInputElement | null
      )?.checked,
    ).toBe(false)

    toolbar.fireEvent.click(document.body.querySelector('[data-testid="format-cells-save"]')!)

    await toolbar.waitFor(() => expect(setFormatRangeCalls).toHaveLength(1))
    expect(setFormatRangeCalls[0].format?.numberFormat).toEqual({ kind: 'decimal', digits: 3 })
  })
}
