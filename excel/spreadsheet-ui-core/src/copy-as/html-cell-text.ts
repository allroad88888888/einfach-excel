import type { DisplayCell, RichTextRun, SpreadsheetCellFormat } from '../contracts'
import { fontBaselineLayout } from '../text/font-baseline'
import {
  escapeHtml, escapeHtmlAttr, newlineToBr, sanitizeColor, sanitizeFontFamily, sanitizeFontSize,
} from './html-sanitize'

/** A formula/display override must never be replaced by stale inline content. */
export function hasRichText(cell: DisplayCell): boolean {
  return Boolean(cell.richText?.length &&
    cell.richText.map(run => run.text).join('') === cell.displayValue)
}

function glyphStyle(format: SpreadsheetCellFormat): string[] {
  const baseline = format.fontBaseline
  if (baseline !== 'superscript' && baseline !== 'subscript') return []
  const size = typeof format.fontSize === 'number' && Number.isFinite(format.fontSize)
    ? format.fontSize : 12
  const glyph = fontBaselineLayout(size, baseline)
  return [`font-size: ${sanitizeFontSize(glyph.size)}`,
    `vertical-align: ${-glyph.shift}pt`, 'line-height: 1']
}

function runStyle(run: RichTextRun, base: SpreadsheetCellFormat = {}): string {
  const format = { ...base, ...run.format }
  const styles: string[] = []
  const push = (name: string, value: string | undefined) => {
    if (value !== undefined) styles.push(`${name}: ${value}`)
  }
  if (format.bold !== undefined) push('font-weight', format.bold ? 'bold' : 'normal')
  if (format.italic !== undefined) push('font-style', format.italic ? 'italic' : 'normal')
  push('text-decoration', [format.underline && 'underline', format.strikethrough && 'line-through']
    .filter(Boolean).join(' ') || 'none')
  push('color', sanitizeColor(run.format.color ?? base.fgColor))
  push('font-family', sanitizeFontFamily(format.fontFamily))
  const baseline = glyphStyle(format)
  if (baseline.length) styles.push(...baseline)
  else {
    push('font-size', sanitizeFontSize(format.fontSize))
    push('vertical-align', 'baseline')
  }
  return styles.join('; ')
}

function span(text: string, style: string): string {
  return `<span style="${escapeHtmlAttr(style)}">${newlineToBr(escapeHtml(text))}</span>`
}

/** Safe glyph output; table-cell vertical alignment remains a separate box property. */
export function buildCellContent(cell: DisplayCell | undefined): string {
  if (!cell || cell.displayValue == null) return ''
  if (hasRichText(cell)) {
    let previousCR = false
    return cell.richText!.map(run => {
      if (!run.text) return ''
      // A CRLF divided between runs is still one line break.
      const text = previousCR && run.text.startsWith('\n') ? run.text.slice(1) : run.text
      previousCR = run.text.endsWith('\r')
      return span(text, runStyle(run, cell.format))
    }).join('')
  }
  const style = glyphStyle(cell.format ?? {}).join('; ')
  return style ? span(cell.displayValue, style) : newlineToBr(escapeHtml(cell.displayValue))
}
