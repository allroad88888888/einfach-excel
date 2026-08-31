/** @jsxImportSource solid-js */

import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { render, cleanup, fireEvent, waitFor } from '@solidjs/testing-library'
import type {
  DisplayCell,
  SpreadsheetBackend,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { planSnappedScrollPlacement, setViewportRowHeightAtom } from '@einfach/spreadsheet-ui-core'
import { createSignal } from 'solid-js'
import { SpreadsheetGrid } from '../src/grid'
import { SpreadsheetUiProvider } from '../src/provider'

afterEach(cleanup)

const viewport = {
  scrollTop: 0,
  scrollLeft: 0,
  viewportHeight: 2,
  viewportWidth: 2,
  rowHeight: 1,
  colWidth: 1,
  rowCount: 20,
  colCount: 20,
  overscanRows: 0,
  overscanCols: 0,
}

function createProjectionBackend() {
  const requests: VisibleProjectionRequest[] = []
  const backend: SpreadsheetBackend = {
    async readVisibleProjection(request) {
      requests.push(request)
      const cells: DisplayCell[] = [
        {
          row: request.window.rowStart,
          col: request.window.colStart,
          displayValue: request.sheetId,
        },
      ]
      const result: VisibleProjectionResult = {
        kind: 'visible-window',
        sheetId: request.sheetId,
        window: { ...request.window },
        requestId: request.requestId,
        revision: request.revision,
        cells,
      }
      return result
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    async setCellInput() {
      throw new Error('not used')
    },
  }
  return { backend, requests }
}

describe('vnext grid scroll continuity', () => {
  it('requests the new sheet when its anchored window coordinates are unchanged', async () => {
    const store = createStore()
    const { backend, requests } = createProjectionBackend()
    let setCurrentSheetId!: (sheetId: string) => void

    function GridHost() {
      const [currentSheetId, setSheetId] = createSignal('sheet-1')
      setCurrentSheetId = setSheetId
      return <SpreadsheetGrid sheetId={currentSheetId()} viewport={viewport} />
    }

    const { container } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <GridHost />
      </SpreadsheetUiProvider>
    ))

    await waitFor(() => {
      expect(requests).toHaveLength(1)
      expect(requests[0]?.sheetId).toBe('sheet-1')
    })

    setCurrentSheetId('sheet-2')

    await waitFor(() => {
      expect(requests).toHaveLength(2)
      expect(requests[1]?.sheetId).toBe('sheet-2')
      expect(
        container.querySelector('[data-row="0"][data-col="0"] .cell-display')?.textContent,
      ).toBe('sheet-2')
    })
  })

  it('replaces the anchor and projection after asynchronous row sizing changes geometry', async () => {
    const store = createStore()
    const { backend, requests } = createProjectionBackend()
    const { container } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetGrid sheetId="sheet-1" viewport={viewport} />
      </SpreadsheetUiProvider>
    ))

    await waitFor(() => {
      expect(requests).toHaveLength(1)
    })

    const scroller = container.querySelector('.spreadsheet-grid-scroll-viewport') as HTMLDivElement
    scroller.scrollTop = 7
    fireEvent.scroll(scroller)

    await waitFor(() => {
      expect(requests).toHaveLength(2)
      expect(requests[1]?.window.rowStart).toBe(3)
    })

    store.setter(setViewportRowHeightAtom, {
      sheetId: 'sheet-1',
      rowIndex: 0,
      heightPx: 5,
    })

    await waitFor(() => {
      expect(requests).toHaveLength(3)
      expect(requests[2]?.window.rowStart).toBe(0)
    })
  })

  it('keeps the clamped logical position when a resized surface constrains a snapped anchor', () => {
    const placement = planSnappedScrollPlacement(
      900,
      { totalPx: 1000, viewportPx: 100, surfacePx: 500 },
      () => 470,
    )

    expect(placement).toEqual({ anchorPx: 500, physicalPx: 400 })
    expect(placement.anchorPx + placement.physicalPx).toBe(900)
  })
})
