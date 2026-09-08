import { formatNumberValue } from '../operations/format/numberFormat'
import type { RustSparseCellStyle } from './wasm-types'

/** 来自默认单元格的 CSS 像素值，不包含任何工作簿数据。 */
export interface AutoFitLayout {
  readonly fontFamily: string
  readonly fontSize: number
  readonly lineHeight: number
  readonly paddingTop: number
  readonly paddingBottom: number
  readonly paddingLeft: number
  readonly paddingRight: number
  readonly borderTop: number
  readonly borderBottom: number
  readonly borderLeft: number
  readonly borderRight: number
}

export interface AutoFitText {
  readonly text: string
  readonly numericValue?: number | null
  readonly format: RustSparseCellStyle
  readonly width: number
}

/** 每次命令共用一个画布；Rust 逐格调用，不缓存或复制工作簿。 */
export function createAutoFitMeasurer(axis: 'row' | 'column', layout: AutoFitLayout) {
  if (
    !layout.fontFamily ||
    !Object.entries(layout).every(
      ([key, value]) =>
        key === 'fontFamily' || (typeof value === 'number' && Number.isFinite(value) && value >= 0),
    ) ||
    layout.fontSize <= 0 ||
    layout.lineHeight <= 0
  )
    throw new Error('Grid text layout is unavailable.')
  if (typeof OffscreenCanvas === 'undefined')
    throw new Error('Browser text measurement is unavailable.')
  const context = new OffscreenCanvas(1, 1).getContext('2d')
  if (!context) throw new Error('Browser text measurement is unavailable.')
  const words = new Intl.Segmenter(undefined, { granularity: 'word' })
  const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const widthOf = (text: string) => context.measureText(text).width

  // 先按词换行，超长词再按完整字素断行，不切断组合字符或 emoji。
  const wrappedLines = (text: string, width: number): number => {
    let lines = 1
    let line = ''
    for (const { segment } of words.segment(text)) {
      // pre-wrap 的行尾空格可悬挂；不能把词间空格误算成独立的一行。
      if (/^\s+$/.test(segment) && line) {
        line += segment
        continue
      }
      if (widthOf(line + segment) <= width) {
        line += segment
        continue
      }
      if (line) {
        lines += 1
        line = ''
      }
      if (widthOf(segment) <= width) {
        line = segment
        continue
      }
      for (const { segment: char } of graphemes.segment(segment)) {
        if (line && widthOf(line + char) > width) {
          lines += 1
          line = ''
        }
        line += char
      }
    }
    return lines
  }
  return ({ text: raw, numericValue, format, width }: AutoFitText): number => {
    const numberFormat = format.numberFormat
    const text =
      numericValue != null && numberFormat && numberFormat.kind !== 'general'
        ? formatNumberValue(numberFormat, numericValue, { locale: format.locale ?? undefined }).text
        : raw
    const size =
      typeof format.fontSize === 'number' && format.fontSize > 0 && format.fontSize <= 512
        ? format.fontSize
        : layout.fontSize
    const family = format.fontFamily?.trim()
    context.font = `${format.italic ? 'italic' : 'normal'} ${format.bold ? 'bold' : 'normal'} ${size}px ${family && /^[A-Za-z0-9, "'\-]+$/.test(family) ? family : layout.fontFamily}`
    const lineHeight = (size * layout.lineHeight) / layout.fontSize
    const border = (side: 'top' | 'bottom' | 'left' | 'right', fallback: number) => {
      const style = format.borders?.[side]?.style
      if (!style || style === 'none') return fallback
      if (style === 'thin') return 1
      if (style === 'medium') return 2
      if (style === 'thick') return 3
      return fallback || 3
    }
    const indent =
      typeof format.indent === 'number' && format.indent > 0
        ? Math.min(format.indent, 250) * 8
        : layout.paddingLeft
    const horizontal =
      indent +
      layout.paddingRight +
      border('left', layout.borderLeft) +
      border('right', layout.borderRight)
    const vertical =
      layout.paddingTop +
      layout.paddingBottom +
      border('top', layout.borderTop) +
      border('bottom', layout.borderBottom)
    const wrap = format.overflow === 'wrap' || (!format.overflow && format.wrap)
    const paragraphs = wrap
      ? text.replace(/\r\n?/g, '\n').split('\n')
      : [text.replace(/[\t\n\r ]+/g, ' ')]
    let textWidth = Math.max(0, ...paragraphs.map(widthOf))
    let textHeight =
      lineHeight *
      paragraphs.reduce(
        (count, paragraph) =>
          count +
          (axis === 'row' && wrap ? wrappedLines(paragraph, Math.max(1, width - horizontal)) : 1),
        0,
      )
    if (axis === 'row' && wrap) textWidth = Math.min(textWidth, Math.max(1, width - horizontal))
    if (format.rotation === 'vertical') {
      // mixed writing-mode: CJK upright, latin runs sideways.
      textHeight = Math.max(
        ...paragraphs.map((paragraph) => {
          let height = 0
          let latin = ''
          for (const { segment } of graphemes.segment(paragraph)) {
            if (
              /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}|\p{Extended_Pictographic}/u.test(
                segment,
              )
            ) {
              height += widthOf(latin) + size
              latin = ''
            } else latin += segment
          }
          return height + widthOf(latin)
        }),
      )
      textWidth = lineHeight * paragraphs.length
    } else if (typeof format.rotation === 'number' && Math.abs(format.rotation) <= 90) {
      const angle = (Math.abs(format.rotation) * Math.PI) / 180
      const rotatedWidth = textWidth * Math.cos(angle) + textHeight * Math.sin(angle)
      textHeight = textWidth * Math.sin(angle) + textHeight * Math.cos(angle)
      textWidth = rotatedWidth
    }
    return axis === 'row' ? textHeight + vertical : textWidth + horizontal
  }
}
