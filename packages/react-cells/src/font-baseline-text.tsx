import { fontBaselineLayout, type SpreadsheetCellFormat } from '@einfach-excel/spreadsheet-ui-core'
import type { CSSProperties, ReactNode } from 'react'

/** Absolute run sizes and offsets share the mounted cell's display scale exactly once. */
export function fontGlyphLength(value: number, format?: SpreadsheetCellFormat): number | string {
  return format?.shrinkToFit || format?.overflow === 'shrink-to-fit'
    ? `calc(${value}px * var(--cell-shrink-scale, 1))` : value
}

/** Apply to glyphs only: the full-width number-format flex container stays unchanged. */
export function fontBaselineStyle(format?: SpreadsheetCellFormat): CSSProperties {
  if (!format?.fontBaseline || format.fontBaseline === 'normal') return {}
  const glyph = fontBaselineLayout(format.fontSize ?? 12, format.fontBaseline)
  return { fontSize: fontGlyphLength(glyph.size, format),
    verticalAlign: fontGlyphLength(-glyph.shift, format), lineHeight: 1 }
}

/** Ordinary cells keep their original direct text node. */
export function fontBaselineText(text: ReactNode, format?: SpreadsheetCellFormat): ReactNode {
  return !format?.fontBaseline || format.fontBaseline === 'normal' ? text
    : <span data-font-baseline={format.fontBaseline} style={{ ...fontBaselineStyle(format),
      textDecoration: [format.underline && 'underline', format.strikethrough && 'line-through']
        .filter(Boolean).join(' ') || undefined,
    }}>{text}</span>
}
