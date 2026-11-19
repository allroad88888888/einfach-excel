import { CELL_PATTERN_TILE_SIZE, gradientFillImage, patternFillImage,
  type SpreadsheetCellFill } from '@einfach-excel/spreadsheet-ui-core'
import type { CSSProperties } from 'react'

/** The base color stays separate so removing the descriptor retains normal background semantics. */
export function cellFillStyle(fill?: SpreadsheetCellFill, background?: string): CSSProperties {
  if (!fill) return {}
  if (fill.kind !== 'pattern') {
    if (fill.stops.length === 0) return { backgroundColor: background ?? '#000000' }
    const backgroundImage = gradientFillImage(fill)
    return backgroundImage ? { backgroundImage, backgroundSize: '100% 100%',
      backgroundPosition: '0 0', backgroundRepeat: 'no-repeat', backgroundOrigin: 'border-box' } : {}
  }
  const backgroundImage = patternFillImage(fill)
  return backgroundImage ? { backgroundImage,
    backgroundSize: `${CELL_PATTERN_TILE_SIZE}px ${CELL_PATTERN_TILE_SIZE}px`,
    backgroundPosition: '0 0', backgroundRepeat: 'repeat', backgroundOrigin: 'border-box' } : {}
}
