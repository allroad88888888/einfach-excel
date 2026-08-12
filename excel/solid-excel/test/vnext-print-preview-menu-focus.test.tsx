/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import type { SpreadsheetBackend } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetMenuBar } from '../src-vnext/menu-bar'
import { SpreadsheetPrintPreviewOverlay } from '../src-vnext/print'
import { SpreadsheetUiProvider } from '../src-vnext/provider'

afterEach(cleanup)

function createFakeBackend(): SpreadsheetBackend {
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

describe('vNext print preview menu focus', () => {
  it('returns focus to File after Escape and Close preview', async () => {
    const store = createStore()
    const { container } = render(() => (
      <SpreadsheetUiProvider backend={createFakeBackend()} store={store}>
        <SpreadsheetMenuBar />
        <SpreadsheetPrintPreviewOverlay />
      </SpreadsheetUiProvider>
    ))
    const fileButton = container.querySelector('[data-testid="menu-bar-button-file"]')
    expect(fileButton).toBeInstanceOf(HTMLButtonElement)

    function openPrintPreview() {
      fireEvent.click(fileButton as HTMLButtonElement)
      fireEvent.click(
        container.querySelector(
          '[data-testid="menu-bar-item-file.printPreview"]',
        ) as HTMLButtonElement,
      )
    }

    openPrintPreview()
    await waitFor(() =>
      expect(container.querySelector('[data-testid="dialog-close-x"]')).toBe(
        document.activeElement,
      ),
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(container.querySelector('[data-testid="print-preview-overlay"]')).toBeNull()
      expect(document.activeElement).toBe(fileButton)
    })

    openPrintPreview()
    await waitFor(() =>
      expect(container.querySelector('[data-testid="dialog-close-x"]')).toBe(
        document.activeElement,
      ),
    )

    fireEvent.click(
      container.querySelector('[data-testid="print-close-button"]') as HTMLButtonElement,
    )
    await waitFor(() => {
      expect(container.querySelector('[data-testid="print-preview-overlay"]')).toBeNull()
      expect(document.activeElement).toBe(fileButton)
    })
  })
})
