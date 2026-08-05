/**
 * Anchored-scroll mapping between logical scroll offsets (what
 * `viewportMetricsAtom.scrollTop/scrollLeft` hold — the position inside the
 * full sheet) and physical offsets (what the DOM scroll element holds).
 *
 * The physical scroll surface is a small fixed span
 * (`SCROLL_SURFACE_VIEWPORT_MULTIPLE` viewports) instead of the full sheet
 * height, so the DOM never lays out a multi-million-pixel table. The scrollbar
 * therefore represents a *window*: when the thumb reaches an edge guard band
 * and more sheet remains, the anchor shifts and the thumb snaps back
 * (proportionally to global progress), while `anchor + physical` — the
 * logical position — stays continuous, so content never jumps.
 *
 * Everything here is pure axis-agnostic math; the DOM wiring lives in
 * grid-projection-controller.ts. See issue #5 for the model discussion.
 */

/** Physical surface span, in viewports. Must be ≥ 3 so the guard bands (one
 * viewport each) leave a usable placement band between them. */
export const SCROLL_SURFACE_VIEWPORT_MULTIPLE = 5

export interface AxisAnchorPlacement {
  /** Logical px offset of the physical surface's origin inside the sheet. */
  anchorPx: number
  /** Scroll offset to apply to the DOM element. */
  physicalPx: number
}

/**
 * The guard band must absorb the largest per-frame scroll delta: momentum
 * flicks deliver several hundred px between two frames, and any overshoot
 * past the surface edge is clamped by the browser before we can re-anchor —
 * those pixels would be silently lost. One viewport is comfortably above
 * real-world per-frame deltas.
 */
export function getReanchorGuardPx(viewportPx: number): number {
  return Math.max(0, viewportPx)
}

/** Small sheets get their true span — re-anchoring then never triggers and
 * the axis degrades to plain native scrolling. */
export function getSurfaceSpanPx(totalPx: number, viewportPx: number): number {
  const viewport = Math.max(1, viewportPx)
  return Math.max(0, Math.min(totalPx, viewport * SCROLL_SURFACE_VIEWPORT_MULTIPLE))
}

export function getMaxAnchorPx(totalPx: number, surfacePx: number): number {
  return Math.max(0, totalPx - surfacePx)
}

/** Geometry of one scroll axis. `surfacePx` comes from grid-layout (the
 * single owner of surface spans — it is where freeze-awareness lives: a
 * frozen axis passes its full span, which zeroes maxAnchor and turns every
 * function here into the legacy identity mapping). */
export interface AxisScrollGeometry {
  totalPx: number
  viewportPx: number
  surfacePx: number
}

/**
 * True when the physical offset sits inside an edge guard band that still has
 * sheet beyond it. At the true sheet start/end the bands deactivate, so the
 * scrollbar genuinely reaches its extremes.
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
 * Places a logical offset onto the surface: thumb position ∝ global progress
 * (clamped out of the guard bands), so the scrollbar doubles as a coarse
 * whole-sheet position indicator. Invariant: anchorPx + physicalPx equals the
 * (clamped) logical offset.
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
