import type { Rect } from '@einfach-excel/canvas'
import {
  externalHyperlink,
  type DisplayCell,
  type RichTextFormat,
} from '@einfach-excel/spreadsheet-ui-core'
import type { CanvasCellsTheme } from './types'

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

interface Glyph {
  text: string
  format: RichTextFormat
  size: number
  width: number
}
interface Line {
  glyphs: Glyph[]
  width: number
  height: number
}

/** Segment formatting uses the same cell clipping, alignment and rotation as plain text. */
export function paintRichText(
  ctx: CanvasRenderingContext2D,
  bounds: Rect,
  cell: DisplayCell,
  theme: CanvasCellsTheme,
  filter: boolean,
  clip?: Rect,
) {
  const base = cell.format
  const hyperlink = Boolean(externalHyperlink(cell.hyperlink))
  const indent = Math.max(0, Math.min(250, base?.indent ?? 0)) * 8
  const width = Math.max(0, bounds.width - 14 - indent - (filter ? 22 : 0))
  const height = Math.max(0, bounds.height - 7)
  if (!width || !height) return
  const wrapping = base?.overflow === 'wrap' || base?.wrap
  const vertical = base?.rotation === 'vertical'
  const left = bounds.x + 7 + indent
  const font = (format: RichTextFormat, size: number) => {
    const family = format.fontFamily ?? base?.fontFamily ?? theme.fontFamily
    return `${(format.italic ?? base?.italic) ? 'italic ' : ''}${(format.bold ?? base?.bold) ? 'bold ' : ''}${size}px ${family}`
  }
  ctx.save()
  try {
    if (clip) {
      ctx.beginPath()
      ctx.rect(clip.x, clip.y, clip.width, clip.height)
      ctx.clip()
    }
    ctx.beginPath()
    ctx.rect(left, bounds.y + 3, width, height)
    ctx.clip()
    const glyphs: Glyph[] = []
    for (const run of cell.richText ?? []) {
      const size = Math.min(512, Math.max(1, run.format.fontSize ?? base?.fontSize ?? 12))
      ctx.font = font(run.format, size)
      for (const { segment: char } of graphemes.segment(run.text)) {
        const text = char === '\n' && !wrapping && !vertical ? ' ' : char
        glyphs.push({
          text,
          format: run.format,
          size,
          width: text === '\n' ? 0 : ctx.measureText(text).width,
        })
      }
    }
    const fullWidth = glyphs.reduce((sum, glyph) => sum + glyph.width, 0)
    const scale =
      base?.shrinkToFit && !wrapping && !vertical ? Math.min(1, width / Math.max(1, fullWidth)) : 1
    const lines: Line[] = []
    let line: Line = { glyphs: [], width: 0, height: (base?.fontSize ?? 12) * 1.2 * scale }
    const flush = () => {
      lines.push(line)
      line = { glyphs: [], width: 0, height: (base?.fontSize ?? 12) * 1.2 * scale }
    }
    for (const source of glyphs) {
      const glyph = { ...source, size: source.size * scale, width: source.width * scale }
      if (glyph.text === '\n') {
        flush()
        continue
      }
      if (line.glyphs.length && (vertical || (wrapping && line.width + glyph.width > width)))
        flush()
      line.glyphs.push(glyph)
      line.width += glyph.width
      line.height = Math.max(line.height, glyph.size * 1.2)
    }
    flush()
    if (!wrapping && !vertical && (base?.overflow === 'ellipsis' || base?.overflow === 'clip')) {
      const first = lines[0]!
      if (first.width > width) {
        const tail = first.glyphs.at(-1)
        if (tail) {
          ctx.font = font(tail.format, tail.size)
          const ellipsis = { ...tail, text: '…', width: ctx.measureText('…').width }
          while (first.glyphs.length && first.width + ellipsis.width > width)
            first.width -= first.glyphs.pop()!.width
          if (ellipsis.width <= width) {
            first.glyphs.push(ellipsis)
            first.width += ellipsis.width
          }
        }
      }
    }
    // Paint each contiguous style together so kerning and ligatures survive segmentation.
    for (const item of lines) {
      const chunks: Glyph[] = []
      for (const glyph of item.glyphs) {
        const previous = chunks.at(-1)
        if (previous?.format === glyph.format && previous.size === glyph.size)
          previous.text += glyph.text
        else chunks.push({ ...glyph })
      }
      item.width = 0
      for (const chunk of chunks) {
        ctx.font = font(chunk.format, chunk.size)
        chunk.width = ctx.measureText(chunk.text).width
        item.width += chunk.width
      }
      item.glyphs = chunks
    }
    const align = base?.align === 'centerAcross' ? 'center' : (base?.align ?? 'left')
    const blockHeight = lines.reduce((sum, item) => sum + item.height, 0)
    let top =
      bounds.y +
      3 +
      (base?.verticalAlign === 'top'
        ? 0
        : base?.verticalAlign === 'center'
          ? (height - blockHeight) / 2
          : height - blockHeight)
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    if (typeof base?.rotation === 'number' && base.rotation) {
      const cx = bounds.x + bounds.width / 2,
        cy = bounds.y + bounds.height / 2
      ctx.translate(cx, cy)
      ctx.rotate((Math.max(-90, Math.min(90, base.rotation)) * Math.PI) / 180)
      ctx.translate(-cx, -cy)
    }
    for (const item of lines) {
      let x =
        left +
        (align === 'right'
          ? width - item.width
          : align === 'center' || vertical
            ? (width - item.width) / 2
            : 0)
      for (const glyph of item.glyphs) {
        const y = top + item.height - glyph.size * 1.2
        ctx.font = font(glyph.format, glyph.size)
        ctx.fillStyle =
          glyph.format.color ?? base?.fgColor ?? (hyperlink ? theme.selection : theme.foreground)
        ctx.fillText(glyph.text, x, y)
        const underline = glyph.format.underline ?? (base?.underline || hyperlink)
        const strike = glyph.format.strikethrough ?? base?.strikethrough
        ctx.strokeStyle = ctx.fillStyle
        ctx.lineWidth = 1
        for (const offset of [underline ? glyph.size : null, strike ? glyph.size * 0.55 : null]) {
          if (offset === null) continue
          ctx.beginPath()
          ctx.moveTo(x, y + offset)
          ctx.lineTo(x + glyph.width, y + offset)
          ctx.stroke()
        }
        x += glyph.width
      }
      top += item.height
    }
  } finally {
    ctx.restore()
  }
}
