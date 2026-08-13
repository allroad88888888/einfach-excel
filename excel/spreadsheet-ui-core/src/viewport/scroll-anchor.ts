/**
 * Anchored-scroll mapping between logical scroll offsets (the position inside
 * a full sheet) and physical offsets (the position inside a DOM surface).
 */

/** Physical surface span, in viewports. */
export const SCROLL_SURFACE_VIEWPORT_MULTIPLE = 5

export interface AxisAnchorPlacement {
  /** Logical px offset of the physical surface's origin inside the sheet. */
  anchorPx: number
  /** Scroll offset to apply to the physical surface. */
  physicalPx: number
}

/** The guard band absorbs the largest per-frame physical scroll delta. */
export function getReanchorGuardPx(viewportPx: number): number {
  return Math.max(0, viewportPx)
}

/** Small sheets use their full span, so they keep ordinary native scrolling. */
export function getSurfaceSpanPx(totalPx: number, viewportPx: number): number {
  const viewport = Math.max(1, viewportPx)
  return Math.max(0, Math.min(totalPx, viewport * SCROLL_SURFACE_VIEWPORT_MULTIPLE))
}

export function getMaxAnchorPx(totalPx: number, surfacePx: number): number {
  return Math.max(0, totalPx - surfacePx)
}

/** Geometry of one scroll axis. */
export interface AxisScrollGeometry {
  totalPx: number
  viewportPx: number
  surfacePx: number
}

/**
 * Whether a physical offset sits in a guard band while more logical content
 * remains in that direction.
 */
export function needsReanchor(
  physicalPx: number,
  anchorPx: number,
  geometry: AxisScrollGeometry,
): boolean {
  const maxAnchorPx = getMaxAnchorPx(geometry.totalPx, geometry.surfacePx)
  if (maxAnchorPx <= 0) return false
  const guardPx = getReanchorGuardPx(geometry.viewportPx)
  const maxScrollPx = Math.max(0, geometry.surfacePx - geometry.viewportPx)
  const hitTop = physicalPx < guardPx && anchorPx > 0
  const hitBottom = physicalPx > maxScrollPx - guardPx && anchorPx < maxAnchorPx
  return hitTop || hitBottom
}

/**
 * Places a logical offset onto the physical surface. The physical thumb is
 * proportional to whole-sheet progress while the logical position remains
 * exactly `anchorPx + physicalPx`.
 */
export function planAnchorPlacement(
  logicalPx: number,
  geometry: AxisScrollGeometry,
): AxisAnchorPlacement {
  const viewport = Math.max(1, geometry.viewportPx)
  const maxAnchorPx = getMaxAnchorPx(geometry.totalPx, geometry.surfacePx)
  const maxLogicalPx = Math.max(0, geometry.totalPx - viewport)
  const logical = Math.max(0, Math.min(maxLogicalPx, logicalPx))
  if (maxAnchorPx <= 0) return { anchorPx: 0, physicalPx: logical }

  const guardPx = getReanchorGuardPx(viewport)
  const maxScrollPx = Math.max(0, geometry.surfacePx - viewport)
  let target = (logical / maxLogicalPx) * maxScrollPx
  target = Math.max(guardPx, Math.min(maxScrollPx - guardPx, target))
  const anchorPx = Math.max(0, Math.min(maxAnchorPx, logical - target))
  return { anchorPx, physicalPx: logical - anchorPx }
}
