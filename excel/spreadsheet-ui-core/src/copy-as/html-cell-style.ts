import type { DisplayCell, SpreadsheetCellFormat } from '../contracts/types'
import { sanitizeColor, sanitizeFontFamily, sanitizeFontSize } from './html-sanitize'

interface StyleAcc {
  parts: string[]
}

function pushStyle(acc: StyleAcc, prop: string, value: string | undefined | null): void {
  if (value == null || value === '') return
  acc.parts.push(`${prop}: ${value}`)
}

function buildTextDecoration(fmt: SpreadsheetCellFormat): string | undefined {
  const decorations: string[] = []
  if (fmt.underline) decorations.push('underline')
  if (fmt.strikethrough) decorations.push('line-through')
  return decorations.length ? decorations.join(' ') : undefined
}

function alignmentToCss(align: SpreadsheetCellFormat['align']): string | undefined {
  switch (align) {
    case 'left':
    case 'right':
    case 'center':
    case 'justify':
      return align
    case 'centerAcross':
      return 'center'
    case 'fill':
    case 'distributed':
      // No exact CSS equivalent — drop silently rather than guess.
      return undefined
    case 'default':
    case undefined:
      return undefined
    default:
      return undefined
  }
}

function verticalAlignToCss(va: SpreadsheetCellFormat['verticalAlign']): string | undefined {
  switch (va) {
    case 'top':
    case 'bottom':
      return va
    case 'center':
      return 'middle'
    case 'justify':
    case 'distributed':
      return undefined
    case undefined:
      return undefined
    default:
      return undefined
  }
}

export function buildCellStyle(cell: DisplayCell, richText = false): string {
  const fmt = cell.format
  if (!fmt) return ''
  const acc: StyleAcc = { parts: [] }
  if (fmt.bold) pushStyle(acc, 'font-weight', 'bold')
  if (fmt.italic) pushStyle(acc, 'font-style', 'italic')
  if (!richText) pushStyle(acc, 'text-decoration', buildTextDecoration(fmt))
  pushStyle(acc, 'text-align', alignmentToCss(fmt.align))
  pushStyle(acc, 'vertical-align', verticalAlignToCss(fmt.verticalAlign))
  pushStyle(acc, 'background-color', sanitizeColor(fmt.bgColor))
  pushStyle(acc, 'color', sanitizeColor(fmt.fgColor))
  pushStyle(acc, 'font-family', sanitizeFontFamily(fmt.fontFamily))
  pushStyle(acc, 'font-size', sanitizeFontSize(fmt.fontSize))
  return acc.parts.join('; ')
}

