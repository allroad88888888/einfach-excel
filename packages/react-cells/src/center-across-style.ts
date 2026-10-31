import type { CSSProperties } from 'react'
import type { CenterAcrossRun } from '@einfach-excel/spreadsheet-ui-core'

/** 单元格左右内边距之和（见 cells.css 的 `padding: 3px 7px`）。 */
const CELL_PADDING_X = 14

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
export function centerAcrossStyles(spanWidth: number): {
  readonly cell: CSSProperties
  readonly content: CSSProperties
} {
  return {
    cell: { position: 'relative', overflow: 'visible' },
    content: {
      width: Math.max(0, spanWidth - CELL_PADDING_X),
      overflow: 'visible',
      textAlign: 'center',
      pointerEvents: 'none',
    },
  }
}
