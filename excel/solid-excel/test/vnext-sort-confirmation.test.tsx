/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import {
  selectionAtom,
  setWorkspaceActiveSheetAtom,
  type SortRangeRequest,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetUiProvider } from '../src-vnext/provider'
import { SpreadsheetToolbar } from '../src-vnext/toolbar'

afterEach(cleanup)

function setTarget(store: ReturnType<typeof createStore>, col: number): void {
  store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-a' })
  store.setter(selectionAtom, {
    kind: 'cell',
    sheetId: 'sheet-a',
    anchor: { row: 3, col },
    focus: { row: 3, col },
  })
}

function createBackend(overrides: Partial<SpreadsheetBackend> = {}): SpreadsheetBackend {
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
    async sortRange(request) {
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
    },
    ...overrides,
  }
}

function renderToolbar(store: ReturnType<typeof createStore>, backend: SpreadsheetBackend) {
  return render(() => (
    <SpreadsheetUiProvider backend={backend} store={store}>
      <SpreadsheetToolbar />
    </SpreadsheetUiProvider>
  ))
}

function byTestId(id: string): HTMLElement {
  return document.body.querySelector(`[data-testid="${id}"]`) as HTMLElement
}

async function chooseDirection(container: HTMLElement, direction: 'asc' | 'desc'): Promise<void> {
  const trigger = container.querySelector('[data-testid="toolbar-btn-sort"]') as HTMLButtonElement
  await waitFor(() => expect(trigger.disabled).toBe(false))
  fireEvent.click(trigger)
  fireEvent.click(byTestId(`toolbar-sort-${direction}`))
}

describe('toolbar sort confirmation', () => {
  it('confirms the frozen range, direction, and key column before sorting', async () => {
    const store = createStore()
    setTarget(store, 2)
    const requests: SortRangeRequest[] = []
    const backend = createBackend({
      async sortRange(request) {
        requests.push(request)
        return {
          kind: 'sort-range',
          sheetId: request.sheetId,
          requestId: request.requestId,
          revision: 2,
          applied: true,
          movedRows: 0,
          movedCells: 0,
          affectedRange: request.range,
        }
      },
    })
    const { container } = renderToolbar(store, backend)

    await chooseDirection(container, 'desc')
    await waitFor(() => expect(byTestId('sort-confirmation-dialog').dataset.status).toBe('ready'))

    expect(requests).toHaveLength(0)
    expect(byTestId('sort-confirmation-range').textContent).toBe('A2:F9')
    expect(byTestId('sort-confirmation-column').textContent).toBe('C')
    expect(byTestId('sort-confirmation-direction').textContent).toBe(
      byTestId('sort-confirmation-confirm').textContent,
    )

    setTarget(store, 4)
    fireEvent.click(byTestId('sort-confirmation-confirm'))
    await waitFor(() => expect(requests).toHaveLength(1))

    expect(requests[0]!.range).toEqual({ rowStart: 1, rowEnd: 8, colStart: 0, colEnd: 5 })
    expect(requests[0]!.keys).toEqual([{ col: 2, direction: 'desc' }])
    expect(document.body.querySelector('[data-testid="sort-confirmation-dialog"]')).toBeNull()
  })

  it('shows range resolution errors and retries without dispatching a sort', async () => {
    const store = createStore()
    setTarget(store, 1)
    let resolutionAttempt = 0
    const sortRange = jest.fn<NonNullable<SpreadsheetBackend['sortRange']>>()
    const backend = createBackend({
      sortRange,
      async resolveDataEdge(request) {
        resolutionAttempt += 1
        if (resolutionAttempt <= 2) throw new Error('range lookup failed')
        return {
          kind: 'resolve-data-edge',
          sheetId: request.sheetId,
          target: request.direction === 'down' ? { row: 6, col: 0 } : { row: 0, col: 3 },
        }
      },
    })
    const { container } = renderToolbar(store, backend)

    await chooseDirection(container, 'asc')
    await waitFor(() => expect(byTestId('sort-confirmation-error').textContent).toContain('failed'))
    expect(sortRange).not.toHaveBeenCalled()

    fireEvent.click(byTestId('sort-confirmation-retry'))
    await waitFor(() => expect(byTestId('sort-confirmation-dialog').dataset.status).toBe('ready'))
    expect(byTestId('sort-confirmation-range').textContent).toBe('A2:D7')
    expect(sortRange).not.toHaveBeenCalled()
  })

  it('keeps the primary action disabled while its range is resolving', async () => {
    const store = createStore()
    setTarget(store, 1)
    const backend = createBackend({
      async resolveDataEdge() {
        return new Promise(() => undefined)
      },
    })
    const { container } = renderToolbar(store, backend)

    await chooseDirection(container, 'asc')
    await waitFor(() =>
      expect(byTestId('sort-confirmation-dialog').dataset.status).toBe('preparing'),
    )

    const confirm = byTestId('sort-confirmation-confirm') as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    expect(confirm.getAttribute('data-variant')).toBe('primary')
    expect(byTestId('sort-confirmation-close').classList.contains('dialog-close-x')).toBe(true)
  })

  it('supports menu arrow navigation and restores trigger focus on Escape', async () => {
    const store = createStore()
    setTarget(store, 0)
    const { container } = renderToolbar(store, createBackend())
    const trigger = container.querySelector('[data-testid="toolbar-btn-sort"]') as HTMLButtonElement
    await waitFor(() => expect(trigger.disabled).toBe(false))

    fireEvent.click(trigger)
    const asc = byTestId('toolbar-sort-asc')
    const desc = byTestId('toolbar-sort-desc')
    await waitFor(() => expect(document.activeElement).toBe(asc))
    fireEvent.keyDown(asc, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(desc)

    fireEvent.click(desc)
    await waitFor(() => expect(byTestId('sort-confirmation-dialog').dataset.status).toBe('ready'))
    fireEvent.keyDown(byTestId('sort-confirmation-dialog'), { key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    expect(document.body.querySelector('[data-testid="sort-confirmation-dialog"]')).toBeNull()
  })

  it('restores the sort trigger when Escape dismisses the menu', async () => {
    const store = createStore()
    setTarget(store, 0)
    const { container } = renderToolbar(store, createBackend())
    const trigger = container.querySelector('[data-testid="toolbar-btn-sort"]') as HTMLButtonElement
    await waitFor(() => expect(trigger.disabled).toBe(false))

    fireEvent.click(trigger)
    await waitFor(() => expect(document.activeElement).toBe(byTestId('toolbar-sort-asc')))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })

    await waitFor(() =>
      expect(document.body.querySelector('[data-testid="toolbar-sort-dropdown"]')).toBeNull(),
    )
    expect(document.activeElement).toBe(trigger)
  })
})
