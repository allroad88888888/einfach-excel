import { snapshotCellFill, type SpreadsheetCellFill } from '../contracts/cell-fill'
import { CELL_PATTERN_TILE_SIZE, patternFillRectangles } from './pattern-geometry'

/** Only typed geometry and validated RGB enter the generated SVG; no caller-supplied markup or URL. */
export function patternFillImage(value: SpreadsheetCellFill): string | undefined {
  const fill = snapshotCellFill(value)
  if (!fill) return undefined
  const rectangles = patternFillRectangles(fill.pattern).map(([x, y, width, height]) =>
    `<rect x="${x}" y="${y}" width="${width}" height="${height}"/>`).join('')
  const size = CELL_PATTERN_TILE_SIZE
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"`
    + ` viewBox="0 0 ${size} ${size}"><g fill="${fill.foreground}">${rectangles}</g></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}
