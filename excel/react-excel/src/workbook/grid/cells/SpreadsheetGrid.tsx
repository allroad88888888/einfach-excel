import type {
  CellRange,
  DisplayCell,
  SpreadsheetBorderSpec,
  SpreadsheetCellFormat,
} from '@einfach/spreadsheet-ui-core'
import type { CSSProperties } from 'react'

const COLOR_HEX_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const FONT_FAMILY_RE = /^[A-Za-z0-9, "'\-]+$/
const SAFE_NAMED_COLORS = new Set([
  'aqua',
  'black',
  'blue',
  'cyan',
  'fuchsia',
  'gray',
  'green',
  'grey',
  'lime',
  'magenta',
  'maroon',
  'navy',
  'olive',
  'orange',
  'purple',
  'red',
  'silver',
  'teal',
  'transparent',
  'white',
  'yellow',
])

function sanitizeColor(raw: string | undefined): string | undefined {
  const value = raw?.trim()
  if (!value) return undefined
  if (COLOR_HEX_RE.test(value) || SAFE_NAMED_COLORS.has(value.toLowerCase())) return value
  const match = /^rgba?\(\s*([^)]*)\)$/i.exec(value)
  const components = match?.[1]?.split(',').map((component) => component.trim())
  const isRgba = value.toLowerCase().startsWith('rgba')
  if (!components || components.length !== (isRgba ? 4 : 3)) return undefined
  if (!components.slice(0, 3).every((component) => /^\d{1,3}$/.test(component))) return undefined
  if (!components.slice(0, 3).every((component) => Number(component) <= 255)) return undefined
  if (!isRgba) return value
  return /^(?:0|1|0?\.\d+|1\.0+)$/.test(components[3] ?? '') ? value : undefined
}

function applyBorderStyle(
  style: CSSProperties,
  side: 'top' | 'right' | 'bottom' | 'left',
  border: SpreadsheetBorderSpec | undefined,
): void {
  if (!border || border.style === 'none') return
  let borderStyle: 'solid' | 'dashed' | 'dotted' | 'double'
  let borderWidth: string | undefined
  switch (border.style) {
    case 'thin':
      borderStyle = 'solid'
      borderWidth = '1px'
      break
    case 'medium':
      borderStyle = 'solid'
      borderWidth = '2px'
      break
    case 'thick':
      borderStyle = 'solid'
      borderWidth = '3px'
      break
    case 'dashed':
    case 'dotted':
    case 'double':
      borderStyle = border.style
      break
    default:
      return
  }
  const color = sanitizeColor(border.color)

  switch (side) {
    case 'top':
      style.borderTopStyle = borderStyle
      if (borderWidth) style.borderTopWidth = borderWidth
      if (color) style.borderTopColor = color
      break
    case 'right':
      style.borderRightStyle = borderStyle
      if (borderWidth) style.borderRightWidth = borderWidth
      if (color) style.borderRightColor = color
      break
    case 'bottom':
      style.borderBottomStyle = borderStyle
      if (borderWidth) style.borderBottomWidth = borderWidth
      if (color) style.borderBottomColor = color
      break
    case 'left':
      style.borderLeftStyle = borderStyle
      if (borderWidth) style.borderLeftWidth = borderWidth
      if (color) style.borderLeftColor = color
      break
  }
}

