/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { formatNumberValue, workbookLocaleAtom } from '@einfach/spreadsheet-ui-core'
import { cleanup, render, waitFor } from '@solidjs/testing-library'
import { setLocale } from '../src/i18n'
import { SpreadsheetUiProvider } from '../src/provider'

afterEach(() => {
  cleanup()
  setLocale('zh')
})

function unusedBackend() {
  return {
    async readVisibleProjection() {
      throw new Error('not used')
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    async setCellInput() {
      throw new Error('not used')
    },
  }
}

describe('vNext Provider locale bridge', () => {
  it('mirrors a non-catalog BCP-47 locale to the workbook formatter atom', async () => {
    setLocale('en')
    const store = createStore()

    render(() => (
      <SpreadsheetUiProvider backend={unusedBackend()} store={store}>
        <div />
      </SpreadsheetUiProvider>
    ))

    expect(store.getter(workbookLocaleAtom)).toBe('en')
    setLocale('de-de')

    await waitFor(() => expect(store.getter(workbookLocaleAtom)).toBe('de-DE'))
    expect(
      formatNumberValue({ kind: 'number', digits: 2, thousands: true }, 1234.56, {
        locale: store.getter(workbookLocaleAtom),
      }).text,
    ).toBe('1.234,56')
  })
})
