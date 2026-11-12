import type { DisplayCell } from '@einfach-excel/spreadsheet-ui-core'
import type { CSSProperties, ReactNode } from 'react'
import './number-format-text.css'

/** 填充字符重复到足够宽，再由 flex 间隙裁掉多余部分；不测量 DOM。 */
const FILL_REPEAT = 256

/** 公式视图显示公式原文时，Rust 的格式化附加信息不适用。 */
function formatted(cell: DisplayCell | undefined, showFormulas: boolean): boolean {
  return !!cell && !(showFormulas && cell.formula)
}

/** 自定义格式段颜色覆盖用户字体色；条件格式字体色已在 UI Core 去掉段颜色。 */
export function numberFormatColorStyle(
  cell: DisplayCell | undefined, showFormulas: boolean,
): CSSProperties | undefined {
  const color = cell?.numberFormatDisplay?.color
  return color && formatted(cell, showFormulas) ? { color } : undefined
}

/** 自定义代码的 `_x` 留白要保留空格宽度，不能被 nowrap 折叠。 */
export function numberFormatSpacingStyle(cell: DisplayCell | undefined): CSSProperties | undefined {
  const kind = cell?.format?.numberFormat?.kind
  return kind === 'custom' || kind === 'accounting' ? { whiteSpace: 'pre' } : undefined
}

type NumberFormatDisplay = NonNullable<DisplayCell['numberFormatDisplay']>

/** 网格要额外排版（`*x` 填充或 `_x` 留白）时返回 Rust 的显示附加信息。 */
export function numberFormatLayout(
  cell: DisplayCell | undefined, showFormulas: boolean,
): NumberFormatDisplay | undefined {
  const display = cell?.numberFormatDisplay
  return (display?.fill || display?.pads?.length) && formatted(cell, showFormulas)
    ? display : undefined
}

/** `_x` 位置用不可见的 x 占位，留出与 x 等宽的空白；其余字符原样输出。 */
function padded(chars: readonly string[], from: number, to: number,
  pads: NumberFormatDisplay['pads']): ReactNode[] {
  const nodes: ReactNode[] = []
  let plain = ''
  for (let index = from; index < to; index++) {
    const pad = pads?.find(({ at }) => at === index)
    if (!pad) { plain += chars[index]; continue }
    if (plain) nodes.push(plain)
    plain = ''
    nodes.push(<span key={index} className="cell-pad" aria-hidden="true">{pad.char}</span>)
  }
  if (plain) nodes.push(plain)
  return nodes
}

/**
 * Excel `*x` 填充与 `_x` 留白：填充前的文字贴左、之后的贴右，中间重复填充字符（空格只留间隙）；
 * 留白位置渲染不可见的占位字符。网格单元格与数字格式预览共用这一份排版。
 */
export function NumberFormatText({ display, text }: {
  readonly display: NumberFormatDisplay
  readonly text: string
}) {
  const { fill, pads } = display
  const chars = Array.from(text)
  if (!fill) return <span className="cell-number-text">{padded(chars, 0, chars.length, pads)}</span>
  return <span className="cell-fill-text" data-number-fill={fill.char}>
    <span className="cell-fill-start">{padded(chars, 0, fill.at, pads)}</span>
    <span className="cell-fill-repeat" aria-hidden="true">
      {fill.char === ' ' ? '' : fill.char.repeat(FILL_REPEAT)}</span>
    <span className="cell-fill-end">{padded(chars, fill.at, chars.length, pads)}</span>
  </span>
}
