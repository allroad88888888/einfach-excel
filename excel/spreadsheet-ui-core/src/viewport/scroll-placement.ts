import {
  getMaxAnchorPx,
  planAnchorPlacement,
  type AxisAnchorPlacement,
  type AxisScrollGeometry,
} from './scroll-anchor'

/**
 * Restores a logical scroll offset after a caller snaps its anchor to grid
 * bounds while keeping the physical offset inside the current surface.
 */
export function planSnappedScrollPlacement(
  logicalPx: number,
  geometry: AxisScrollGeometry,
  snapAnchorPx: (anchorPx: number) => number,
): AxisAnchorPlacement {
  const placement = planAnchorPlacement(logicalPx, geometry)
  const logical = placement.anchorPx + placement.physicalPx
  const maxPhysicalPx = Math.max(0, geometry.surfacePx - geometry.viewportPx)
  const minAnchorPx = logical - maxPhysicalPx
  const maxAnchorPx = getMaxAnchorPx(geometry.totalPx, geometry.surfacePx)
  const snappedAnchorPx = snapAnchorPx(placement.anchorPx)
  const anchorPx = Math.max(0, minAnchorPx, Math.min(maxAnchorPx, snappedAnchorPx))
  return { anchorPx, physicalPx: logical - anchorPx }
}
