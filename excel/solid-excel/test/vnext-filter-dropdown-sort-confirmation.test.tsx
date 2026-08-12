/** @jsxImportSource solid-js */
/* eslint-disable import/no-extraneous-dependencies -- root Jest supplies these test dependencies. */

import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import type {
  SortRangeRequest,
  SortRangeResult,
  SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import {
  filterSortEntrypointStateAtom,
  openFilterDropdownAtom,
  selectionAtom,
  setWorkspaceActiveSheetAtom,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetFilterDropdown } from '../src-vnext/filter-sort'
import { SpreadsheetUiProvider } from '../src-vnext/provider'
import { SpreadsheetToolbar } from '../src-vnext/toolbar'

afterEach(cleanup)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function sortResult(request: SortRangeRequest): SortRangeResult {
  return {
    kind: 'sort-range',
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision: 2,
    applied: true,
    movedRows: 2,
    movedCells: 12,
    affectedRange: request.range,
  }
}

function createBackend(sortRange: SpreadsheetBackend['sortRange']): SpreadsheetBackend {
  return {
    async readVisibleProjection(request) {
      return {
        kind: 'visible-window',
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: 2,
        window: request.window,
        cells: [],
      }
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    async setCellInput() {
      throw new Error('not used')
    },
    async setFilterSort(request) {
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: 1,
        historyRecorded: false,
        hiddenRowIndices: [],
      }
    },
    async resolveDataEdge(request) {
      return {
        kind: 'resolve-data-edge',
        sheetId: request.sheetId,
        target: request.direction === 'down' ? { row: 8, col: 0 } : { row: 0, col: 5 },
      }
    },
    sortRange,
  }
}

function setSelection(
  store: ReturnType<typeof createStore>,
  col: number,
  sheetId = 'sheet-1',
): void {
  store.setter(selectionAtom, {
    kind: 'cell',
    sheetId,
    anchor: { row: 3, col },
    focus: { row: 3, col },
  })
}

function openDropdown(store: ReturnType<typeof createStore>, colIndex: number): void {
  store.setter(openFilterDropdownAtom, { sheetId: 'sheet-1', colIndex })
}

function button(root: ParentNode, testId: string): HTMLButtonElement {
  return root.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement
}

async function openSortConfirmation(
  container: HTMLElement,
  direction: 'asc' | 'desc',
): Promise<void> {
  const trigger = button(container, `filter-sort-${direction}`)
  await waitFor(() => expect(trigger.disabled).toBe(false))
  fireEvent.click(trigger)
  await waitFor(() =>
    expect(button(document.body, 'sort-confirmation-dialog').dataset.status).toBe('ready'),
  )
}

describe('filter dropdown sort confirmation', () => {
  it('defers sorting, preserves the dropdown target, owns one dialog, and restores the opener', async () => {
    const store = createStore()
    store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
    setSelection(store, 0)
    const acknowledgement = deferred<SortRangeResult>()
    const requests: SortRangeRequest[] = []
    const backend = createBackend((request) => {
      requests.push(request)
      return acknowledgement.promise
    })
    const { container } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <button type="button" data-testid="filter-opener">
          Open filter
        </button>
        <SpreadsheetFilterDropdown />
        <SpreadsheetToolbar />
      </SpreadsheetUiProvider>
    ))
    const opener = button(container, 'filter-opener')

    opener.focus()
    openDropdown(store, 2)
    await openSortConfirmation(container, 'desc')
    expect(document.body.querySelectorAll('[data-testid="sort-confirmation-dialog"]')).toHaveLength(
      1,
    )
    expect(requests).toHaveLength(0)

    fireEvent.keyDown(button(document.body, 'sort-confirmation-dialog'), { key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(opener))
    expect(requests).toHaveLength(0)

    setSelection(store, 4)
    opener.focus()
    openDropdown(store, 2)
    await openSortConfirmation(container, 'asc')
    store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-2' })
    setSelection(store, 5, 'sheet-2')

    fireEvent.click(button(document.body, 'sort-confirmation-confirm'))
    await waitFor(() => expect(requests).toHaveLength(1))
    expect(store.getter(filterSortEntrypointStateAtom)).toMatchObject({
      status: 'pending',
      entrypoint: 'filter-dropdown',
      target: { sheetId: 'sheet-1', colIndex: 2 },
    })
    expect(requests[0]).toMatchObject({
      sheetId: 'sheet-1',
      keys: [{ col: 2, direction: 'asc' }],
      range: { rowStart: 1, rowEnd: 8, colStart: 0, colEnd: 5 },
    })

    acknowledgement.resolve(sortResult(requests[0]!))
    await waitFor(() => expect(store.getter(filterSortEntrypointStateAtom).status).toBe('idle'))
  })
})
