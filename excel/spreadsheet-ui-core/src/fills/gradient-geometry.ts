import type { SpreadsheetPathGradientFill } from '../contracts/cell-fill'

export type GradientPoint = readonly [x: number, y: number]
export interface GradientRegion {
  readonly polygon: readonly GradientPoint[]
  readonly from: GradientPoint
  readonly to: GradientPoint
}

/** Complete logical-box projection, matching CSS linear-gradient's corner projection. */
export function linearGradientVector(degree: number, width: number, height: number) {
  const radians = ((degree % 360 + 360) % 360) * Math.PI / 180
  const snap = (value: number) => Math.abs(value) < 1e-12 ? 0 : value
  const dx = snap(Math.cos(radians)), dy = snap(Math.sin(radians))
  const radius = (Math.abs(width * dx) + Math.abs(height * dy)) / 2
  return {
    from: [width / 2 - radius * dx, height / 2 - radius * dy] as GradientPoint,
    to: [width / 2 + radius * dx, height / 2 + radius * dy] as GradientPoint,
  }
}

/** Four dominant-distance regions in the unit box; inverted stored edges normalize only here. */
export function pathGradientGeometry(fill: SpreadsheetPathGradientFill) {
  const left = Math.min(fill.left, fill.right), right = Math.max(fill.left, fill.right)
  const top = Math.min(fill.top, fill.bottom), bottom = Math.max(fill.top, fill.bottom)
  const regions: GradientRegion[] = []
  if (top > 0) regions.push({ polygon: [[0, 0], [1, 0], [right, top], [left, top]],
    from: [0, top], to: [0, 0] })
  if (right < 1) regions.push({ polygon: [[1, 0], [1, 1], [right, bottom], [right, top]],
    from: [right, 0], to: [1, 0] })
  if (bottom < 1) regions.push({ polygon: [[1, 1], [0, 1], [left, bottom], [right, bottom]],
    from: [0, bottom], to: [0, 1] })
  if (left > 0) regions.push({ polygon: [[0, 1], [0, 0], [left, top], [left, bottom]],
    from: [left, 0], to: [0, 0] })
  return { inner: { left, right, top, bottom }, regions }
}
