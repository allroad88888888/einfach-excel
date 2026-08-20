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

function createPrintBackend(
  rejectWrite = false,
  initial = DEFAULT_PRINT_CONFIG,
): PrintBackendHarness {
  let persisted = cloneConfig(initial)
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
    await waitFor(() => expect(backend.reads).toHaveLength(1))
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
    const saveButton = container.querySelector(
      '[data-testid="page-setup-save-button"]',
    ) as HTMLButtonElement
    saveButton.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(
      container.querySelector('[data-testid="page-setup-close-x"]'),
    )
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(saveButton)
    fireEvent.click(container.querySelector('[data-testid="page-setup-orientation-landscape"]')!)
    fireEvent.input(container.querySelector('[data-testid="page-setup-scale-percent-input"]')!, {
      target: { value: '80' },
    })
    fireEvent.click(container.querySelector('[data-testid="page-setup-save-button"]')!)

    await waitFor(() => expect(store.getter(pageSetupDialogOpenAtom)).toBe(false))
    expect(backend.writes).toHaveLength(1)
    expect(backend.reads).toHaveLength(2)
    expect(store.getter(printConfigStateAtom)['sheet-1']).toMatchObject({
      orientation: 'landscape',
      scale: { kind: 'percent', percent: 80 },
    })
    expect(container.querySelector('[data-testid="print-orientation-text"]')?.textContent).toBe(
      '横向',
    )
    await Promise.resolve()
    expect(document.activeElement).toBe(pageSetupButton)
  })

  it('presents a visible pending state while an exact save is in flight', async () => {
    let writeRequest: SetPrintConfigRequest | undefined
    let releaseWrite:
      | ((value: { sheetId: string; requestId: number; revision: string }) => void)
      | undefined
    const baseline = createPrintBackend()
    const backend: PrintBackendHarness = {
      ...baseline,
      source: {
        ...baseline.source,
        setPrintConfig(request: SetPrintConfigRequest) {
          writeRequest = request
          return new Promise((resolve) => {
            releaseWrite = resolve
          })
        },
      } as SpreadsheetBackend,
    }
    const { container, store } = renderPreview(createStore(), backend)
    await waitFor(() => expect(backend.reads).toHaveLength(1))
    fireEvent.click(container.querySelector('[data-testid="print-page-setup-button"]')!)
    fireEvent.click(container.querySelector('[data-testid="page-setup-save-button"]')!)

    await waitFor(() => expect(store.getter(pageSetupSessionAtom)?.phase).toBe('saving'))
    const dialog = container.querySelector('[data-testid="spreadsheet-page-setup-dialog"]')
    const pending = container.querySelector('[data-testid="page-setup-pending"]')
    expect(dialog?.getAttribute('aria-busy')).toBe('true')
    expect(pending?.getAttribute('aria-hidden')).toBe('true')
    expect(
      container.querySelector('[data-testid="page-setup-save-button"]')?.hasAttribute('disabled'),
    ).toBe(true)

    await waitFor(() => expect(writeRequest?.requestId).toBeDefined())
    if (writeRequest?.requestId === undefined || releaseWrite === undefined) {
      throw new Error('save request did not reach the pending backend')
    }
    releaseWrite({
      sheetId: writeRequest.sheetId,
      requestId: writeRequest.requestId,
      revision: 'write-1',
    })
    await waitFor(() => expect(store.getter(pageSetupDialogOpenAtom)).toBe(false))
  })

  it('hydrates on preview open and active-sheet changes using exact read receipts', async () => {
    const initial = { ...DEFAULT_PRINT_CONFIG, orientation: 'landscape' as const }
    const { backend, store } = renderPreview(createStore(), createPrintBackend(false, initial))

    await waitFor(() =>
      expect(store.getter(printConfigStateAtom)['sheet-1']?.orientation).toBe('landscape'),
    )
    expect(backend.reads).toHaveLength(1)
    expect(backend.reads[0]).toMatchObject({ kind: 'read-print-config', sheetId: 'sheet-1' })

    store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-2' })
    await waitFor(() => expect(backend.reads).toHaveLength(2))
    expect(backend.reads[1]).toMatchObject({ kind: 'read-print-config', sheetId: 'sheet-2' })
    expect(store.getter(printConfigStateAtom)['sheet-2']?.orientation).toBe('landscape')
  })

  it('cancels uncommitted edits with Escape and retains the hydrated preview cache', async () => {
    const { container, backend, store } = renderPreview()
    await waitFor(() => expect(backend.reads).toHaveLength(1))
    const pageSetupButton = container.querySelector(
      '[data-testid="print-page-setup-button"]',
    ) as HTMLButtonElement
    pageSetupButton.focus()
    fireEvent.click(pageSetupButton)
    await Promise.resolve()
    fireEvent.click(container.querySelector('[data-testid="page-setup-orientation-landscape"]')!)
    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(store.getter(pageSetupDialogOpenAtom)).toBe(false))
    expect(store.getter(printConfigStateAtom)['sheet-1']).toEqual(DEFAULT_PRINT_CONFIG)
    await Promise.resolve()
    expect(document.activeElement).toBe(pageSetupButton)
  })

  it('blocks closure after an unknown write outcome and retries through read-only reconciliation', async () => {
    const backend = createPrintBackend(true)
    const { container, store } = renderPreview(createStore(), backend)
    await waitFor(() => expect(backend.reads).toHaveLength(1))
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
    expect(backend.reads).toHaveLength(2)
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
