import { describe, expect, test, vi } from 'vitest'
import { repeatLabelFor } from '../src/repeat/label'
import { buildCellContent } from '../src/copy-as/html-cell-text'
import { sortRange } from '../src/rust-workbook/sort-io'
import {
  applySelectionFormatAtom, createSpreadsheetUi, runVisibleProjectionAtom,
  selectCellAtom, setSelectionBoundsAtom,
  type RustWorkbookConnection, type VisibleProjectionRequest,
} from '../src'

describe('review hardening regressions', () => {
  test('enabling wrap text keeps wrap-text repeat label despite clearing shrinkToFit', () => {
    expect(repeatLabelFor({
      kind: 'mutation',
      mutation: { kind: 'format', format: { wrap: true, shrinkToFit: false } },
    })).toBe('wrap-text')
  })

  test('HTML cell export rounds superscript/subscript font sizes and vertical offsets cleanly', () => {
    const html = buildCellContent({
      row: 0, col: 0, valueKind: 'text', displayValue: 'x2', rawValue: 'x2',
      format: { fontSize: 12, fontBaseline: 'superscript' },
    })
    expect(html).toContain('font-size: 7.8pt')
    expect(html).toContain('vertical-align: 3.6pt')
    expect(html).not.toContain('7.800000000000001')
  })

  test('sortRange rejects duplicate value columns even when a color sort level is present', () => {
    const workbook = {
      sortRange: vi.fn(),
      history_begin: vi.fn(),
      history_finish: vi.fn(),
      read_sparse_range: vi.fn(),
      snapshot_format_range: vi.fn(),
    } as never
    expect(() => sortRange(workbook, 0, {
      sheetId: 's',
      range: { rowStart: 0, rowEnd: 5, colStart: 0, colEnd: 3 },
      hasHeader: false,
      keys: [
        { col: 0, sortOn: 'cell-color', color: '#ff0000', position: 'top' },
        { col: 1, direction: 'asc' },
        { col: 1, direction: 'desc' },
      ],
      projection: {
        kind: 'visible-window', sheetId: 's', requestId: 1, reason: 'toolbar',
        window: { rowStart: 0, rowEnd: 5, colStart: 0, colEnd: 3 },
        viewport: { width: 800, height: 600, scrollLeft: 0, scrollTop: 0 },
      },
    })).toThrow('Choose 1–8 different columns inside the selected range.')
    expect(workbook.sortRange).not.toHaveBeenCalled()
  })

  test('quick fill-color toggle applies solid fill on pattern cell sharing the preset fallback color', async () => {
    const writes: unknown[] = []
    const request = vi.fn(async (command: string, payload: unknown) => {
      if (command === 'format.setRange') {
        writes.push(payload)
        return {
          projection: {
            ...(payload as { projection: VisibleProjectionRequest }).projection,
            cells: [], revision: 2,
          },
        }
      }
      return {
        ...(payload as { request: VisibleProjectionRequest }).request,
        revision: 1,
        cells: [{
          row: 0, col: 0, valueKind: 'text', displayValue: 'A', rawValue: 'A',
          format: {
            bgColor: '#fff2cc',
            fill: { kind: 'pattern', pattern: 'lightDown', foreground: '#000000' },
          },
        }],
      }
    })
    const connection: RustWorkbookConnection = {
      request: request as RustWorkbookConnection['request'], dispose() {},
    }
    const core = createSpreadsheetUi({ connection })
    core.store.setter(setSelectionBoundsAtom, { rowCount: 10, colCount: 5 })
    core.store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
    await core.store.setter(runVisibleProjectionAtom, {
      sheetId: 's', reason: 'viewport', window: { rowStart: 0, rowEnd: 5, colStart: 0, colEnd: 4 },
    })
    await core.store.setter(applySelectionFormatAtom, 'fill-color')
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({
      request: {
        format: { bgColor: '#fff2cc' },
        clearFormatFields: ['fill'],
      },
    })
  })
})
