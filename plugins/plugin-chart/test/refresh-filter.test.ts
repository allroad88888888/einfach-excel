import { createStore } from '@einfach/core'
import { describe, expect, test, vi } from 'vitest'
import {
  beginProjectionAtom,
  initializeWorkbookDocumentAtom,
  resolveProjectionAtom,
  resolveSpreadsheetRuntimeAtom,
  type DisplayCell,
  type DrawingRange,
  type RustWorkbookConnection,
  type VisibleProjectionRequest,
  type WorkbookChangeEvent,
} from '@einfach-excel/spreadsheet-ui-core'
import {
  canSkipChartDataRead,
  chartGridsAtom,
  loadChartGridAtom,
  sameChartSnapshot,
} from '../src/core'
import { chartDrawing, num, text } from './rust-fixture'

const A1B3: DrawingRange = { startRow: 0, startCol: 0, endRow: 2, endCol: 1 }

function formulaNum(row: number, col: number, value: number, formula: string): DisplayCell {
  return {
    row,
    col,
    displayValue: String(value),
    numericValue: value,
    valueKind: 'number',
    formula,
  } as DisplayCell
}

function setupFilterFixture(initialCells: DisplayCell[]) {
  const store = createStore()
  let subscriber: ((event: Omit<WorkbookChangeEvent, 'connectionId'>) => void) | undefined
  const rust = {
    cells: [...initialCells],
    revision: 1,
  }
  const request = vi.fn(async (command: string, payload: { request: VisibleProjectionRequest }) => {
    if (command === 'projection.readVisible') {
      const { rowStart, rowEnd, colStart, colEnd } = payload.request.window
      return {
        ...payload.request,
        revision: rust.revision,
        cells: rust.cells.filter(
          (c) => c.row >= rowStart && c.row <= rowEnd && c.col >= colStart && c.col <= colEnd,
        ),
      }
    }
    throw new Error(`Unexpected command: ${command}`)
  })
  const connection: RustWorkbookConnection = {
    request: request as unknown as RustWorkbookConnection['request'],
    subscribe: (listener) => {
      subscriber = listener as typeof subscriber
      return () => {
        subscriber = undefined
      }
    },
    dispose: () => undefined,
  }
  store.setter(initializeWorkbookDocumentAtom, {
    title: 'Book',
    sheets: [
      { id: 's', index: 0, name: 'Sheet1', rowCount: 300, colCount: 50 },
      { id: 't', index: 1, name: 'Sheet2', rowCount: 300, colCount: 50 },
    ],
  })
  store.setter(resolveSpreadsheetRuntimeAtom, { connection })

  const publishRev = (revision: number, event?: Omit<WorkbookChangeEvent, 'connectionId' | 'revision' | 'operationId'>) => {
    rust.revision = revision
    if (event) {
      subscriber?.({
        operationId: `native-${revision}`,
        revision,
        ...event,
      })
    }
    const started = store.setter(beginProjectionAtom, {
      kind: 'visible-window',
      sheetId: 's',
      reason: 'test',
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 9 },
    })
    if (started.status !== 'started') throw new Error('Expected projection start')
    store.setter(resolveProjectionAtom, {
      request: started.request as VisibleProjectionRequest,
      result: { ...started.request, cells: [], revision } as never,
    })
  }
  publishRev(1)
  return {
    store,
    rust,
    publishRev,
    reads: () => request.mock.calls.filter(([cmd]) => cmd === 'projection.readVisible'),
  }
}

