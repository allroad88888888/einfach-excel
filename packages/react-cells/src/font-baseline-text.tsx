import { fontBaselineLayout, type SpreadsheetCellFormat } from '@einfach-excel/spreadsheet-ui-core'
import type { CSSProperties, ReactNode } from 'react'

/** Apply to glyphs only: the full-width number-format flex container stays unchanged. */
export function fontBaselineStyle(format?: Pick<SpreadsheetCellFormat, 'fontBaseline' | 'fontSize'>): CSSProperties {
  if (!format?.fontBaseline || format.fontBaseline === 'normal') return {}
  const glyph = fontBaselineLayout(format.fontSize ?? 12, format.fontBaseline)
  return { fontSize: glyph.size, verticalAlign: -glyph.shift, lineHeight: 1 }
}

/** Ordinary cells keep their original direct text node. */
export function fontBaselineText(text: ReactNode, format?: SpreadsheetCellFormat): ReactNode {
  return !format?.fontBaseline || format.fontBaseline === 'normal' ? text
    : <span data-font-baseline={format.fontBaseline} style={{ ...fontBaselineStyle(format),
      textDecoration: [format.underline && 'underline', format.strikethrough && 'line-through']
        .filter(Boolean).join(' ') || undefined,
    }}>{text}</span>
}
