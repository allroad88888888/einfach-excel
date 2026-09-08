import { afterEach, describe, expect, test, vi } from 'vitest'
import { installRustWorkbookRuntime } from '../src/rust-workbook/runtime'
import { snapshotRustWorkbookDefinition } from '../src/runtime/rust-workbook-definition'
import { getCellViewportRect, getViewportScrollForCell, getVisibleWindow } from '../src'

afterEach(() => vi.unstubAllGlobals())

async function runtime() {
  let receive!: (event: { data: unknown }) => Promise<void>
  const post = vi.fn()
  vi.stubGlobal('self', {
    addEventListener: (_: string, fn: typeof receive) => {
      receive = fn
    },
    postMessage: post,
  })
  const resize = vi.fn()
  class TestWorkbook {
    rename_sheet() {
      return true
    }

    sheet_name() {
      return 'Orders'
    }

    resize_range = resize

    read_sparse_range() {
      return []
    }

    snapshot_format_range() {
      return { cellStyles: [], rowStyles: [], columnStyles: [] }
    }

    snapshot_viewport_sizes(_s: number, row: number, col: number) {
      return {
        rowHeights: [{ rowIndex: row, heightPx: 40 }],
        colWidths: [{ colIndex: col, widthPx: 200 }],
      }
    }
  }
  installRustWorkbookRuntime({ default: async () => {}, WasmWorkbook: TestWorkbook })
  const call = async (command: string, payload: unknown) => {
    await receive({ data: { id: post.mock.calls.length + 1, command, payload } })
    return post.mock.lastCall![0]
  }
  await call('workbook.initialize', {
    sheets: [
      {
        id: 'orders',
        name: 'Orders',
        rowHeights: [{ rowIndex: 4, heightPx: 40 }],
        colWidths: [{ colIndex: 3, widthPx: 200 }],
      },
    ],
  })
  return { call, resize }
}
const visible = {
  kind: 'visible-window',
  sheetId: 'orders',
  requestId: 8,
  window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 },
}
const input = {
  sheetId: 'orders',
  axis: 'column',
  pixels: 200,
  range: { rowStart: 50, rowEnd: 60, colStart: 1, colEnd: 3 },
  projection: visible,
}

describe('Rust size transport', () => {
  test('initial sizes are axis writes, a resize returns visible data and full target metadata', async () => {
    const { call, resize } = await runtime()
    expect(resize.mock.calls).toEqual([
      [0, 4, 0, 4, 0, 'row', 40],
      [0, 0, 3, 0, 3, 'column', 200],
    ])
    const reply = await call('range.resize', input)
    expect(resize.mock.lastCall).toEqual([0, 50, 1, 60, 3, 'column', 200])
    expect(reply).toMatchObject({
      ok: true,
      result: {
        projection: {
          requestId: 8,
          revision: 1,
          rowHeights: [{ rowIndex: 0, heightPx: 40 }],
          colWidths: [{ colIndex: 0, widthPx: 200 }],
        },
        sizes: {
          rowHeights: [{ rowIndex: 50, heightPx: 40 }],
          colWidths: [{ colIndex: 1, widthPx: 200 }],
        },
      },
    })
  })
  test('invalid numeric values, missing sheet and projection mismatch cannot write', async () => {
    const { call, resize } = await runtime()
    resize.mockClear()
    for (const pixels of [-1, 0.5, NaN, Infinity, 2 ** 32])
      expect((await call('range.resize', { ...input, pixels })).ok).toBe(false)
    expect((await call('range.resize', { ...input, sheetId: 'missing' })).ok).toBe(false)
    expect(
      (await call('range.resize', { ...input, projection: { ...visible, sheetId: 'missing' } })).ok,
    ).toBe(false)
    expect(resize).not.toHaveBeenCalled()
    resize.mockImplementationOnce(() => {
      throw new Error('Invalid size')
    })
    expect((await call('range.resize', input)).ok).toBe(false)
    expect((await call('projection.readVisible', { request: visible })).result.revision).toBe(0)
  })
  test('definition freezes dimension seeds and rejects out-of-sheet metadata', () => {
    const sheet = {
      id: 's',
      name: 'Sheet1',
      rowCount: 10,
      colCount: 5,
      rowHeights: [{ rowIndex: 1, heightPx: 40 }],
      colWidths: [{ colIndex: 2, widthPx: 200 }],
    }
    const definition = { title: 'Book', sheets: [sheet], createImportChunks: () => [] }
    const snapshot = snapshotRustWorkbookDefinition(definition)
    sheet.rowHeights[0]!.heightPx = 80
    expect(snapshot.sheets[0]?.rowHeights?.[0]?.heightPx).toBe(40)
    sheet.colWidths[0]!.colIndex = 5
    expect(() => snapshotRustWorkbookDefinition(definition)).toThrow('Invalid initial column width')
  })
  test('window, pixel coordinates and right-edge navigation use the same column widths', () => {
    const metrics = {
      scrollTop: 0,
      scrollLeft: 0,
      viewportWidth: 500,
      viewportHeight: 200,
      rowHeight: 28,
      colWidth: 120,
      rowCount: 100,
      colCount: 16,
      overscanRows: 0,
      overscanCols: 0,
    }
    const columns = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [String(i), 240]))
    const scroll = getViewportScrollForCell(
      metrics,
      { coord: { row: 1, col: 15 } },
      undefined,
      columns,
    )
    expect(scroll.scrollLeft).toBe(3340)
    expect(getVisibleWindow({ ...metrics, ...scroll }, undefined, columns)).toMatchObject({
      colStart: 13,
      colEnd: 15,
    })
    expect(
      getCellViewportRect({ row: 1, col: 15 }, { ...metrics, ...scroll }, undefined, columns),
    ).toMatchObject({ left: 260, width: 240 })
  })
})
