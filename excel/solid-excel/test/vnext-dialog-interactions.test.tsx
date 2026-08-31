/** @jsxImportSource solid-js */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import type {
  RangeProjectionRequest,
  RangeProjectionResult,
  SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import {
  findReplaceOpenAtom,
  goToModeAtom,
  goToOpenAtom,
  openFindReplaceAtom,
  openGoToAtom,
  setSelectionBoundsAtom,
  setSheetTabsSheetsAtom,
  setWorkspaceActiveSheetAtom,
} from '@einfach/spreadsheet-ui-core'
import { setLocale } from '../src/i18n'
import { SpreadsheetFindReplaceDialog } from '../src/find-replace'
import { SpreadsheetGoToDialog } from '../src/go-to'
import { SpreadsheetUiProvider } from '../src/provider'

afterEach(cleanup)
beforeEach(() => setLocale('en'))

function createBackend(): SpreadsheetBackend {
  return {
    async readVisibleProjection() {
      throw new Error('not used')
    },
    async readRangeProjection(request: RangeProjectionRequest): Promise<RangeProjectionResult> {
      return {
        kind: 'range',
        sheetId: request.sheetId,
        range: request.range,
        requestId: request.requestId,
        cells: [],
      }
    },
    async setCellInput() {
      throw new Error('not used')
    },
  }
}

function prepareGoToStore(store: ReturnType<typeof createStore>): void {
  store.setter(setSelectionBoundsAtom, { rowCount: 100, colCount: 26 })
  store.setter(setSheetTabsSheetsAtom, {
    sheets: [{ id: 'sheet-1', name: 'Sheet 1', index: 0 }],
  })
  store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
}

describe('vnext dialog interactions', () => {
  it('returns focus to the find opener after Escape and exposes its modal relationship', async () => {
    const store = createStore()
    const { container } = render(() => (
      <>
        <button type="button" data-testid="find-opener">
          Open find
        </button>
        <SpreadsheetUiProvider backend={createBackend()} store={store}>
          <SpreadsheetFindReplaceDialog />
        </SpreadsheetUiProvider>
      </>
    ))
    const opener = container.querySelector('[data-testid="find-opener"]') as HTMLButtonElement
    opener.focus()

    store.setter(openFindReplaceAtom)

    const needle = await waitFor(() => {
      const element = container.querySelector(
        '[data-testid="find-needle-input"]',
      ) as HTMLInputElement
      expect(document.activeElement).toBe(element)
      return element
    })
    const dialog = container.querySelector('[data-testid="find-replace-dialog"]')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(dialog?.getAttribute('aria-labelledby')).toBe('find-replace-dialog-title')
    expect(needle.closest('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe(
      'find-replace-tab-find',
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(store.getter(findReplaceOpenAtom)).toBe(false)
      expect(document.activeElement).toBe(opener)
    })
  })

  it('returns focus to the go-to opener after Escape and exposes its modal relationship', async () => {
    const store = createStore()
    prepareGoToStore(store)
    const { container } = render(() => (
      <>
        <button type="button" data-testid="go-to-opener">
          Open go to
        </button>
        <SpreadsheetUiProvider backend={createBackend()} store={store}>
          <SpreadsheetGoToDialog />
        </SpreadsheetUiProvider>
      </>
    ))
    const opener = container.querySelector('[data-testid="go-to-opener"]') as HTMLButtonElement
    opener.focus()

    store.setter(openGoToAtom)

    const input = await waitFor(() => {
      const element = container.querySelector('[data-testid="go-to-input"]') as HTMLInputElement
      expect(document.activeElement).toBe(element)
      return element
    })
    const dialog = container.querySelector('[data-testid="go-to-dialog"]')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(dialog?.getAttribute('aria-labelledby')).toBe('go-to-dialog-title')
    expect(input.closest('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe(
      'go-to-tab-simple',
    )

    const simpleTab = container.querySelector(
      '[data-testid="go-to-tab-simple"]',
    ) as HTMLButtonElement
    fireEvent.keyDown(simpleTab, { key: 'ArrowRight' })
    await waitFor(() => {
      const specialTab = container.querySelector(
        '[data-testid="go-to-tab-special"]',
      ) as HTMLButtonElement
      expect(store.getter(goToModeAtom)).toBe('special')
      expect(document.activeElement).toBe(specialTab)
    })

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(store.getter(goToOpenAtom)).toBe(false)
      expect(document.activeElement).toBe(opener)
    })
  })
})
