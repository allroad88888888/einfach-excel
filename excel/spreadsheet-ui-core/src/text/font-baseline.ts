import type { FontBaseline } from '../contracts/cell-format'

/** Product display parameters, not changes to the workbook's nominal font size. */
export function fontBaselineLayout(size: number, baseline?: FontBaseline) {
  const nominal = Math.min(512, Math.max(1, size))
  return {
    size: baseline && baseline !== 'normal' ? nominal * 0.65 : nominal,
    shift: baseline === 'superscript' ? -nominal * 0.3
      : baseline === 'subscript' ? nominal * 0.2 : 0,
  }
}

/** Use the loaded font's metrics; fallback supports measurement-only host contexts. */
export function fontVerticalMetrics(metrics: Partial<TextMetrics>, size: number) {
  const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent
  const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent
  return {
    ascent: typeof ascent === 'number' && Number.isFinite(ascent) ? ascent : size * 0.8,
    descent: typeof descent === 'number' && Number.isFinite(descent) ? descent : size * 0.2,
  }
}
