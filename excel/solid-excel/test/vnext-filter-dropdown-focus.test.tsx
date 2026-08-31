/** @jsxImportSource solid-js */
/* eslint-disable import/no-extraneous-dependencies -- root Jest supplies these test dependencies. */

import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import type { SpreadsheetBackend } from '@einfach/spreadsheet-ui-core'
import {
  createVisibleProjectionRequest,
  filterDropdownAtom,
  filterSortLifecycleAtom,
  filterSortStateAtom,
  openFilterDropdownAtom,
  setWorkspaceActiveSheetAtom,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetFilterDropdown } from '../src/filter-sort'
import { SpreadsheetUiProvider } from '../src/provider'
import { seedReadyVisibleProjection } from './projection-test-fixture'

afterEach(cleanup)

function createBackend(overrides: Partial<SpreadsheetBackend> = {}): SpreadsheetBackend {
  return {
    async readVisibleProjection(req) {
      return {
        kind: 'visible-window',
        sheetId: req.sheetId,
        requestId: req.requestId,
        revision: 1,
        window: req.window,
        cells: [],
      }
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    async setCellInput() {
      throw new Error('not used')
    },
    async setFilterSort(req) {
      return {
        sheetId: req.sheetId,
        requestId: req.requestId,
        revision: 1,
        historyRecorded: false,
        hiddenRowIndices: [],
      }
    },
    ...overrides,
  }
}

function openDropdown(store: ReturnType<typeof createStore>) {
  store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-1' })
  store.setter(openFilterDropdownAtom, { sheetId: 'sheet-1', colIndex: 0 })
}

function renderDropdown(store: ReturnType<typeof createStore>, backend: SpreadsheetBackend) {
  return render(() => (
    <SpreadsheetUiProvider backend={backend} store={store}>
      <button type="button" data-testid="filter-opener">
        Open filter
      </button>
      <SpreadsheetFilterDropdown />
    </SpreadsheetUiProvider>
  ))
}

async function waitForEditing(store: ReturnType<typeof createStore>) {
  await waitFor(() => expect(store.getter(filterSortLifecycleAtom).status).toBe('editing'))
}

function applyEquals(container: HTMLElement, value: string) {
  fireEvent.change(container.querySelector('[data-testid="filter-condition-kind"]')!, {
    target: { value: 'equals' },
  })
  fireEvent.input(container.querySelector('[data-testid="filter-equals-input"]')!, {
    target: { value },
  })
  fireEvent.click(container.querySelector('[data-testid="filter-add-equals"]')!)
}

describe('vNext SpreadsheetFilterDropdown focus contract', () => {
  it('focuses search on open and restores the invoking control after Escape', async () => {
    const store = createStore()
    const { container } = renderDropdown(store, createBackend())
    const opener = container.querySelector('[data-testid="filter-opener"]') as HTMLButtonElement
    opener.focus()

    openDropdown(store)
    await waitForEditing(store)
    const search = container.querySelector(
      '[data-testid="filter-search-input"]',
    ) as HTMLInputElement
    await waitFor(() => expect(document.activeElement).toBe(search))
    const dropdown = container.querySelector('[data-testid="filter-dropdown"]')
    expect(dropdown?.getAttribute('role')).toBe('dialog')
    expect(dropdown?.getAttribute('aria-modal')).toBeNull()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(store.getter(filterDropdownAtom).status).toBe('closed'))
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })

  it('submits a range draft from Enter in either range field', async () => {
    const store = createStore()
    openDropdown(store)
    const { container } = renderDropdown(store, createBackend())
    await waitForEditing(store)

    fireEvent.change(container.querySelector('[data-testid="filter-condition-kind"]')!, {
      target: { value: 'range' },
    })
    fireEvent.input(container.querySelector('[data-testid="filter-range-min-input"]')!, {
      target: { value: '10' },
    })
    const max = container.querySelector('[data-testid="filter-range-max-input"]')!
    fireEvent.input(max, { target: { value: '20' } })
    fireEvent.keyDown(max, { key: 'Enter' })

    await waitFor(() => {
      expect(store.getter(filterSortStateAtom)['sheet-1']?.rules).toEqual([
        { kind: 'range', colIndex: 0, min: 10, max: 20 },
      ])
      expect(store.getter(filterDropdownAtom).status).toBe('closed')
    })
  })

  it('focuses retry after projection refresh fails and associates the error with the dialog', async () => {
    const store = createStore()
    const window = { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 0 }
    seedReadyVisibleProjection(store, {
      status: 'ready',
      request: createVisibleProjectionRequest({
        sheetId: 'sheet-1',
        requestId: 1,
        reason: 'viewport',
        window,
      }),
      result: {
        kind: 'visible-window',
        sheetId: 'sheet-1',
        requestId: 1,
        revision: 1,
        window,
        cells: [],
      },
      error: undefined,
    })
    openDropdown(store)
    const { container } = renderDropdown(
      store,
      createBackend({
        async readVisibleProjection() {
          throw new Error('projection refresh failed')
        },
      }),
    )
    await waitForEditing(store)

    applyEquals(container, 'North')
    await waitFor(() => expect(store.getter(filterSortLifecycleAtom).status).toBe('refresh-failed'))
    const retry = container.querySelector(
      '[data-testid="filter-refresh-retry"]',
    ) as HTMLButtonElement
    await waitFor(() => expect(document.activeElement).toBe(retry))
    const dialog = container.querySelector('[data-testid="filter-dropdown"]')!
    expect(dialog.getAttribute('aria-describedby')).toBe('filter-dropdown-error')
    expect(container.querySelector('[data-testid="filter-error-text"]')?.getAttribute('role')).toBe(
      'alert',
    )
  })
})
