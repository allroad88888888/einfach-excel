import { describe, expect, it } from 'vitest'
import type { VisibleProjectionResult } from '../src/backend'
import { getSourceTextFromProjection } from '../src/projection/editable-source-text'

const projection: VisibleProjectionResult = {
  kind: 'visible-window',
  sheetId: 'sheet-1',
  requestId: 1,
  window: { rowStart: 1, rowEnd: 2, colStart: 3, colEnd: 4 },
  cells: [{ row: 1, col: 3, displayValue: '12', formula: '=A1+B1' }],
}

describe('editable projection source text', () => {
  it('prefers formulas, supports empty projected cells, and rejects unrelated coordinates', () => {
    expect(getSourceTextFromProjection(projection, { row: 1, col: 3 }, 'sheet-1')).toBe('=A1+B1')
    expect(getSourceTextFromProjection(projection, { row: 2, col: 4 }, 'sheet-1')).toBe('')
    expect(getSourceTextFromProjection(projection, { row: 0, col: 3 }, 'sheet-1')).toBeUndefined()
    expect(getSourceTextFromProjection(projection, { row: 1, col: 3 }, 'sheet-2')).toBeUndefined()
  })
})
