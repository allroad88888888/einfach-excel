/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from 'vitest'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import type {
  DisplayCell,
  SetCellInputRequest,
  SpreadsheetBackend,
  VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import {
  editingCommitLifecycleAtom,
  editingSessionAtom,
  protectionUnlockStateAtom,
  selectionSnapshotAtom,
  setSheetProtectionAtom,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetGrid } from '../src/grid'
import { SpreadsheetUiProvider } from '../src/provider'
import { SpreadsheetProtectionUnlockDialog } from '../src/protection'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

const viewport = {
  scrollTop: 0,
  scrollLeft: 0,
  viewportHeight: 2,
  viewportWidth: 2,
  rowHeight: 1,
  colWidth: 1,
  rowCount: 2,
  colCount: 2,
  overscanRows: 0,
  overscanCols: 0,
}

function createBackend(rejectWrite = false) {
  const writes: SetCellInputRequest[] = []
  const cells: DisplayCell[] = [{ row: 0, col: 0, displayValue: 'before', valueKind: 'string' }]
  const backend: SpreadsheetBackend = {
    async readVisibleProjection(request: VisibleProjectionRequest) {
      return {
        kind: 'visible-window' as const,
        sheetId: request.sheetId,
        window: { ...request.window },
        requestId: request.requestId,
        revision: request.revision,
        cells,
      }
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    async setCellInput(request) {
      writes.push(request)
      if (rejectWrite) throw new Error('cell input was rejected')
      return { sheetId: request.sheetId, requestId: request.requestId, revision: 2 }
    },
  }
  return { backend, writes }
}

async function mountGrid(rejectWrite = false, protectedSheet = false) {
  const store = createStore()
  const { backend, writes } = createBackend(rejectWrite)
  if (protectedSheet) {
    store.setter(setSheetProtectionAtom, {
      sheetId: 'sheet-1',
      state: { mode: 'protected', unlockedRanges: [] },
    })
  }
  window.history.replaceState(null, '', '/?svgOverlay=1')
  const result = render(() => (
    <SpreadsheetUiProvider backend={backend} store={store}>
      <SpreadsheetGrid sheetId="sheet-1" viewport={viewport} data-testid="grid" />
      <SpreadsheetProtectionUnlockDialog />
    </SpreadsheetUiProvider>
  ))
  await waitFor(() => {
    expect(result.container.querySelector('[data-cell-addr="A1"]')).not.toBeNull()
  })
  const grid = result.container.querySelector<HTMLElement>('[data-testid="grid"]')
  const cell = result.container.querySelector<HTMLElement>('[data-cell-addr="A1"]')
  if (!grid || !cell) throw new Error('missing grid editor fixture')
  return { ...result, cell, grid, store, writes }
}

async function startDirectEditing(cell: HTMLElement): Promise<HTMLInputElement> {
  fireEvent.dblClick(cell)
  let input: HTMLInputElement | null = null
  await waitFor(() => {
    input = cell.querySelector<HTMLInputElement>('.cell-input')
    expect(input).not.toBeNull()
    expect(document.activeElement).toBe(input)
  })
  if (!input) throw new Error('cell editor did not open')
  return input
}

describe('vNext direct cell editor interaction', () => {
  it('cancels the draft without writing and restores the grid focus surface', async () => {
    const { cell, grid, store, writes } = await mountGrid()
    const input = await startDirectEditing(cell)

    fireEvent.input(input, { target: { value: 'discard me' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    await waitFor(() => {
      expect(store.getter(editingSessionAtom).status).toBe('cancelled')
      expect(cell.querySelector('.cell-input')).toBeNull()
      expect(document.activeElement).toBe(grid)
    })
    expect(writes).toEqual([])
  })

  it('lets a real IME composition own command keys until composition ends', async () => {
    const { cell, store, writes } = await mountGrid()
    const input = await startDirectEditing(cell)

    fireEvent.compositionStart(input)
    const enter = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
    })
    input.dispatchEvent(enter)

    expect(enter.defaultPrevented).toBe(false)
    expect(store.getter(editingSessionAtom)).toMatchObject({ status: 'drafting', draft: 'before' })
    expect(writes).toEqual([])

    fireEvent.compositionEnd(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(store.getter(editingSessionAtom).status).toBe('idle'))
    expect(writes).toMatchObject([{ sheetId: 'sheet-1', row: 0, col: 0, input: 'before' }])
  })

  it('commits the current atom draft, moves down, and restores grid focus', async () => {
    const { cell, grid, store, writes } = await mountGrid()
    const input = await startDirectEditing(cell)

    fireEvent.input(input, { target: { value: 'after' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(store.getter(editingSessionAtom).status).toBe('idle')
      expect(store.getter(selectionSnapshotAtom).activeCell).toEqual({
        sheetId: 'sheet-1',
        row: 1,
        col: 0,
      })
      expect(document.activeElement).toBe(grid)
    })
    expect(writes).toMatchObject([{ sheetId: 'sheet-1', row: 0, col: 0, input: 'after' }])
  })

  it('keeps the draft active after a rejected commit so the lifecycle can report the error', async () => {
    const { cell, grid, store, writes } = await mountGrid(true)
    const input = await startDirectEditing(cell)

    fireEvent.input(input, { target: { value: 'retry me' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(store.getter(editingCommitLifecycleAtom)).toMatchObject({ status: 'rejected' })
      expect(store.getter(editingCommitLifecycleAtom).error).toContain('cell input was rejected')
      expect(store.getter(editingSessionAtom)).toMatchObject({
        status: 'drafting',
        draft: 'retry me',
      })
      expect(input.value).toBe('retry me')
      expect(input.getAttribute('aria-invalid')).toBe('true')
      expect(input.getAttribute('aria-errormessage')).toBe('spreadsheet-grid-editing-error')
      expect(cell.querySelector('[role="alert"]')?.textContent).toContain('rejected')
    })
    expect(writes).toHaveLength(1)
    expect(document.activeElement).not.toBe(grid)
  })

  it('announces a locked direct edit and lets its focused recovery action unlock that cell', async () => {
    const { cell, getByTestId, store } = await mountGrid(false, true)

    fireEvent.dblClick(cell)
    const alert = getByTestId('locked-edit-feedback')
    const unlock = getByTestId('locked-edit-feedback-unlock')
    await waitFor(() => expect(alert.getAttribute('role')).toBe('alert'))
    expect(cell.querySelector('.cell-input')).toBeNull()

    fireEvent.click(unlock)
    const password = getByTestId('protection-unlock-password')
    await waitFor(() => {
      expect(store.getter(protectionUnlockStateAtom)).toMatchObject({
        phase: 'editing',
        target: {
          sheetId: 'sheet-1',
          range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
        },
      })
      expect(document.activeElement).toBe(password)
    })
    fireEvent.click(getByTestId('protection-unlock-cancel'))
    await waitFor(() => expect(document.activeElement).toBe(unlock))

    fireEvent.click(unlock)
    fireEvent.click(getByTestId('protection-unlock-confirm'))
    await waitFor(() => expect(store.getter(protectionUnlockStateAtom).phase).toBe('closed'))
    const input = await startDirectEditing(cell)

    await waitFor(() => expect(alert.isConnected).toBe(false))
    expect(input.value).toBe('before')
  })
})
