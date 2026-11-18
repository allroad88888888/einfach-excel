import type { SpreadsheetCellFormat } from '../contracts'

/** Layout applicability is shared by every renderer; stored flags remain unchanged. */
export function textShrinkBlockedReason(
  format: SpreadsheetCellFormat | undefined, text: string,
): 'wrap' | 'multiline' | 'vertical' | null {
  if (format?.wrap || format?.overflow === 'wrap') return 'wrap'
  if (/[\r\n\u2028\u2029]/u.test(text)) return 'multiline'
  return format?.rotation === 'vertical' ? 'vertical' : null
}

/** Callers measure glyphs at their nominal size, including pads but excluding repeated fill. */
export function textShrinkScale(
  format: SpreadsheetCellFormat | undefined, text: string,
  naturalWidth: number, availableWidth: number,
  measureAtScale?: (scale: number) => number,
): number {
  if (!(format?.shrinkToFit || format?.overflow === 'shrink-to-fit') ||
    textShrinkBlockedReason(format, text) || !Number.isFinite(naturalWidth) ||
    !Number.isFinite(availableWidth) || naturalWidth <= 0 || availableWidth <= 0) return 1
  let scale = Math.min(1, availableWidth / naturalWidth)
  if (!measureAtScale || scale === 1) return scale
  // Small-font shaping/hinting need not be linear. Verify the size we will actually paint.
  for (let attempt = 0; attempt < 3; attempt++) {
    const measured = measureAtScale(scale)
    if (!Number.isFinite(measured) || measured <= availableWidth) return scale
    scale *= availableWidth / measured
  }
  let lower = 0, upper = scale
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = (lower + upper) / 2
    const measured = measureAtScale(candidate)
    if (Number.isFinite(measured) && measured <= availableWidth) lower = candidate
    else upper = candidate
  }
  return lower
}