function formatCellStyle(format: SpreadsheetCellFormat | undefined): CSSProperties | undefined {
  if (!format) return undefined

  const style: CSSProperties = {}
  const foreground = sanitizeColor(format.fgColor)
  const background = sanitizeColor(format.bgColor)
  const fontFamily = format.fontFamily?.trim()
  const fontSize = format.fontSize
  const decorations = [
    format.underline && 'underline',
    format.strikethrough && 'line-through',
  ].filter(Boolean)

  if (format.bold) style.fontWeight = 'bold'
  if (format.italic) style.fontStyle = 'italic'
  if (decorations.length) style.textDecoration = decorations.join(' ')
  if (foreground) style.color = foreground
  if (background) style.backgroundColor = background
  if (fontFamily && FONT_FAMILY_RE.test(fontFamily)) style.fontFamily = fontFamily
  if (
    typeof fontSize === 'number' &&
    Number.isFinite(fontSize) &&
    fontSize > 0 &&
    fontSize <= 512
  ) {
    style.fontSize = `${fontSize}px`
  }

  switch (format.align) {
    case 'left':
    case 'center':
    case 'right':
    case 'justify':
      style.textAlign = format.align
      break
    case 'fill':
      style.textAlign = 'left'
      break
    case 'distributed':
      style.textAlign = 'justify'
      style.textAlignLast = 'justify'
      break
  }

  switch (format.verticalAlign) {
    case 'top':
    case 'bottom':
      style.verticalAlign = format.verticalAlign
      break
    case 'center':
      style.verticalAlign = 'middle'
      break
  }

  if (typeof format.indent === 'number' && Number.isFinite(format.indent) && format.indent > 0) {
    style.paddingLeft = `${Math.min(format.indent, 250) * 8}px`
  }

  applyBorderStyle(style, 'top', format.borders?.top)
  applyBorderStyle(style, 'right', format.borders?.right)
  applyBorderStyle(style, 'bottom', format.borders?.bottom)
  applyBorderStyle(style, 'left', format.borders?.left)

  if (format.rotation === 'vertical') {
    style.writingMode = 'vertical-rl'
    style.textOrientation = 'mixed'
  } else if (
    typeof format.rotation === 'number' &&
    Number.isFinite(format.rotation) &&
    format.rotation >= -90 &&
    format.rotation <= 90 &&
    format.rotation !== 0
  ) {
    style.display = 'inline-block'
    style.transform = `rotate(${format.rotation}deg)`
    style.transformOrigin = 'center center'
  }

  const overflow = format.overflow ?? (format.wrap ? 'wrap' : undefined)
  if (overflow === 'wrap') {
    style.overflowWrap = 'anywhere'
    style.whiteSpace = 'normal'
    style.wordBreak = 'break-word'
  } else if (overflow === 'clip' || overflow === 'ellipsis') {
    style.overflow = 'hidden'
    style.textOverflow = 'ellipsis'
    style.whiteSpace = 'nowrap'
  } else if (overflow === 'overflow') {
    style.overflow = 'visible'
    style.whiteSpace = 'nowrap'
  }

  return style
}

/** Inputs for the controlled, read-only spreadsheet grid projection. */
export interface SpreadsheetGridProps {
  readonly window: CellRange
  readonly cells: readonly DisplayCell[]
  readonly selected?: CellRange
}

function isSelectedCell(selected: CellRange | undefined, row: number, col: number): boolean {
  return (
    selected !== undefined &&
    row >= selected.rowStart &&
    row <= selected.rowEnd &&
    col >= selected.colStart &&
    col <= selected.colEnd
  )
}

/** Renders a caller-owned spreadsheet projection without fetching or editing it. */
export function SpreadsheetGrid({ window, cells, selected }: SpreadsheetGridProps) {
  const cellsByCoordinate = new Map(cells.map((cell) => [`${cell.row}:${cell.col}`, cell]))
  const rows = []

  for (let row = window.rowStart; row <= window.rowEnd; row += 1) {
    const rowCells = []

    for (let col = window.colStart; col <= window.colEnd; col += 1) {
      const cell = cellsByCoordinate.get(`${row}:${col}`)
      const isSelected = isSelectedCell(selected, row, col)

      rowCells.push(
        <td
          key={col}
          className={isSelected ? 'cell cell-selected' : 'cell'}
          data-cell={`${row}:${col}`}
          data-selected={isSelected ? 'true' : undefined}
          style={formatCellStyle(cell?.format)}
        >
          {cell?.displayValue ?? ''}
        </td>,
      )
    }

    rows.push(<tr key={row}>{rowCells}</tr>)
  }

  return (
    <table className="spreadsheet-grid">
      <tbody>{rows}</tbody>
    </table>
  )
}
