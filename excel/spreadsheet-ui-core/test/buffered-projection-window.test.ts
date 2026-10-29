import { expect, test } from 'vitest'
import { getVisibleWindow, type ViewportMetrics } from '@einfach-excel/spreadsheet-ui-core'
import { getBufferedProjectionWindow } from '../src/viewport/buffered-projection-window'

const metrics: ViewportMetrics = {
  sheetId: 'sheet', rowCount: 1000, colCount: 100, rowHeight: 28, colWidth: 120,
  viewportHeight: 420, viewportWidth: 840, scrollTop: 0, scrollLeft: 0,
  overscanRows: 0, overscanCols: 0,
}

test('small scrolls reuse a bounded screen bucket with coverage in both directions', () => {
  const base = { ...metrics, scrollTop: 840, scrollLeft: 1680 }
  const before = getBufferedProjectionWindow(base)
  for (const delta of [0, 28, 84, 419]) {
    const current = { ...base, scrollTop: base.scrollTop + delta }
    expect(getBufferedProjectionWindow(current)).toEqual(before)
    const visible = getVisibleWindow(current)
    expect(before.rowStart).toBeLessThan(visible.rowStart)
    expect(before.rowEnd).toBeGreaterThan(visible.rowEnd)
  }
  expect(before.rowEnd - before.rowStart + 1).toBe(60)
  expect(before.colEnd - before.colStart + 1).toBe(28)
  expect(getBufferedProjectionWindow({ ...base, scrollTop: 1260 })).not.toEqual(before)
})

test('buffered geometry respects variable and hidden sizes and sheet ends', () => {
  const rows = { '0': 200, '1': 0, '2': 0, '3': 50 }
  const cols = { '0': 300, '1': 0 }
  for (const offset of [0, 300, 10000, 28000]) {
    const current = { ...metrics, scrollTop: offset }
    const buffer = getBufferedProjectionWindow(current, rows, cols)
    const visible = getVisibleWindow(current, rows, cols)
    expect(buffer.rowStart).toBeLessThanOrEqual(visible.rowStart)
    expect(buffer.rowEnd).toBeGreaterThanOrEqual(visible.rowEnd)
    expect(buffer.rowEnd).toBeLessThan(metrics.rowCount)
    expect(buffer.colEnd).toBeLessThan(metrics.colCount)
  }
})
