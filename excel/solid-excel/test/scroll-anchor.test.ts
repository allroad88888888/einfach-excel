import { describe, expect, it } from '@jest/globals'
import {
  SCROLL_SURFACE_VIEWPORT_MULTIPLE,
  getMaxAnchorPx,
  getReanchorGuardPx,
  getSurfaceSpanPx,
  needsReanchor,
  planAnchorPlacement,
  type AxisScrollGeometry,
} from '../src-vnext/grid/scroll-anchor'

const VIEWPORT = 480
const ROW_HEIGHT = 24
const BIG_TOTAL = 100_000 * ROW_HEIGHT

function bigSheet(): AxisScrollGeometry {
  return {
    totalPx: BIG_TOTAL,
    viewportPx: VIEWPORT,
    surfacePx: getSurfaceSpanPx(BIG_TOTAL, VIEWPORT),
  }
}

describe('scroll-anchor axis math', () => {
  it('caps the surface at K viewports and keeps small sheets at true span', () => {
    expect(getSurfaceSpanPx(BIG_TOTAL, VIEWPORT)).toBe(VIEWPORT * SCROLL_SURFACE_VIEWPORT_MULTIPLE)
    expect(getSurfaceSpanPx(50 * ROW_HEIGHT, VIEWPORT)).toBe(50 * ROW_HEIGHT)
  })

  it('degrades to identity mapping when the surface holds the whole sheet', () => {
    const total = 50 * ROW_HEIGHT
    const geometry: AxisScrollGeometry = { totalPx: total, viewportPx: VIEWPORT, surfacePx: total }
    for (const logical of [0, 100, total - VIEWPORT]) {
      expect(planAnchorPlacement(logical, geometry)).toEqual({ anchorPx: 0, physicalPx: logical })
    }
    expect(needsReanchor(0, 0, geometry)).toBe(false)
    expect(needsReanchor(total - VIEWPORT, 0, geometry)).toBe(false)
  })

  it('treats a frozen axis (surface = total) as identity even on a huge sheet', () => {
    const geometry: AxisScrollGeometry = {
      totalPx: BIG_TOTAL,
      viewportPx: VIEWPORT,
      surfacePx: BIG_TOTAL,
    }
    expect(planAnchorPlacement(1_000_000, geometry)).toEqual({ anchorPx: 0, physicalPx: 1_000_000 })
    expect(needsReanchor(1_000_000, 0, geometry)).toBe(false)
  })

  it('keeps anchor + physical equal to the clamped logical offset', () => {
    const geometry = bigSheet()
    const maxLogical = geometry.totalPx - VIEWPORT
    const maxAnchor = getMaxAnchorPx(geometry.totalPx, geometry.surfacePx)
    const sweep =
      [0, 1, 479, 481, 12_345.5, maxLogical / 2, maxLogical - 1, maxLogical, maxLogical + 999]
    for (const logical of sweep) {
      const placement = planAnchorPlacement(logical, geometry)
      const clamped = Math.min(logical, maxLogical)
      expect(placement.anchorPx + placement.physicalPx).toBeCloseTo(clamped, 6)
      expect(placement.anchorPx).toBeGreaterThanOrEqual(0)
      expect(placement.anchorPx).toBeLessThanOrEqual(maxAnchor)
    }
  })

  it('reaches both true extremes exactly', () => {
    const geometry = bigSheet()
    const maxScroll = geometry.surfacePx - VIEWPORT
    const maxAnchor = getMaxAnchorPx(geometry.totalPx, geometry.surfacePx)
    expect(planAnchorPlacement(0, geometry)).toEqual({ anchorPx: 0, physicalPx: 0 })
    const end = planAnchorPlacement(geometry.totalPx - VIEWPORT, geometry)
    expect(end.anchorPx).toBe(maxAnchor)
    expect(end.physicalPx).toBe(maxScroll)
  })

  it('places interior offsets proportionally, outside both guard bands', () => {
    const geometry = bigSheet()
    const guard = getReanchorGuardPx(VIEWPORT)
    const maxScroll = geometry.surfacePx - VIEWPORT
    const maxLogical = geometry.totalPx - VIEWPORT
    const mid = planAnchorPlacement(maxLogical / 2, geometry)
    expect(mid.physicalPx).toBeCloseTo(maxScroll / 2, 0)
    for (const fraction of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const placement = planAnchorPlacement(maxLogical * fraction, geometry)
      expect(placement.physicalPx).toBeGreaterThanOrEqual(guard)
      expect(placement.physicalPx).toBeLessThanOrEqual(maxScroll - guard)
    }
  })

  it('leaves at least one viewport of runway after every interior placement', () => {
    // 警戒带必须吞得下惯性滚动的单帧大增量：重锚落点到表面硬边缘的
    // 剩余滚动距离不得小于一个视口，否则大增量会被浏览器 clamp 吞掉。
    const geometry = bigSheet()
    const maxScroll = geometry.surfacePx - VIEWPORT
    const placement = planAnchorPlacement((geometry.totalPx - VIEWPORT) / 2, geometry)
    expect(maxScroll - placement.physicalPx).toBeGreaterThanOrEqual(VIEWPORT)
    expect(placement.physicalPx).toBeGreaterThanOrEqual(VIEWPORT)
  })

  it('requests re-anchoring only inside an active guard band', () => {
    const geometry = bigSheet()
    const guard = getReanchorGuardPx(VIEWPORT)
    const maxScroll = geometry.surfacePx - VIEWPORT
    const maxAnchor = getMaxAnchorPx(geometry.totalPx, geometry.surfacePx)
    const midAnchor = maxAnchor / 2
    expect(needsReanchor(maxScroll - guard + 1, midAnchor, geometry)).toBe(true)
    expect(needsReanchor(guard - 1, midAnchor, geometry)).toBe(true)
    expect(needsReanchor(maxScroll / 2, midAnchor, geometry)).toBe(false)
    // 到全表真实首/尾时对应方向的警戒带停用，滚动条能实打实触底/触顶。
    expect(needsReanchor(guard - 1, 0, geometry)).toBe(false)
    expect(needsReanchor(maxScroll - guard + 1, maxAnchor, geometry)).toBe(false)
  })

  it('is monotonic: larger logical offsets never move the anchor backwards', () => {
    const geometry = bigSheet()
    const maxLogical = geometry.totalPx - VIEWPORT
    let previousAnchor = -1
    for (let step = 0; step <= 40; step++) {
      const placement = planAnchorPlacement((maxLogical * step) / 40, geometry)
      expect(placement.anchorPx).toBeGreaterThanOrEqual(previousAnchor)
      previousAnchor = placement.anchorPx
    }
  })
})
