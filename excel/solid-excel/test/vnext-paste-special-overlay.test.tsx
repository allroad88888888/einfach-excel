/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import {
  copyClipboardAtom,
  openPasteSpecialAtom,
  selectionAtom,
  setWorkspaceActiveSheetAtom,
  type PasteRangeRequest,
  type SpreadsheetBackend,
  type VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetPasteSpecialDialog } from '../src-vnext/paste-special'
import { SpreadsheetUiProvider } from '../src-vnext/provider'

afterEach(cleanup)

function createBackend(): SpreadsheetBackend {
  return {
    async pasteRange(request: PasteRangeRequest) {
      return {
        kind: 'paste-range',
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: 1,
        affectedRange: request.target,
      }
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    async readVisibleProjection(request: VisibleProjectionRequest) {
      return {
        kind: 'visible-window',
        sheetId: request.sheetId,
        window: request.window,
        requestId: request.requestId,
        revision: 1,
        cells: [],
      }
    },
    async setCellInput() {
      throw new Error('not used')
    },
  }
}

function seedPasteSession(store: ReturnType<typeof createStore>): void {
  store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
  store.setter(selectionAtom, {
    kind: 'range',
    sheetId: 'sheet-1',
    anchor: { row: 2, col: 3 },
    focus: { row: 3, col: 4 },
  })
  store.setter(copyClipboardAtom, {
    source: {
      sheetId: 'source-sheet',
      range: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 },
    },
    includesFormulas: true,
  })
}

function requiredButton(container: HTMLElement, testId: string): HTMLButtonElement {
  const button = container.querySelector(`[data-testid="${testId}"]`)
  if (!(button instanceof HTMLButtonElement)) throw new Error(`missing ${testId}`)
  return button
}

function renderOpenDialog() {
  const store = createStore()
  seedPasteSession(store)
  const result = render(() => (
    <>
      <button type="button" data-testid="paste-special-opener">
        Open paste special
      </button>
      <SpreadsheetUiProvider backend={createBackend()} store={store}>
        <SpreadsheetPasteSpecialDialog />
      </SpreadsheetUiProvider>
    </>
  ))
  const opener = requiredButton(result.container, 'paste-special-opener')
  opener.focus()
  store.setter(openPasteSpecialAtom)
  return { ...result, opener, store }
}

async function waitForDialog(container: HTMLElement): Promise<HTMLDivElement> {
  await waitFor(() => {
    expect(container.querySelector('[data-testid="paste-special-dialog"]')).toBeInstanceOf(
      HTMLDivElement,
    )
  })
  return container.querySelector<HTMLDivElement>('[data-testid="paste-special-dialog"]')!
}

describe('SpreadsheetPasteSpecialDialog overlay interactions', () => {
  it('focuses its close action and declares a modal dialog after opening', async () => {
    const { container } = renderOpenDialog()
    const dialog = await waitForDialog(container)
    const close = requiredButton(container, 'paste-special-close-x')

    await waitFor(() => expect(document.activeElement).toBe(close))
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('cycles Tab within the open dialog', async () => {
    const { container } = renderOpenDialog()
    await waitForDialog(container)
    const close = requiredButton(container, 'paste-special-close-x')
    const confirm = requiredButton(container, 'paste-special-confirm-button')

    await waitFor(() => expect(confirm.disabled).toBe(false))
    confirm.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(close)

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(confirm)
  })

  it('closes on Escape and returns focus to its opener', async () => {
    const { container, opener, store } = renderOpenDialog()
    await waitForDialog(container)

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(container.querySelector('[data-testid="paste-special-dialog"]')).toBeNull()
      expect(store.getter(openPasteSpecialAtom)).not.toBe(true)
      expect(document.activeElement).toBe(opener)
    })
  })
})
