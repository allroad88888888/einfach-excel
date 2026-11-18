import { diagonalBorderLines, type SpreadsheetBorders } from '@einfach-excel/spreadsheet-ui-core'
import './diagonal-borders.css'

/** A full logical-cell overlay; frozen and viewport containers clip it without restarting paths. */
export function CellDiagonalBorders({ borders, width, height, top = 0, left = 0 }: {
  borders?: SpreadsheetBorders
  width: number
  height: number
  top?: number
  left?: number
}) {
  const lines = diagonalBorderLines(borders, width, height)
  if (!lines.length) return null
  return <svg data-diagonal-borders="true" aria-hidden="true" focusable="false"
    width={width} height={height} viewBox={`0 0 ${width} ${height}`}
    className="cell-diagonal-borders" style={{ top, left }}>
    {lines.map((line, index) => <line key={`${line.side}:${index}`} data-diagonal={line.side}
      x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke={line.color}
      strokeWidth={line.width} strokeDasharray={line.dash.join(' ')} />)}
  </svg>
}
