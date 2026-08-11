import type { ManualPageBreak } from './types'

/**
 * Shift manual page break indices after row/column insertions or deletions.
 * Breaks on the chosen axis with index >= fromIndex move by delta.
 */
export function shiftManualPageBreaks(
  breaks: ManualPageBreak[],
  axis: 'row' | 'column',
  fromIndex: number,
  delta: number,
): ManualPageBreak[] {
  if (delta === 0) return breaks

  return breaks.map((pageBreak) => {
    if (pageBreak.axis !== axis || pageBreak.index < fromIndex) return pageBreak
    return { axis: pageBreak.axis, index: pageBreak.index + delta }
  })
}
