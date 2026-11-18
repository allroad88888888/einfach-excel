import { CELL_PATTERN_TILE_SIZE, patternFillImage, type SpreadsheetCellFill } from '@einfach-excel/spreadsheet-ui-core'
import type { CSSProperties } from 'react'

/** The base color stays separate so removing the descriptor retains normal background semantics. */
export function cellFillStyle(fill?: SpreadsheetCellFill): CSSProperties {
  if (!fill) return {}
  const backgroundImage = patternFillImage(fill)
  return backgroundImage ? { backgroundImage,
    backgroundSize: `${CELL_PATTERN_TILE_SIZE}px ${CELL_PATTERN_TILE_SIZE}px`,
    backgroundPosition: '0 0', backgroundRepeat: 'repeat', backgroundOrigin: 'border-box' } : {}
}
