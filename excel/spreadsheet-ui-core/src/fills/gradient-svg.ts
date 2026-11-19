import { snapshotCellFill, type SpreadsheetGradientFill } from '../contracts/cell-fill'
import { pathGradientGeometry } from './gradient-geometry'
import { gradientColorAt, sortedGradientStops } from './gradient-stops'

/** Restricted numeric/RGB markup only; path uses rectangular distance, never radial interpolation. */
export function gradientFillImage(value: SpreadsheetGradientFill): string | undefined {
  const fill = snapshotCellFill(value)
  if (!fill || fill.kind === 'pattern' || fill.stops.length === 0) return undefined
  const sorted = sortedGradientStops(fill.stops)
  if (fill.kind === 'linear-gradient') {
    const angle = ((fill.degree % 360 + 450) % 360)
    const colors = sorted.length === 1 ? [sorted[0], sorted[0]] : sorted
    return `linear-gradient(${angle}deg in srgb, ${colors.map(stop =>
      `${stop.color} ${stop.position * 100}%`).join(', ')})`
  }
  const { regions } = pathGradientGeometry(fill)
  const stops = sorted.map(stop => `<stop offset="${stop.position}" stop-color="${stop.color}"/>`).join('')
  const definitions = regions.map(({ from, to }, index) => `<linearGradient id="g${index}"`
    + ` gradientUnits="userSpaceOnUse" x1="${from[0]}" y1="${from[1]}" x2="${to[0]}" y2="${to[1]}">`
    + `${stops}</linearGradient>`).join('')
  const polygons = regions.map(({ polygon }, index) => `<polygon points="${polygon.map(point =>
    point.join(',')).join(' ')}" fill="url(#g${index})"/>`).join('')
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" preserveAspectRatio="none"'
    + ' color-interpolation="sRGB" shape-rendering="crispEdges">'
    + `<defs>${definitions}</defs><rect width="1" height="1" fill="${gradientColorAt(sorted, 0)}"/>`
    + `${polygons}</svg>`
  // At most 4×256 bounded RGB stops; never an unbounded caller-provided SVG or URL.
  if (svg.length > 128 * 1024) return undefined
  const encoded = encodeURIComponent(svg).replace(/\(/g, '%28').replace(/\)/g, '%29')
  return `url("data:image/svg+xml,${encoded}")`
}
