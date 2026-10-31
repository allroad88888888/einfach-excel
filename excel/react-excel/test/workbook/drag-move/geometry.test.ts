import { afterEach, describe, expect, test, vi } from 'vitest'
import type { ViewportMetrics } from '@einfach-excel/spreadsheet-ui-core'
import { selectionEdgeGeometry } from '../../../src/workbook/drag-move/selection-edge-geometry'
import { dragCopyModifierKey, isDragCopyModifier } from '../../../src/workbook/drag-move/copy-modifier'

const metrics: ViewportMetrics = {
  sheetId: 's', scrollTop: 0, scrollLeft: 0, viewportHeight: 200, viewportWidth: 300,
  rowHeight: 20, colWidth: 100, rowCount: 100, colCount: 20, overscanRows: 0, overscanCols: 0,
}
const sizes = { rowHeightsBySheet: {}, colWidthsBySheet: {} }

describe('selection border geometry', () => {
  test('a fully visible range exposes all four draggable edges', () => {
    const geometry = selectionEdgeGeometry(
      { rowStart: 1, colStart: 1, rowEnd: 2, colEnd: 1 }, metrics, sizes, null)
    expect(geometry).toMatchObject({ left: 100, top: 20, width: 100, height: 40 })
    expect(geometry.edges).toEqual({ top: true, bottom: true, left: true, right: true })
  })

  test('edges scrolled out of view or hidden under frozen panes are not draggable', () => {
    const scrolled = { ...metrics, scrollTop: 30 }
    const freeze = { rows: 1, cols: 0, width: 0, height: 20 }
    const geometry = selectionEdgeGeometry(
      { rowStart: 1, colStart: 0, rowEnd: 3, colEnd: 0 }, scrolled, sizes, freeze)
    expect(geometry).toMatchObject({ top: 20, height: 30 })
    expect(geometry.edges).toMatchObject({ top: false, bottom: true })
    const frozen = selectionEdgeGeometry(
      { rowStart: 0, colStart: 0, rowEnd: 0, colEnd: 0 }, scrolled, sizes, freeze)
    expect(frozen).toMatchObject({ top: 0, height: 20 })
    expect(frozen.edges.top).toBe(true)
  })
})

describe('drag copy modifier', () => {
  afterEach(() => vi.unstubAllGlobals())

  test('Option copies on Mac and Ctrl copies elsewhere', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' })
    expect(dragCopyModifierKey()).toBe('Alt')
    expect(isDragCopyModifier({ altKey: true, ctrlKey: false })).toBe(true)
    expect(isDragCopyModifier({ altKey: false, ctrlKey: true })).toBe(false)
    vi.stubGlobal('navigator', { platform: 'Win32' })
    expect(dragCopyModifierKey()).toBe('Control')
    expect(isDragCopyModifier({ altKey: false, ctrlKey: true })).toBe(true)
  })
})
