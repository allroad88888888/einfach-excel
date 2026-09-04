/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import type {
  BackendMutationResult,
  ImportCellChunksRequest,
  SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { openTextToColumnsAtom, textToColumnsOpenAtom } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetUiProvider } from '../src/provider'
import { SpreadsheetTextToColumnsDialog } from '../src/text-to-columns'

afterEach(cleanup)

function createBackend(
  importCellChunks?: (request: ImportCellChunksRequest) => Promise<BackendMutationResult>,
): SpreadsheetBackend {
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
    importCellChunks,
  }
}

function openDialog(store: ReturnType<typeof createStore>) {
  store.setter(openTextToColumnsAtom, {
    sheetId: 'sheet-1',
    anchor: { row: 0, col: 0 },
    rows: [{ sourceRow: 0, text: 'a,b' }],
  })
}

function advanceToFinalStep(container: HTMLElement) {
  fireEvent.click(container.querySelector('[data-testid="ttc-next-button"]')!)
  fireEvent.click(container.querySelector('[data-testid="ttc-delim-tab"]')!)
  fireEvent.click(container.querySelector('[data-testid="ttc-delim-comma"]')!)
  fireEvent.click(container.querySelector('[data-testid="ttc-next-button"]')!)
}

describe('SpreadsheetTextToColumnsDialog focus and error presentation', () => {
  it('focuses its form, traps Tab, and restores the opening element after Escape', async () => {
    const store = createStore()
    const backend = createBackend()
    const { container } = render(() => (
      <>
        <button type="button" data-testid="open-text-to-columns">
          Open
        </button>
        <SpreadsheetUiProvider backend={backend} store={store}>
          <SpreadsheetTextToColumnsDialog />
        </SpreadsheetUiProvider>
      </>
    ))
    const opener = container.querySelector(
      '[data-testid="open-text-to-columns"]',
    ) as HTMLButtonElement
    opener.focus()
    openDialog(store)

    const dialog = await waitFor(() => {
      const element = container.querySelector('[data-testid="text-to-columns-dialog"]')
      expect(element).not.toBeNull()
      return element as HTMLDivElement
    })
    const firstInput = container.querySelector('[data-testid="ttc-mode-delimited"]')
    const close = container.querySelector('[data-testid="dialog-close-x"]') as HTMLButtonElement
    const cancel = container.querySelector('[data-testid="ttc-cancel-button"]') as HTMLButtonElement

    await waitFor(() => expect(document.activeElement).toBe(firstInput))
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBe('text-to-columns-dialog-title')

    cancel.focus()
    fireEvent.keyDown(cancel, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(cancel)

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(store.getter(textToColumnsOpenAtom)).toBe(false))
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })

  it('associates a Core mutation error with the existing Finish control', async () => {
    const importCellChunks = vi.fn(async () => {
      throw new Error('network interrupted')
    })
    const store = createStore()
    const backend = createBackend(importCellChunks)
    openDialog(store)
    const { container } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetTextToColumnsDialog />
      </SpreadsheetUiProvider>
    ))

    advanceToFinalStep(container)
    const finish = container.querySelector('[data-testid="ttc-finish-button"]') as HTMLButtonElement
    fireEvent.click(finish)

    await waitFor(() => {
      const error = container.querySelector('[data-testid="ttc-mutation-error"]')
      expect(error?.textContent).toMatch(/network interrupted/)
      expect(finish.getAttribute('aria-describedby')).toBe('text-to-columns-dialog-error')
      expect(error?.id).toBe('text-to-columns-dialog-error')
    })
    expect(importCellChunks).toHaveBeenCalledTimes(1)
  })
})
