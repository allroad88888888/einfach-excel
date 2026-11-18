import type { CSSProperties } from 'react'
import type { CenterAcrossRun } from '@einfach-excel/spreadsheet-ui-core'

/** 跨列居中区间覆盖的像素宽度；隐藏列宽度为 0 自然不计入。 */
export function centerAcrossSpanWidth(
  run: CenterAcrossRun,
  windowColStart: number,
  columnWidths: readonly number[],
): number {
  let width = 0
  for (let col = run.colStart; col <= run.colEnd; col += 1) {
    width += columnWidths[col - windowColStart] ?? 0
  }
  return width
}

/**
 * 锚点格：单元格本身放开裁切并提升到邻格之上，文字块撑满整个区间后居中。
 * 文字块不接收指针，点击被盖住的空格仍然命中该空格。
 */
export function centerAcrossStyles(spanWidth: number, style: CSSProperties = {}): {
  readonly cell: CSSProperties
  readonly content: CSSProperties
} {
  // The content starts after the anchor's real padding/border, including indentation.
  // A fixed 14px subtraction would let the span overrun its last column when indented.
  const pixels = (value: CSSProperties['paddingLeft'], fallback: number) =>
    value === undefined ? fallback : Number.parseFloat(String(value)) || 0
  const inset = pixels(style.paddingLeft, 7) + pixels(style.paddingRight, 7)
    + pixels(style.borderLeftWidth, 0) + pixels(style.borderRightWidth, 1)
  return {
    cell: { position: 'relative', overflow: 'visible' },
    content: {
      width: Math.max(0, spanWidth - inset),
      overflow: 'visible',
      textAlign: 'center',
      pointerEvents: 'none',
    },
  }
}
