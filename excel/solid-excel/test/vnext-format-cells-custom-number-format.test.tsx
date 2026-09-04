/** @jsxImportSource solid-js */

import { afterEach, describe, expect, test } from 'vitest'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import type { SetFormatRangeRequest, SpreadsheetBackend } from '@einfach/spreadsheet-ui-core'
import { openFormatCellsAtom } from '@einfach/spreadsheet-ui-core'
import { setLocale } from '../src/i18n'
import { SpreadsheetFormatCellsDialog } from '../src/format-cells'
import { SpreadsheetUiProvider } from '../src/provider'

const RANGE = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }

afterEach(() => {
  cleanup()
  setLocale('en')
})

function createBackend(requests: SetFormatRangeRequest[]): SpreadsheetBackend {
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
      requests.push(request)
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        affectedRange: request.range,
      }
    },
  }
}

describe('Format Cells Custom number format', () => {
  test('selects, edits, previews, saves, and reopens a Custom pattern from Core state', async () => {
    setLocale('en')
    const store = createStore()
    const requests: SetFormatRangeRequest[] = []
    store.setter(openFormatCellsAtom, { sheetId: 'sheet-1', range: RANGE })
    const view = render(() => (
      <SpreadsheetUiProvider backend={createBackend(requests)} store={store}>
        <SpreadsheetFormatCellsDialog />
      </SpreadsheetUiProvider>
    ))

    const custom = await waitFor(
      () => view.getByTestId('format-cells-category-custom') as HTMLInputElement,
    )
    expect(custom.disabled).toBe(false)
    expect(view.queryByTestId('format-cells-category-custom-coming-soon')).toBeNull()

    fireEvent.click(custom)
    const pattern = await waitFor(
      () => view.getByTestId('format-cells-custom-pattern') as HTMLInputElement,
    )
    expect(pattern.value).toBe('#,##0.00')
    fireEvent.input(pattern, { target: { value: '0.0"件"' } })
    await waitFor(() =>
      expect(view.getByTestId('format-cells-number-preview').textContent).toBe('1234.5件'),
    )

    fireEvent.click(view.getByTestId('format-cells-save'))
    await waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0]).toMatchObject({
      sheetId: 'sheet-1',
      range: RANGE,
      format: { numberFormat: { kind: 'custom', pattern: '0.0"件"' } },
    })
    await waitFor(() => expect(view.queryByTestId('format-cells-dialog')).toBeNull())

    store.setter(openFormatCellsAtom, {
      sheetId: 'sheet-1',
      range: RANGE,
      initialFormat: requests[0].format,
    })
    await waitFor(() =>
      expect((view.getByTestId('format-cells-category-custom') as HTMLInputElement).checked).toBe(
        true,
      ),
    )
    expect((view.getByTestId('format-cells-custom-pattern') as HTMLInputElement).value).toBe(
      '0.0"件"',
    )
  })
})
