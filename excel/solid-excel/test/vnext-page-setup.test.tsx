/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import type {
  ReadPrintConfigRequest,
  ReadPrintConfigResult,
  SetPrintConfigRequest,
  SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import {
  DEFAULT_PRINT_CONFIG,
  pageSetupDialogOpenAtom,
  pageSetupSessionAtom,
  printConfigStateAtom,
  printPreviewOpenAtom,
  setWorkspaceActiveSheetAtom,
  type PrintConfig,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetUiProvider } from '../src-vnext/provider'
import { SpreadsheetPrintPreviewOverlay } from '../src-vnext/print'

afterEach(cleanup)

interface PrintBackendHarness {
  readonly source: SpreadsheetBackend
  readonly reads: ReadonlyArray<ReadPrintConfigRequest>
  readonly writes: ReadonlyArray<SetPrintConfigRequest>
}

function cloneConfig(config: PrintConfig): PrintConfig {
  return JSON.parse(JSON.stringify(config)) as PrintConfig
}

function createPrintBackend(rejectWrite = false): PrintBackendHarness {
  let persisted = cloneConfig(DEFAULT_PRINT_CONFIG)
  const reads: ReadPrintConfigRequest[] = []
  const writes: SetPrintConfigRequest[] = []
  const source = {
    async readVisibleProjection() {
      throw new Error('not used')
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    async setCellInput() {
      throw new Error('not used')
    },
    async readPrintConfig(request: ReadPrintConfigRequest): Promise<ReadPrintConfigResult> {
      reads.push(request)
      return {
        kind: 'print-config',
        sheetId: request.sheetId,
        config: cloneConfig(persisted),
        requestId: request.requestId,
        revision: 'read-1',
      }
    },
    async setPrintConfig(request: SetPrintConfigRequest) {
      writes.push(request)
      persisted = cloneConfig(request.config)
      if (rejectWrite) throw new Error('transport interrupted')
      return { sheetId: request.sheetId, requestId: request.requestId, revision: 'write-1' }
    },
  } as SpreadsheetBackend
  return { source, reads, writes }
}

function renderPreview(store = createStore(), backend = createPrintBackend()) {
  store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
  store.setter(printPreviewOpenAtom, true)
  return {
    ...render(() => (
      <SpreadsheetUiProvider backend={backend.source} store={store}>
        <SpreadsheetPrintPreviewOverlay />
      </SpreadsheetUiProvider>
    )),
    backend,
    store,
  }
}

describe('vNext page setup dialog', () => {
  it('edits the Atom draft, saves via exact read-back, and restores focus to preview', async () => {
    const { container, backend, store } = renderPreview()
    const pageSetupButton = container.querySelector(
      '[data-testid="print-page-setup-button"]',
    ) as HTMLButtonElement
    pageSetupButton.focus()
    fireEvent.click(pageSetupButton)

    await Promise.resolve()
    const dialog = container.querySelector('[data-testid="spreadsheet-page-setup-dialog"]')
    expect(dialog).not.toBeNull()
    await waitFor(() =>
      expect(document.activeElement).toBe(
        container.querySelector('[data-testid="page-setup-close-x"]'),
      ),
    )
    fireEvent.click(container.querySelector('[data-testid="page-setup-orientation-landscape"]')!)
    fireEvent.input(container.querySelector('[data-testid="page-setup-scale-percent-input"]')!, {
      target: { value: '80' },
    })
    fireEvent.click(container.querySelector('[data-testid="page-setup-save-button"]')!)

    await waitFor(() => expect(store.getter(pageSetupDialogOpenAtom)).toBe(false))
    expect(backend.writes).toHaveLength(1)
    expect(backend.reads).toHaveLength(1)
    expect(store.getter(printConfigStateAtom)['sheet-1']).toMatchObject({
      orientation: 'landscape',
      scale: { kind: 'percent', percent: 80 },
    })
    expect(container.querySelector('[data-testid="print-orientation-text"]')?.textContent).toBe(
      'landscape',
    )
    await Promise.resolve()
    expect(document.activeElement).toBe(pageSetupButton)
  })

  it('cancels uncommitted edits with Escape and leaves the preview cache untouched', async () => {
    const { container, store } = renderPreview()
    const pageSetupButton = container.querySelector(
      '[data-testid="print-page-setup-button"]',
    ) as HTMLButtonElement
    pageSetupButton.focus()
    fireEvent.click(pageSetupButton)
    await Promise.resolve()
    fireEvent.click(container.querySelector('[data-testid="page-setup-orientation-landscape"]')!)
    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(store.getter(pageSetupDialogOpenAtom)).toBe(false))
    expect(store.getter(printConfigStateAtom)['sheet-1']).toBeUndefined()
    await Promise.resolve()
    expect(document.activeElement).toBe(pageSetupButton)
  })

  it('blocks closure after an unknown write outcome and retries through read-only reconciliation', async () => {
    const backend = createPrintBackend(true)
    const { container, store } = renderPreview(createStore(), backend)
    fireEvent.click(container.querySelector('[data-testid="print-page-setup-button"]')!)
    fireEvent.click(container.querySelector('[data-testid="page-setup-orientation-landscape"]')!)
    fireEvent.click(container.querySelector('[data-testid="page-setup-save-button"]')!)

    await waitFor(() => expect(store.getter(pageSetupSessionAtom)?.phase).toBe('outcome-unknown'))
    expect(
      container.querySelector('[data-testid="page-setup-cancel-button"]')?.hasAttribute('disabled'),
    ).toBe(true)
    expect(container.querySelector('[data-testid="page-setup-retry-refresh"]')).not.toBeNull()
    fireEvent.click(container.querySelector('[data-testid="page-setup-retry-refresh"]')!)

    await waitFor(() => expect(store.getter(pageSetupDialogOpenAtom)).toBe(false))
    expect(backend.writes).toHaveLength(1)
    expect(backend.reads).toHaveLength(1)
    expect(store.getter(printConfigStateAtom)['sheet-1'].orientation).toBe('landscape')
  })

  it('makes a missing print backend port visibly blocked without dispatching a write', async () => {
    const unavailableBackend: PrintBackendHarness = {
      source: {} as SpreadsheetBackend,
      reads: [],
      writes: [],
    }
    const { container, store } = renderPreview(createStore(), unavailableBackend)
    fireEvent.click(container.querySelector('[data-testid="print-page-setup-button"]')!)
    fireEvent.click(container.querySelector('[data-testid="page-setup-save-button"]')!)

    await waitFor(() => expect(store.getter(pageSetupSessionAtom)?.phase).toBe('blocked'))
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'requires both setPrintConfig and readPrintConfig backend ports',
    )
    expect(unavailableBackend.writes).toHaveLength(0)
    fireEvent.click(container.querySelector('[data-testid="page-setup-cancel-button"]')!)
    await waitFor(() => expect(store.getter(pageSetupDialogOpenAtom)).toBe(false))
  })
})
