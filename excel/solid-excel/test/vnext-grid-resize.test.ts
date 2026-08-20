import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { createStore } from '@einfach/core'
import {
  MAX_VIEWPORT_ROW_HEIGHT,
  MIN_VIEWPORT_COL_WIDTH,
  pointerSessionAtom,
  projectionSnapshotAtom,
  viewportSizeOverridesAtom,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { createGridDomAdapter } from '../src-vnext/grid/grid-dom-adapter'
import { installGridAutoFitController } from '../src-vnext/grid/grid-auto-fit-controller'
import { installGridResizeController } from '../src-vnext/grid/grid-resize-controller'

type AutoFitRuntime = Parameters<typeof installGridAutoFitController>[0]
type ResizeRuntime = Parameters<typeof installGridResizeController>[0]

interface ResizeFixtureOptions {
  readonly rejectColumnWrite?: Error
}

function pointerEvent(
  type: string,
  {
    clientX = 0,
    clientY = 0,
    pointerId = 1,
    button = 0,
  }: {
    readonly clientX?: number
    readonly clientY?: number
    readonly pointerId?: number
    readonly button?: number
  } = {},
): PointerEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button })
  Object.defineProperties(event, {
    isPrimary: { value: true },
    pointerId: { value: pointerId },
    pointerType: { value: 'mouse' },
  })
  return event as PointerEvent
}

function createResizeFixture(options: ResizeFixtureOptions = {}) {
  const store = createStore()
  const columnWidthCalls: Array<{ colIndex: number; widthPx: number }> = []
  const rowHeightCalls: Array<{ rowIndex: number; heightPx: number }> = []
  let columnWriteFailure = options.rejectColumnWrite
  let hydrateSizeCalls = 0
  const dom = createGridDomAdapter()
  const runtime = {
    props: {
      sheetId: 'sheet-1',
      viewport: {
        scrollTop: 0,
        scrollLeft: 0,
        viewportHeight: 100,
        viewportWidth: 100,
        rowHeight: 24,
        colWidth: 96,
        rowCount: 3,
        colCount: 3,
      },
    },
    store,
    backend: {
      async setCellInput() {
        throw new Error('not used')
      },
      async readVisibleProjection() {
        throw new Error('not used')
      },
      async setColumnWidth(request: { colIndex: number; widthPx: number }) {
        columnWidthCalls.push({ colIndex: request.colIndex, widthPx: request.widthPx })
        if (columnWriteFailure) throw columnWriteFailure
        return { sheetId: 'sheet-1' }
      },
      async setRowHeight(request: { rowIndex: number; heightPx: number }) {
        rowHeightCalls.push({ rowIndex: request.rowIndex, heightPx: request.heightPx })
        return { sheetId: 'sheet-1' }
      },
    } as unknown as SpreadsheetBackend,
    atoms: {},
    dom,
    getRenderedColumnWidth: () => 96,
    getRenderedRowHeight: () => 24,
    // persist 成功后的收敛 hydrate(grid-resize-controller)——计数供断言。
    hydrateViewportSizeProjection: async () => {
      hydrateSizeCalls += 1
    },
  }
  const autoFit = installGridAutoFitController(runtime as unknown as AutoFitRuntime)
  const resize = installGridResizeController({ ...runtime, ...autoFit } as unknown as ResizeRuntime)
  return {
    autoFit,
    columnWidthCalls,
    dom,
    getHydrateSizeCalls: () => hydrateSizeCalls,
    resize,
    rowHeightCalls,
    setColumnWriteFailure: (error: Error | undefined) => {
      columnWriteFailure = error
    },
    store,
  }
}

afterEach(() => {
  jest.restoreAllMocks()
  document.body.replaceChildren()
})

