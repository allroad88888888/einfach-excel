import type { DisplayCell, RichTextRun } from '@einfach-excel/spreadsheet-ui-core'
import type { CSSProperties } from 'react'

export function richTextRunStyle(run: RichTextRun, cell?: DisplayCell): CSSProperties {
  const format = { ...cell?.format, ...run.format }
  return {
    fontWeight: format.bold === undefined ? undefined : format.bold ? 700 : 400,
    fontStyle: format.italic === undefined ? undefined : format.italic ? 'italic' : 'normal',
    color: run.format.color,
    fontFamily: format.fontFamily,
    fontSize: format.fontSize,
    textDecoration:
      format.underline === undefined && format.strikethrough === undefined
        ? undefined
        : [format.underline && 'underline', format.strikethrough && 'line-through']
            .filter(Boolean)
            .join(' ') || 'none',
  }
}

/** React escapes all run text; rich text never introduces cell HTML. */
export function RichCellText({
  cell,
  text,
  showFormulas,
}: {
  cell?: DisplayCell
  text: string
  showFormulas: boolean
}) {
  if (showFormulas || !cell?.richText?.length) return text
  return cell.richText.map((run, index) => (
    <span key={index} style={richTextRunStyle(run, cell)}>
      {run.text}
    </span>
  ))
}
