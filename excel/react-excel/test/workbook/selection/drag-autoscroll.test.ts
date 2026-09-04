import { describe, expect, it } from 'vitest'
import { gridDragAutoscrollDelta } from '../../../src/workbook/selection/use-grid-drag-autoscroll'

const VIEWPORT = { top: 100, right: 900, bottom: 500, left: 100 }

describe('grid drag autoscroll', () => {
  it('stays idle away from all viewport edges', () => {
    expect(gridDragAutoscrollDelta(300, 200, VIEWPORT)).toEqual({ x: 0, y: 0 })
  })

  it('accelerates toward the bottom and right edges', () => {
    const nearEdge = gridDragAutoscrollDelta(860, 460, VIEWPORT)
    const atEdge = gridDragAutoscrollDelta(899, 499, VIEWPORT)

    expect(nearEdge.x).toBeGreaterThan(0)
    expect(nearEdge.y).toBeGreaterThan(0)
    expect(atEdge.x).toBeGreaterThan(nearEdge.x)
    expect(atEdge.y).toBeGreaterThan(nearEdge.y)
    expect(atEdge).toEqual({ x: 18, y: 18 })
  })

  it('scrolls toward the top and left edges symmetrically', () => {
    expect(gridDragAutoscrollDelta(140, 140, VIEWPORT)).toEqual({ x: -1, y: -1 })
    expect(gridDragAutoscrollDelta(101, 101, VIEWPORT)).toEqual({ x: -18, y: -18 })
  })
})
