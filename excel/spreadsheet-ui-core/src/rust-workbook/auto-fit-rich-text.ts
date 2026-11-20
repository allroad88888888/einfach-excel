import type { RichTextRun } from '../contracts'
import { fontBaselineLayout, fontVerticalMetrics } from '../text/font-baseline'
import type { RustSparseCellStyle } from './wasm-types'

/** Measure the runs Rust supplied in the same callback; no coordinate lookup or cell cache. */
export function measureAutoFitRichText(
  context: OffscreenCanvasRenderingContext2D,
  runs: readonly RichTextRun[],
  base: RustSparseCellStyle,
  defaults: { fontSize: number; fontFamily: string; lineRatio: number },
  wrapWidth: number | undefined,
) {
  const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  let width = 0, height = 0, lineWidth = 0, ascent = 0, descent = 0
  let lineHeight = defaults.fontSize * defaults.lineRatio
  const flush = () => {
    width = Math.max(width, lineWidth)
    height += Math.max(lineHeight, ascent + descent)
    lineWidth = ascent = descent = 0
    lineHeight = defaults.fontSize * defaults.lineRatio
  }
  const addMetrics = (above: number, below: number, nominal: number) => {
    ascent = Math.max(ascent, above)
    descent = Math.max(descent, below)
    lineHeight = Math.max(lineHeight, nominal * defaults.lineRatio)
  }
  for (const run of runs) {
    const nominal = run.format.fontSize ?? base.fontSize ?? defaults.fontSize
    const baseline = fontBaselineLayout(nominal,
      run.format.fontBaseline ?? base.fontBaseline ?? undefined)
    const family = run.format.fontFamily ?? base.fontFamily ?? defaults.fontFamily
    const safeFamily = /^[A-Za-z0-9, "'\-]+$/.test(family) ? family : defaults.fontFamily
    const font = (size: number) => `${(run.format.italic ?? base.italic) ? 'italic' : 'normal'} ${(run.format.bold ?? base.bold) ? 'bold' : 'normal'} ${size}px ${safeFamily}`
    context.font = font(nominal)
    const normal = fontVerticalMetrics(context.measureText('Mg'), nominal)
    context.font = font(baseline.size)
    const glyph = fontVerticalMetrics(context.measureText('Mg'), baseline.size)
    const above = Math.max(normal.ascent, glyph.ascent - baseline.shift)
    const below = Math.max(normal.descent, glyph.descent + baseline.shift)
    const text = wrapWidth === undefined ? run.text.replace(/[\t\n\r ]+/g, ' ')
      : run.text.replace(/\r\n?/g, '\n')
    let chunk = ''
    for (const { segment } of graphemes.segment(text)) {
      if (segment === '\n') {
        addMetrics(above, below, nominal)
        lineWidth += context.measureText(chunk).width
        chunk = ''
        flush(); continue
      }
      if (wrapWidth !== undefined &&
        lineWidth + context.measureText(chunk + segment).width > wrapWidth
        && (lineWidth > 0 || chunk)) {
        lineWidth += context.measureText(chunk).width
        chunk = ''
        flush()
      }
      addMetrics(above, below, nominal)
      chunk += segment
    }
    lineWidth += context.measureText(chunk).width
  }
  flush()
  return { width, height }
}
