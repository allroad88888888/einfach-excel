/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore, type Store } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import type {
  DisplayCell,
  RangeProjectionRequest,
  RangeProjectionResult,
  RemoveDuplicatesControllerPort,
  RemoveRowsExactRequest,
  RemoveRowsExactResult,
  SpreadsheetBackend,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import {
  createVisibleProjectionRequest,
  dispatchRemoveDuplicatesIntentAtom,
  openRemoveDuplicatesFromSelectionAtom,
  removeDuplicatesLifecycleAtom,
  selectionAtom,
  setWorkspaceActiveSheetAtom,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetUiProvider } from '../src/provider'
import { SpreadsheetRemoveDuplicatesDialog } from '../src/remove-duplicates'
import { seedReadyVisibleProjection } from './projection-test-fixture'

afterEach(cleanup)

const SHEET_ID = 'sheet-1'
const RANGE = Object.freeze({ rowStart: 0, rowEnd: 3, colStart: 0, colEnd: 1 })
const CELLS: readonly DisplayCell[] = Object.freeze([
  { row: 0, col: 0, displayValue: 'Region', valueKind: 'string' },
  { row: 0, col: 1, displayValue: 'Score', valueKind: 'string' },
  { row: 1, col: 0, displayValue: 'North', valueKind: 'string' },
  { row: 1, col: 1, displayValue: '100', valueKind: 'string' },
  { row: 2, col: 0, displayValue: 'North', valueKind: 'string' },
  { row: 2, col: 1, displayValue: '200', valueKind: 'string' },
  { row: 3, col: 0, displayValue: 'South', valueKind: 'string' },
  { row: 3, col: 1, displayValue: '300', valueKind: 'string' },
])

type RemoveDuplicatesBackend = SpreadsheetBackend & RemoveDuplicatesControllerPort

function rangeResult(request: RangeProjectionRequest): RangeProjectionResult {
  return {
    kind: 'range',
    requestId: request.requestId,
    sheetId: request.sheetId,
    range: request.range,
    revision: 1,
    cells: Array.from(CELLS),
  }
}

function visibleResult(request: VisibleProjectionRequest): VisibleProjectionResult {
  return {
    kind: 'visible-window',
    requestId: request.requestId,
    sheetId: request.sheetId,
    window: request.window,
    revision: 2,
    cells: Array.from(CELLS),
  }
}

function removalResult(request: RemoveRowsExactRequest): RemoveRowsExactResult {
  return {
    requestId: request.requestId,
    sheetId: request.sheetId,
    targetRange: request.targetRange,
    removedRowIndices: Array.from(request.rows),
    removedRows: request.rows.length,
    affectedRange: {
      startRow: request.rows[0],
      endRow: request.targetRange.rowEnd,
      startCol: request.targetRange.colStart,
      endCol: request.targetRange.colEnd,
    },
    revision: 2,
  }
}

function createBackend(overrides: Partial<RemoveDuplicatesBackend> = {}): RemoveDuplicatesBackend {
  return {
    async readVisibleProjection(request) {
      return visibleResult(request)
    },
    async readRangeProjection(request) {
      return rangeResult(request)
    },
    async removeRowsExact(request) {
      return removalResult(request)
    },
    async setCellInput() {
      throw new Error('not used')
    },
    ...overrides,
  }
}

function seedContext(store: Store): void {
  store.setter(setWorkspaceActiveSheetAtom, { sheetId: SHEET_ID })
  store.setter(selectionAtom, {
    kind: 'range',
    sheetId: SHEET_ID,
    anchor: { row: RANGE.rowStart, col: RANGE.colStart },
    focus: { row: RANGE.rowEnd, col: RANGE.colEnd },
  })
  const request = createVisibleProjectionRequest({
    sheetId: SHEET_ID,
    window: RANGE,
    requestId: 0,
    reason: 'test',
  })
  seedReadyVisibleProjection(store, { status: 'ready', request, result: visibleResult(request) })
}

async function openEditing(store: Store, backend: RemoveDuplicatesBackend): Promise<void> {
  seedContext(store)
  await store.setter(openRemoveDuplicatesFromSelectionAtom, { source: backend })
  store.setter(dispatchRemoveDuplicatesIntentAtom, { kind: 'toggle-key-column', column: 1 })
}

function renderDialog(store: Store, backend: RemoveDuplicatesBackend) {
  return render(() => (
    <SpreadsheetUiProvider backend={backend} store={store}>
      <SpreadsheetRemoveDuplicatesDialog />
    </SpreadsheetUiProvider>
  ))
}

describe('SpreadsheetRemoveDuplicatesDialog interactions', () => {
  it('acts as a modal dialog, traps focus, and restores the invoking focus', async () => {
    const store = createStore()
    const backend = createBackend()
    const launcher = document.createElement('button')
    document.body.append(launcher)
    launcher.focus()
    await openEditing(store, backend)
    const view = renderDialog(store, backend)

    const dialog = view.getByTestId('remove-duplicates-dialog')
    const close = view.getByTestId('remove-duplicates-close-x')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBe('remove-duplicates-dialog-title')
    await waitFor(() => expect(document.activeElement).toBe(close))

    const confirm = view.getByTestId('remove-duplicates-confirm-button')
    confirm.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(view.queryByTestId('remove-duplicates-dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(launcher))
    launcher.remove()
  })

  it('exposes the existing read retry command after a failed projection', async () => {
    const store = createStore()
    let reads = 0
    const backend = createBackend({
      async readRangeProjection(request) {
        reads += 1
        if (reads === 1) throw new Error('projection offline')
        return rangeResult(request)
      },
    })
    seedContext(store)
    const view = renderDialog(store, backend)

    await store.setter(openRemoveDuplicatesFromSelectionAtom, { source: backend })
    await waitFor(() =>
      expect(store.getter(removeDuplicatesLifecycleAtom).status).toBe('read-failed'),
    )
    expect(view.getByTestId('remove-duplicates-error').textContent).toContain('projection offline')
    fireEvent.click(view.getByTestId('remove-duplicates-retry-read'))
    await waitFor(() => expect(store.getter(removeDuplicatesLifecycleAtom).status).toBe('editing'))
    expect(reads).toBe(2)
  })

  it('submits the existing confirm command through the dialog form exactly once', async () => {
    const store = createStore()
    let mutations = 0
    const backend = createBackend({
      async removeRowsExact(request) {
        mutations += 1
        return removalResult(request)
      },
    })
    await openEditing(store, backend)
    const view = renderDialog(store, backend)

    fireEvent.submit(view.getByTestId('remove-duplicates-dialog'))
    await waitFor(() => expect(view.queryByTestId('remove-duplicates-dialog')).toBeNull())
    expect(mutations).toBe(1)
  })
})
