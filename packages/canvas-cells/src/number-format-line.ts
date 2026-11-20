import type { DisplayCell } from '@einfach-excel/spreadsheet-ui-core'

type Layout = NonNullable<DisplayCell['numberFormatDisplay']>

/** 字符区间 [from, to) 的宽度：`_x` 位置按字符 x 的宽度计，其余按实际文字。 */
function runWidth(
  ctx: CanvasRenderingContext2D, chars: readonly string[], from: number, to: number, pads: Layout['pads'],
): number {
  let width = 0
  let plain = ''
  for (let index = from; index < to; index++) {
    const pad = pads?.find(({ at }) => at === index)
    if (!pad) { plain += chars[index]; continue }
    width += ctx.measureText(plain).width + ctx.measureText(pad.char).width
    plain = ''
  }
  return width + ctx.measureText(plain).width
}

/** Intrinsic glyph width excludes the adaptive fill gap but includes each real pad character. */
export function numberFormatLineWidth(
  ctx: CanvasRenderingContext2D, text: string, layout: Layout | undefined,
): number {
  const chars = Array.from(text)
  const fill = layout?.fill
  if (fill && fill.at <= chars.length) return runWidth(ctx, chars, 0, fill.at, layout?.pads)
    + runWidth(ctx, chars, fill.at, chars.length, layout?.pads)
  return runWidth(ctx, chars, 0, chars.length, layout?.pads)
}

/**
 * 从 edge 起绘制区间：left 向右排、right 从右边缘向左排（文字段右对齐）。
 * `_x` 位置不画字，只让出字符 x 的宽度。
 */
function drawRun(
  ctx: CanvasRenderingContext2D, chars: readonly string[], from: number, to: number,
  pads: Layout['pads'], edge: number, top: number, align: 'left' | 'right',
): void {
  const step = align === 'left' ? 1 : -1
  ctx.textAlign = align
  let x = edge
  let plain = ''
  const flush = () => {
    if (plain) ctx.fillText(plain, x, top)
    x += step * ctx.measureText(plain).width
    plain = ''
  }
  for (let offset = 0; offset < to - from; offset++) {
    const index = align === 'left' ? from + offset : to - 1 - offset
    const pad = pads?.find(({ at }) => at === index)
    if (!pad) { plain = align === 'left' ? plain + chars[index] : chars[index] + plain; continue }
    flush()
    x += step * ctx.measureText(pad.char).width
  }
  flush()
}

/**
 * 自定义数字格式的一行 Canvas 排版：`*x` 填充前的文字贴左、之后的贴右，中间按剩余宽度重复填充字符
 * （空格只留间隙）；`_x` 留白按字符 x 的宽度前进。没有填充时整行按当前 textAlign 对齐到 x。
 * 返回 false 表示这一行不适用，调用方按普通文字绘制。
 */
export function paintNumberFormatLine(
  ctx: CanvasRenderingContext2D, line: string, layout: Layout,
  box: { readonly left: number; readonly width: number; readonly x: number }, top: number,
): boolean {
  const { fill, pads } = layout
  const chars = Array.from(line)
  if ((!fill && !pads?.length) || (fill && fill.at > chars.length)) return false
  const align = ctx.textAlign
  if (!fill) {
    const width = runWidth(ctx, chars, 0, chars.length, pads)
    if (align === 'right') drawRun(ctx, chars, 0, chars.length, pads, box.x, top, 'right')
    else drawRun(ctx, chars, 0, chars.length, pads,
      align === 'center' ? box.x - width / 2 : box.x, top, 'left')
  } else {
    const before = runWidth(ctx, chars, 0, fill.at, pads)
    const after = runWidth(ctx, chars, fill.at, chars.length, pads)
    drawRun(ctx, chars, 0, fill.at, pads, box.left, top, 'left')
    drawRun(ctx, chars, fill.at, chars.length, pads, box.left + box.width, top, 'right')
    const gap = box.width - before - after
    const unit = ctx.measureText(fill.char).width
    ctx.textAlign = 'left'
    if (fill.char !== ' ' && unit > 0 && gap >= unit)
      ctx.fillText(fill.char.repeat(Math.floor(gap / unit)), box.left + before, top)
  }
  ctx.textAlign = align
  return true
}
