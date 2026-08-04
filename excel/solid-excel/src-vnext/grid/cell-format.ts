import type { DisplayCell, RichTextRunFormat, SpreadsheetCellFormat } from '@einfach/spreadsheet-ui-core'

export function getCellFormatStyle(format: SpreadsheetCellFormat | undefined): Record<string, string> {
  if (!format) return {}
  const style: Record<string, string> = {}
  if (format.fgColor) style.color = format.fgColor
  if (format.bold) style['font-weight'] = '700'
  if (format.italic) style['font-style'] = 'italic'
  const decorations: string[] = []
  if (format.underline) decorations.push('underline')
  if (format.strikethrough) decorations.push('line-through')
  if (decorations.length > 0) style['text-decoration'] = decorations.join(' ')
  if (format.align && format.align !== 'default') {
    if (format.align === 'distributed') {
      style['text-align'] = 'justify'
      style['text-align-last'] = 'justify'
    } else if (format.align === 'fill') style['text-align'] = 'left'
    else style['text-align'] = format.align
  }
  if (format.fontSize) style['font-size'] = `${format.fontSize}px`
  if (format.fontFamily) style['font-family'] = format.fontFamily
  if (format.verticalAlign) {
    style['vertical-align'] = format.verticalAlign === 'center' ? 'middle' : format.verticalAlign
    style['--cell-vertical-align'] = format.verticalAlign
    style.height = 'auto'
    if (format.verticalAlign === 'top') {
      style['margin-top'] = '0'
      style['margin-bottom'] = 'auto'
    } else if (format.verticalAlign === 'center') {
      style['margin-top'] = 'auto'
      style['margin-bottom'] = 'auto'
    } else {
      style['margin-top'] = 'auto'
      style['margin-bottom'] = '0'
    }
  }
  if (format.rotation !== undefined && format.rotation !== 0) {
    if (format.rotation === 'vertical') {
      style['writing-mode'] = 'vertical-rl'
      style['text-orientation'] = 'mixed'
    } else if (typeof format.rotation === 'number') {
      style.transform = `rotate(${format.rotation}deg)`
      style['transform-origin'] = 'center center'
      style.display = 'inline-block'
    }
  }
  const overflow = format.overflow ?? (format.wrap ? 'wrap' : undefined)
  if (overflow === 'wrap') {
    style['white-space'] = 'normal'
    style['word-break'] = 'break-word'
    style['overflow-wrap'] = 'anywhere'
  } else if (overflow === 'clip' || overflow === 'ellipsis') {
    style['white-space'] = 'nowrap'
    style.overflow = 'hidden'
    style['text-overflow'] = 'ellipsis'
  } else if (overflow === 'shrink-to-fit' || format.shrinkToFit) {
    style['white-space'] = 'nowrap'
    style.overflow = 'hidden'
    style['--cell-shrink-to-fit'] = '1'
  } else if (overflow === 'overflow') {
    style['white-space'] = 'nowrap'
    style.overflow = 'visible'
  }
  if (format.indent && format.indent > 0) style['padding-left'] = `${format.indent * 8}px`
  return style
}

export function getCellBackgroundStyle(format: SpreadsheetCellFormat | undefined): Record<string, string> {
  return format?.bgColor ? { background: format.bgColor } : {}
}

export function getDisplayCellFormat(cell: DisplayCell | undefined): SpreadsheetCellFormat | undefined {
  if (!cell?.format && !cell?.conditionalFormat) return undefined
  return { ...cell.format, ...cell.conditionalFormat, numberFormat: cell.conditionalFormat?.numberFormat ?? cell.format?.numberFormat }
}

export function getCellValidationSeverity(cell: DisplayCell | undefined): string | undefined { return cell?.validation?.severity }
export function getCellValidationMessage(cell: DisplayCell | undefined): string | undefined { return cell?.validation?.message }
export function getCellRichUrl(cell: DisplayCell | undefined): string | undefined { return cell?.richValue?.kind === 'hyperlink' ? cell.richValue.url : undefined }

export function getCellBordersAttr(cell: DisplayCell | undefined): string | undefined {
  const borders = cell?.format?.borders
  if (!borders) return undefined
  const sides: string[] = []
  if (borders.top && borders.top.style !== 'none') sides.push('top')
  if (borders.right && borders.right.style !== 'none') sides.push('right')
  if (borders.bottom && borders.bottom.style !== 'none') sides.push('bottom')
  if (borders.left && borders.left.style !== 'none') sides.push('left')
  return sides.length > 0 ? sides.join(' ') : undefined
}

export function getRichRunStyle(format: RichTextRunFormat | undefined): Record<string, string> {
  if (!format) return {}
  const style: Record<string, string> = {}
  const decorations: string[] = []
  if (format.bold) style['font-weight'] = '700'
  if (format.italic) style['font-style'] = 'italic'
  if (format.underline) decorations.push('underline')
  if (format.strikethrough) decorations.push('line-through')
  if (decorations.length > 0) style['text-decoration'] = decorations.join(' ')
  if (format.color) style.color = format.color
  return style
}