describe('vnext grid header resize', () => {
  it('clamps the preview at the minimum and restores the original size on pointer cancellation', () => {
    const { columnWidthCalls, resize, store } = createResizeFixture()

    resize.startColumnResize(pointerEvent('pointerdown', { clientX: 100 }), 1)
    window.dispatchEvent(pointerEvent('pointermove', { clientX: -10_000 }))

    expect(store.getter(pointerSessionAtom)).toMatchObject({
      status: 'active',
      interaction: { kind: 'column-resize', previewSizePx: MIN_VIEWPORT_COL_WIDTH },
    })
    expect(store.getter(viewportSizeOverridesAtom).colWidthsBySheet['sheet-1']).toEqual({
      '1': MIN_VIEWPORT_COL_WIDTH,
    })

    window.dispatchEvent(pointerEvent('pointercancel'))

    expect(store.getter(pointerSessionAtom)).toMatchObject({ status: 'idle', interaction: null })
    expect(store.getter(viewportSizeOverridesAtom).colWidthsBySheet['sheet-1']).toEqual({ '1': 96 })
    expect(columnWidthCalls).toEqual([])
  })

  it('ignores non-primary resize starts and unrelated pointers before committing the bounded row size', async () => {
    const { resize, rowHeightCalls, store } = createResizeFixture()

    resize.startRowResize(pointerEvent('pointerdown', { button: 2 }), 2)
    expect(store.getter(pointerSessionAtom)).toMatchObject({ status: 'idle', interaction: null })

    resize.startRowResize(pointerEvent('pointerdown', { clientY: 20, pointerId: 4 }), 2)
    window.dispatchEvent(pointerEvent('pointermove', { clientY: 10_000, pointerId: 5 }))
    expect(store.getter(viewportSizeOverridesAtom).rowHeightsBySheet).toEqual({})

    window.dispatchEvent(pointerEvent('pointermove', { clientY: 10_000, pointerId: 4 }))
    window.dispatchEvent(pointerEvent('pointerup', { clientY: 10_000, pointerId: 5 }))
    expect(store.getter(pointerSessionAtom)).toMatchObject({ status: 'active' })

    window.dispatchEvent(pointerEvent('pointerup', { clientY: 10_000, pointerId: 4 }))
    await Promise.resolve()

    expect(store.getter(pointerSessionAtom)).toMatchObject({ status: 'idle', interaction: null })
    expect(rowHeightCalls).toEqual([{ rowIndex: 2, heightPx: MAX_VIEWPORT_ROW_HEIGHT }])
  })

  it('reports rejected dimension writes through the shared command failure lifecycle', async () => {
    const rejection = new Error('column dimensions are locked')
    const { resize, store } = createResizeFixture({ rejectColumnWrite: rejection })

    resize.startColumnResize(pointerEvent('pointerdown', { clientX: 40 }), 0)
    window.dispatchEvent(pointerEvent('pointermove', { clientX: 60 }))
    window.dispatchEvent(pointerEvent('pointerup', { clientX: 60 }))
    await Promise.resolve()
    await Promise.resolve()

    expect(store.getter(projectionSnapshotAtom)).toMatchObject({
      status: 'error',
      error: { code: 'BACKEND_ERROR', message: 'column dimensions are locked' },
    })
  })

  it('auto-fits with the same bounds and reports a rejected auto-fit write', async () => {
    const { autoFit, dom, setColumnWriteFailure, store } = createResizeFixture()
    const root = document.createElement('div')
    root.innerHTML = [
      '<div class="spreadsheet-grid-col-header" data-col="0">',
      '<span class="spreadsheet-grid-header-label">A</span>',
      '</div>',
    ].join('')
    document.body.appendChild(root)
    dom.setGridRoot(root)

    await autoFit.autoFitColumn(0)
    expect(store.getter(viewportSizeOverridesAtom).colWidthsBySheet['sheet-1']).toEqual({
      '0': MIN_VIEWPORT_COL_WIDTH,
    })

    setColumnWriteFailure(new Error('auto-fit is disabled'))
    await autoFit.autoFitColumn(0)

    expect(store.getter(projectionSnapshotAtom)).toMatchObject({
      status: 'error',
      error: { code: 'BACKEND_ERROR', message: 'auto-fit is disabled' },
    })
  })

  it('restores a compacted row to at least the default viewport height', async () => {
    const { autoFit, dom, rowHeightCalls, store } = createResizeFixture()
    const root = document.createElement('div')
    root.innerHTML = [
      '<div class="spreadsheet-grid-row-header" data-row="1">',
      '<span class="spreadsheet-grid-header-label">2</span>',
      '</div>',
    ].join('')
    document.body.appendChild(root)
    dom.setGridRoot(root)

    await autoFit.autoFitRow(1)

    expect(rowHeightCalls).toEqual([{ rowIndex: 1, heightPx: 24 }])
    expect(store.getter(viewportSizeOverridesAtom).rowHeightsBySheet['sheet-1']).toEqual({
      '1': 24,
    })
  })
})
