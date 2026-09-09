import { expect, test } from 'vitest'
import { fillHandleGeometry } from '../../../src/workbook/grid/fill/fill-handle-geometry'

const metrics = { sheetId: 's', rowCount: 100, colCount: 20, rowHeight: 28, colWidth: 120,
  viewportWidth: 600, viewportHeight: 400, scrollLeft: 0, scrollTop: 0,
  overscanRows: 2, overscanCols: 2 }
const sizes = { rowHeightsBySheet: {}, colWidthsBySheet: {} }
test('ordinary range uses exact native geometry and scroll offsets', () => {
  expect(fillHandleGeometry({ rowStart: 2, rowEnd: 4, colStart: 1, colEnd: 2 },
    { ...metrics, scrollTop: 28, scrollLeft: 100 }, sizes, null)).toEqual({
    left: 20, top: 28, width: 240, height: 84, cornerX: 260, cornerY: 112, cornerVisible: true,
  })
})
test('frozen ranges stay fixed; covered body corners disappear rather than overlap headers', () => {
  const freeze = { rows: 1, cols: 1, height: 28, width: 120 }
  const scrolled = { ...metrics, scrollTop: 280, scrollLeft: 360 }
  const corner = fillHandleGeometry({ rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
    scrolled, sizes, freeze)
  expect(corner).toMatchObject({ left: 0, top: 0, cornerX: 120, cornerY: 28, cornerVisible: true })
  expect(fillHandleGeometry({ rowStart: 2, rowEnd: 3, colStart: 2, colEnd: 3 },
    scrolled, sizes, freeze).cornerVisible).toBe(false)
})
test('cross-pane preview clips the scrollable portion without duplicating the frozen band', () => {
  expect(fillHandleGeometry({ rowStart: 0, rowEnd: 15, colStart: 0, colEnd: 5 },
    { ...metrics, scrollTop: 280, scrollLeft: 360 }, sizes,
    { rows: 1, cols: 1, height: 28, width: 120 })).toMatchObject({
    left: 0, top: 0, width: 360, height: 168, cornerVisible: true,
  })
})
test('hidden source and offscreen corners are not interactive', () => {
  expect(fillHandleGeometry({ rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }, metrics,
    { ...sizes, rowHeightsBySheet: { s: { '0': 0 } } }, null).cornerVisible).toBe(false)
  const offscreen = fillHandleGeometry(
    { rowStart: 0, rowEnd: 99, colStart: 0, colEnd: 19 }, metrics, sizes, null)
  expect(offscreen).toMatchObject({ width: 600, height: 400, cornerVisible: false })
})
