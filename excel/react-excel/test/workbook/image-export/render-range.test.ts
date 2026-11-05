import type { VisibleProjectionResult } from '@einfach-excel/spreadsheet-ui-core'
import { renderSpreadsheetRangeAsPng } from '../../../src/workbook/image-export/render-range'

const render = vi.hoisted(() => vi.fn())
vi.mock('@einfach-excel/canvas-cells', () => ({ renderCellsImage: render }))

function snapshot(extra: Partial<VisibleProjectionResult> = {}): VisibleProjectionResult {
  return {
    kind: 'visible-window', sheetId: 's', requestId: 1, revision: 3,
    window: { rowStart: 2, rowEnd: 4, colStart: 1, colEnd: 2 },
    cells: [{ row: 2, col: 1, displayValue: 'x' }],
    ...extra,
  } as unknown as VisibleProjectionResult
}

let blob: Blob | null
beforeEach(() => {
  render.mockReset()
  blob = new Blob(['png'], { type: 'image/png' })
  HTMLCanvasElement.prototype.toBlob = function toBlob(callback: BlobCallback) { callback(blob) }
})

test('hidden rows and columns render at zero size; other sizes come from the snapshot', async () => {
  await renderSpreadsheetRangeAsPng(snapshot({
    rowHeights: [{ rowIndex: 3, heightPx: 40 }], colWidths: [{ colIndex: 2, widthPx: 90 }],
    visibility: { manualRows: [4], filterRows: [], outlineRows: [],
      manualColumns: [], outlineColumns: [] },
    defaults: { rowHeight: 30, colWidth: 150 },
  } as Partial<VisibleProjectionResult>), { scale: 2 })
  const [canvas, input, options] = render.mock.calls[0]!
  expect(input.rowHeights).toEqual([30, 40, 0])
  expect(input.columnWidths).toEqual([150, 90])
  expect(input.interactive).toBe(false)
  expect(options).toEqual({ scale: 2, theme: {} })
  expect([canvas.width, canvas.height]).toEqual([0, 0])
})

test('gridlines can be turned off for the image only', async () => {
  await renderSpreadsheetRangeAsPng(snapshot(), { gridlines: false })
  expect(render.mock.calls[0]![2].theme).toEqual({ gridline: 'transparent' })
})

test('rejects merges cut by the range and oversized ranges before painting', async () => {
  await expect(renderSpreadsheetRangeAsPng(snapshot({
    mergedRanges: [{ rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 1 }],
  }))).rejects.toThrow(/merged cell/)
  await expect(renderSpreadsheetRangeAsPng(snapshot({
    window: { rowStart: 0, rowEnd: 70_000, colStart: 0, colEnd: 0 },
  }))).rejects.toThrow(/65,536/)
  expect(render).not.toHaveBeenCalled()
})

test('an empty encoding is an error, not a blank file', async () => {
  blob = null
  await expect(renderSpreadsheetRangeAsPng(snapshot())).rejects.toThrow('Image encoding failed.')
})