describe('chart refresh hit filtering & snapshot deduplication', () => {
  test('skips readDisplay RPC for drawing moves, resize, freeze, notes and disjoint format changes', async () => {
    const { store, publishRev, reads } = setupFilterFixture([
      text(0, 0, 'Region'),
      text(0, 1, 'Sales'),
      text(1, 0, 'East'),
      formulaNum(1, 1, 100, '=SUM(D1:D5)'),
    ])
    const drawing = chartDrawing('c1', [A1B3])
    await store.setter(loadChartGridAtom, drawing)
    expect(reads()).toHaveLength(1)
    const initialGrid = store.getter(chartGridsAtom).c1!.grid

    // Dragging/updating a drawing on the sheet never re-reads chart cells even when chart has formulas.
    publishRev(2, {
      source: 'user',
      kind: 'drawings.set',
      changes: [{ sheetId: 's', ranges: [] }],
    })
    await store.setter(loadChartGridAtom, drawing)
    expect(reads()).toHaveLength(1)

    // Resizing columns and freezing panes skip RPC.
    publishRev(3, {
      source: 'user',
      kind: 'range.resize',
      changes: [{ sheetId: 's', ranges: [{ rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 1 }] }],
    })
    await store.setter(loadChartGridAtom, drawing)
    publishRev(4, {
      source: 'api',
      kind: 'host.freeze',
      changes: [{ sheetId: 's', ranges: [] }],
    })
    await store.setter(loadChartGridAtom, drawing)
    expect(reads()).toHaveLength(1)

    // Disjoint format.setRange on the same sheet skips RPC.
    publishRev(5, {
      source: 'user',
      kind: 'format.setRange',
      changes: [{ sheetId: 's', ranges: [{ rowStart: 10, rowEnd: 12, colStart: 5, colEnd: 6 }] }],
    })
    await store.setter(loadChartGridAtom, drawing)
    expect(reads()).toHaveLength(1)
    expect(store.getter(chartGridsAtom).c1!.grid).toBe(initialGrid)

    // Overlapping format.setRange (which could change numberFormat displayValue!) DOES re-read.
    publishRev(6, {
      source: 'user',
      kind: 'format.setRange',
      changes: [{ sheetId: 's', ranges: [{ rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1 }] }],
    })
    await store.setter(loadChartGridAtom, drawing)
    expect(reads()).toHaveLength(2)
    // Snapshot content is identical, so grid reference is STILL preserved (no ECharts redraw!).
    expect(store.getter(chartGridsAtom).c1!.grid).toBe(initialGrid)
  })

  test('skips cross-sheet edits when chart cells are purely static, but NEVER skips when formulas exist', async () => {
    // 1. Static chart (no formulas): editing Sheet2 skips RPC!
    const staticCtx = setupFilterFixture([
      text(0, 0, 'Month'),
      text(0, 1, 'Units'),
      text(1, 0, 'Jan'),
      num(1, 1, 50),
    ])
    const drawing = chartDrawing('c1', [A1B3])
    await staticCtx.store.setter(loadChartGridAtom, drawing)
    expect(staticCtx.reads()).toHaveLength(1)

    staticCtx.publishRev(2, {
      source: 'user',
      kind: 'cell.setInput',
      changes: [{ sheetId: 't', ranges: [{ rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }] }],
    })
    await staticCtx.store.setter(loadChartGridAtom, drawing)
    expect(staticCtx.reads()).toHaveLength(1)

    // 2. Formula-driven chart (=Sheet2!A1*2): editing Sheet2 MUST re-read and update downstream result!
    const formulaCtx = setupFilterFixture([
      text(0, 0, 'Month'),
      text(0, 1, 'Units'),
      text(1, 0, 'Jan'),
      formulaNum(1, 1, 50, '=Sheet2!A1*2'),
    ])
    await formulaCtx.store.setter(loadChartGridAtom, drawing)
    expect(formulaCtx.reads()).toHaveLength(1)
    const beforeGrid = formulaCtx.store.getter(chartGridsAtom).c1!.grid

    // Unrelated edit on Sheet2 where formula output stays 50: re-reads once, keeps same grid reference!
    formulaCtx.publishRev(2, {
      source: 'user',
      kind: 'cell.setInput',
      changes: [{ sheetId: 't', ranges: [{ rowStart: 9, rowEnd: 9, colStart: 9, colEnd: 9 }] }],
    })
    await formulaCtx.store.setter(loadChartGridAtom, drawing)
    expect(formulaCtx.reads()).toHaveLength(2)
    expect(formulaCtx.store.getter(chartGridsAtom).c1!.grid).toBe(beforeGrid)

    // Edit on Sheet2!A1 that changes downstream formula output to 180: re-reads and publishes new grid!
    formulaCtx.rust.cells = [
      text(0, 0, 'Month'),
      text(0, 1, 'Units'),
      text(1, 0, 'Jan'),
      formulaNum(1, 1, 180, '=Sheet2!A1*2'),
    ]
    formulaCtx.publishRev(3, {
      source: 'user',
      kind: 'cell.setInput',
      changes: [{ sheetId: 't', ranges: [{ rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }] }],
    })
    await formulaCtx.store.setter(loadChartGridAtom, drawing)
    expect(formulaCtx.reads()).toHaveLength(3)
    const updatedGrid = formulaCtx.store.getter(chartGridsAtom).c1!.grid!
    expect(updatedGrid).not.toBe(beforeGrid)
    expect(updatedGrid[1]![1]).toEqual({ display: '180', value: 180, kind: 'number' })
  })

  test('multi-step revision jumps never skip reading even if the latest event is benign', async () => {
    const { store, rust, publishRev, reads } = setupFilterFixture([
      text(0, 0, 'A'),
      num(1, 0, 10),
    ])
    const drawing = chartDrawing('c1', [{ startRow: 0, startCol: 0, endRow: 1, endCol: 0 }])
    await store.setter(loadChartGridAtom, drawing)
    expect(reads()).toHaveLength(1)

    // Revision jumps from 1 directly to 3 (e.g. rev 2 edited A2, rev 3 moved a drawing).
    rust.cells = [text(0, 0, 'A'), num(1, 0, 99)]
    publishRev(3, {
      source: 'user',
      kind: 'drawings.set',
      changes: [{ sheetId: 's', ranges: [] }],
    })
    await store.setter(loadChartGridAtom, drawing)
    expect(reads()).toHaveLength(2)
    expect(store.getter(chartGridsAtom).c1!.grid![1]![0]!.value).toBe(99)
  })

  test('unit helpers handle empty events, hidden axis changes, and -0/+0 value distinction', () => {
    expect(canSkipChartDataRead(null, [A1B3], 's', false)).toBe(false)
    expect(
      sameChartSnapshot(
        [[{ display: '0', value: 0, kind: 'number' }]],
        { rows: [], cols: [] },
        [[{ display: '0', value: -0, kind: 'number' }]],
        { rows: [], cols: [] },
      ),
    ).toBe(false)
    expect(
      sameChartSnapshot(
        [[{ display: '1', value: 1, kind: 'number' }]],
        { rows: [], cols: [] },
        [[{ display: '1', value: 1, kind: 'number' }]],
        { rows: [1], cols: [] },
      ),
    ).toBe(false)
  })
})
