/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from 'vitest'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import type {
  SortRangeRequest,
  SortRangeResult,
  SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import {
  filterSortEntrypointStateAtom,
  selectionAtom,
  setWorkspaceActiveSheetAtom,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetMenuBar } from '../src/menu-bar'
import { SpreadsheetUiProvider } from '../src/provider'
import { SpreadsheetToolbar } from '../src/toolbar'

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

function button(container: HTMLElement, testId: string): HTMLButtonElement {
  return container.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement
}

async function openMenuSort(container: HTMLElement): Promise<void> {
  const data = button(container, 'menu-bar-button-data')
  fireEvent.click(data)
  const sortDescending = button(container, 'menu-bar-item-data.sortDesc')
  await waitFor(() => expect(sortDescending.disabled).toBe(false))
  fireEvent.click(sortDescending)
}

describe('menu-bar sort confirmation', () => {
  it('defers mutation, owns one dialog, restores Data focus, and confirms as menu-bar', async () => {
    const store = createStore()
    store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-a' })
    store.setter(selectionAtom, {
      kind: 'cell',
      sheetId: 'sheet-a',
      anchor: { row: 3, col: 2 },
      focus: { row: 3, col: 2 },
    })
    const acknowledgement = deferred<SortRangeResult>()
    const requests: SortRangeRequest[] = []
    const backend = createBackend((request) => {
      requests.push(request)
      return acknowledgement.promise
    })
    const { container } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetMenuBar />
        <SpreadsheetToolbar />
      </SpreadsheetUiProvider>
    ))

    await openMenuSort(container)
    await waitFor(() =>
      expect(button(document.body, 'sort-confirmation-dialog').dataset.status).toBe('ready'),
    )
    expect(document.body.querySelectorAll('[data-testid="sort-confirmation-dialog"]')).toHaveLength(
      1,
    )
    expect(requests).toHaveLength(0)

    fireEvent.keyDown(button(document.body, 'sort-confirmation-dialog'), { key: 'Escape' })
    await waitFor(() =>
      expect(document.activeElement).toBe(button(container, 'menu-bar-button-data')),
    )
    expect(document.body.querySelector('[data-testid="sort-confirmation-dialog"]')).toBeNull()
    expect(requests).toHaveLength(0)

    await openMenuSort(container)
    await waitFor(() =>
      expect(button(document.body, 'sort-confirmation-confirm').disabled).toBe(false),
    )
    fireEvent.click(button(document.body, 'sort-confirmation-confirm'))
    await waitFor(() => expect(requests).toHaveLength(1))
    expect(store.getter(filterSortEntrypointStateAtom)).toMatchObject({
      status: 'pending',
      entrypoint: 'menu-bar',
    })
    expect(requests[0]!.keys).toEqual([{ col: 2, direction: 'desc' }])

    acknowledgement.resolve(sortResult(requests[0]!))
    await waitFor(() => expect(store.getter(filterSortEntrypointStateAtom).status).toBe('idle'))
  })
})
