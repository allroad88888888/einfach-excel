/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import type {
  BackendMutationResult,
  SetFormatRangeRequest,
  SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import {
  clearSheetProtectionAtom,
  formatCellsEditorAtom,
  openFormatCellsAtom,
  setSheetProtectionAtom,
} from '@einfach/spreadsheet-ui-core'
import { setLocale } from '../src/i18n'
import { SpreadsheetFormatCellsDialog } from '../src-vnext/format-cells'
import { SpreadsheetUiProvider } from '../src-vnext/provider'

const RANGE = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }

afterEach(() => {
  cleanup()
  setLocale('en')
})

setLocale('en')

function backendWithSave(save: (request: SetFormatRangeRequest) => Promise<BackendMutationResult>) {
  const backend: SpreadsheetBackend = {
    readVisibleProjection: async (request) => ({
      kind: 'visible-window',
      sheetId: request.sheetId,
      requestId: request.requestId,
      window: request.window,
      cells: [],
    }),
    readRangeProjection: async (request) => ({
      kind: 'range',
      sheetId: request.sheetId,
      requestId: request.requestId,
      range: request.range,
      cells: [],
    }),
    setCellInput: async (request) => ({ sheetId: request.sheetId }),
    setFormatRange: save,
  }
  return backend
}

function successfulSave(request: SetFormatRangeRequest) {
  return Promise.resolve({
    sheetId: request.sheetId,
    requestId: request.requestId,
    affectedRange: request.range,
  })
}

