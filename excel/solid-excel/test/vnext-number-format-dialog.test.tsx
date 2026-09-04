/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from 'vitest'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import type { SpreadsheetBackend } from '@einfach/spreadsheet-ui-core'
import { openNumberFormatDialogAtom } from '@einfach/spreadsheet-ui-core'
import { setLocale } from '../src/i18n'
import { SpreadsheetNumberFormatDialogs } from '../src/format-cells'
import { SpreadsheetUiProvider } from '../src/provider'

const RANGE = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }

afterEach(() => {
  cleanup()
  setLocale('en')
})

function createBackend(options: { failSave?: boolean } = {}): SpreadsheetBackend {
  return {
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
    setFormatRange: async (request) => {
      if (options.failSave) throw new Error('Number format save failed')
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        affectedRange: request.range,
      }
    },
  }
}

function renderNumberFormatDialog(
  kind: 'currency' | 'dateTime' | 'number',
  options: { failSave?: boolean } = {},
) {
  const store = createStore()
  const view = render(() => (
    <SpreadsheetUiProvider backend={createBackend(options)} store={store}>
      <button
        type="button"
        data-testid="number-format-opener"
        onClick={() =>
          store.setter(openNumberFormatDialogAtom, { kind, sheetId: 'sheet-1', range: RANGE })
        }
      >
        Open
      </button>
      <SpreadsheetNumberFormatDialogs />
    </SpreadsheetUiProvider>
  ))
  const opener = view.getByTestId('number-format-opener') as HTMLButtonElement
  opener.focus()
  fireEvent.click(opener)
  return { ...view, opener }
}

describe('SpreadsheetNumberFormatDialogs', () => {
  it('uses the shared Office dialog shell and restores focus after Escape', async () => {
    const view = renderNumberFormatDialog('currency')
    const dialog = await waitFor(() => view.getByTestId('number-format-dialog'))
    const decimals = view.getByTestId('number-format-dialog-decimals')
    const close = view.getByTestId('number-format-dialog-close')
    const save = view.getByTestId('number-format-dialog-save')

    expect(dialog.tagName).toBe('FORM')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.querySelector(':scope > header')?.classList).toContain(
      'number-format-dialog-header',
    )
    expect(dialog.querySelector(':scope > footer')?.classList).toContain(
      'number-format-dialog-actions',
    )
    expect(save.getAttribute('data-variant')).toBe('primary')
    await waitFor(() => expect(document.activeElement).toBe(decimals))
    ;(save as HTMLButtonElement).focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(view.queryByTestId('number-format-dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(view.opener))
  })

  it('focuses the selected pattern and exposes a save error to assistive technology', async () => {
    const view = renderNumberFormatDialog('dateTime', { failSave: true })
    const selected = await waitFor(
      () => view.getByRole('option', { selected: true }) as HTMLButtonElement,
    )
    await waitFor(() => expect(document.activeElement).toBe(selected))

    fireEvent.submit(view.getByTestId('number-format-dialog'))
    const error = await waitFor(() => view.getByTestId('number-format-dialog-save-error'))
    expect(error.getAttribute('role')).toBe('alert')
    expect(view.getByTestId('number-format-dialog').getAttribute('aria-describedby')).toBe(
      'number-format-dialog-save-error',
    )
  })
})