describe('Format Cells interactions', () => {
  it('keeps its accessible dialog name synchronized with the active locale', async () => {
    setLocale('en')
    const store = createStore()
    store.setter(openFormatCellsAtom, { sheetId: 'sheet-1', range: RANGE })
    const view = render(() => (
      <SpreadsheetUiProvider backend={backendWithSave(successfulSave)} store={store}>
        <SpreadsheetFormatCellsDialog />
      </SpreadsheetUiProvider>
    ))

    await waitFor(() => expect(view.getByRole('dialog', { name: 'Format Cells' })).toBeTruthy())
    setLocale('zh')
    await waitFor(() => expect(view.getByRole('dialog', { name: '设置单元格格式' })).toBeTruthy())
    setLocale('en')
    await waitFor(() => expect(view.getByRole('dialog', { name: 'Format Cells' })).toBeTruthy())
  })

  it('uses the shared Office web header, footer, and primary action contract', () => {
    const store = createStore()
    store.setter(openFormatCellsAtom, { sheetId: 'sheet-1', range: RANGE })
    const view = render(() => (
      <SpreadsheetUiProvider backend={backendWithSave(successfulSave)} store={store}>
        <SpreadsheetFormatCellsDialog />
      </SpreadsheetUiProvider>
    ))

    const dialog = view.getByTestId('format-cells-dialog')
    expect(dialog.querySelector(':scope > header')?.classList).toContain('format-cells-header')
    expect(dialog.querySelector(':scope > footer')?.classList).toContain('format-cells-actions')
    expect(view.getByTestId('format-cells-save').getAttribute('data-variant')).toBe('primary')
  })

  it('uses roving tabs with linked tabpanel semantics', async () => {
    const store = createStore()
    store.setter(openFormatCellsAtom, { sheetId: 'sheet-1', range: RANGE })
    const view = render(() => (
      <SpreadsheetUiProvider backend={backendWithSave(successfulSave)} store={store}>
        <SpreadsheetFormatCellsDialog />
      </SpreadsheetUiProvider>
    ))

    const numberTab = view.getByTestId('format-cells-tab-number') as HTMLButtonElement
    await waitFor(() => expect(document.activeElement).toBe(numberTab))
    expect(numberTab.tabIndex).toBe(0)
    expect(numberTab.getAttribute('aria-controls')).toBe('format-cells-panel-number')
    expect(document.getElementById(numberTab.getAttribute('aria-controls') ?? '')).toBeTruthy()
    expect(document.getElementById('format-cells-panel-alignment')).toBeTruthy()

    fireEvent.keyDown(numberTab, { key: 'ArrowRight' })
    const alignmentTab = view.getByTestId('format-cells-tab-alignment') as HTMLButtonElement
    await waitFor(() => expect(document.activeElement).toBe(alignmentTab))
    expect(alignmentTab.getAttribute('aria-selected')).toBe('true')
    expect(numberTab.tabIndex).toBe(-1)
    expect(view.getByTestId('format-cells-panel-alignment').getAttribute('aria-labelledby')).toBe(
      'format-cells-tab-alignment',
    )
  })

  it('updates the preview from the Atom draft digits and currency symbol', async () => {
    const store = createStore()
    store.setter(openFormatCellsAtom, { sheetId: 'sheet-1', range: RANGE })
    const view = render(() => (
      <SpreadsheetUiProvider backend={backendWithSave(successfulSave)} store={store}>
        <SpreadsheetFormatCellsDialog />
      </SpreadsheetUiProvider>
    ))

    fireEvent.click(view.getByTestId('format-cells-category-number'))
    fireEvent.input(view.getByTestId('format-cells-number-decimals'), { target: { value: '3' } })
    await waitFor(() =>
      expect(view.getByTestId('format-cells-number-preview').textContent).toBe('1234.500'),
    )

    fireEvent.click(view.getByTestId('format-cells-category-currency'))
    fireEvent.input(view.getByTestId('format-cells-currency-symbol'), {
      target: { value: '€' },
    })
    await waitFor(() =>
      expect(view.getByTestId('format-cells-number-preview').textContent).toBe('€1234.50'),
    )

    const unsupported = view.getByTestId('format-cells-category-special') as HTMLInputElement
    expect(unsupported.disabled).toBe(true)
    expect((view.getByTestId('format-cells-category-currency') as HTMLInputElement).checked).toBe(
      true,
    )
  })

  it('traps focus, closes on Escape, and restores the opener', async () => {
    const store = createStore()
    const view = render(() => (
      <SpreadsheetUiProvider backend={backendWithSave(successfulSave)} store={store}>
        <button
          type="button"
          data-testid="opener"
          onClick={() => store.setter(openFormatCellsAtom, { sheetId: 'sheet-1', range: RANGE })}
        >
          Open
        </button>
        <SpreadsheetFormatCellsDialog />
      </SpreadsheetUiProvider>
    ))

    const opener = view.getByTestId('opener') as HTMLButtonElement
    opener.focus()
    fireEvent.click(opener)
    const close = await waitFor(() => view.getByTestId('dialog-close-x') as HTMLButtonElement)
    const save = view.getByTestId('format-cells-save') as HTMLButtonElement
    save.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(view.queryByTestId('format-cells-dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })

  it('keeps a blocked native submit open and allows retry after recovery', async () => {
    const store = createStore()
    let calls = 0
    const backend = backendWithSave((request) => {
      calls += 1
      return successfulSave(request)
    })
    store.setter(setSheetProtectionAtom, {
      sheetId: 'sheet-1',
      state: { mode: 'protected', unlockedRanges: [] },
    })
    store.setter(openFormatCellsAtom, { sheetId: 'sheet-1', range: RANGE })
    const view = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetFormatCellsDialog />
      </SpreadsheetUiProvider>
    ))

    fireEvent.submit(view.getByTestId('format-cells-dialog'))
    await waitFor(() =>
      expect(view.getByTestId('format-cells-save-error').textContent).toContain(
        'locked on a protected sheet',
      ),
    )
    expect(store.getter(formatCellsEditorAtom).status).toBe('open')
    expect(calls).toBe(0)

    store.setter(clearSheetProtectionAtom, 'sheet-1')
    fireEvent.submit(view.getByTestId('format-cells-dialog'))
    await waitFor(() => expect(view.queryByTestId('format-cells-dialog')).toBeNull())
    expect(calls).toBe(1)
  })
})
