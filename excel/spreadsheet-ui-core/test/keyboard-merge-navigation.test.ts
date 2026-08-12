import { describe, expect, test } from '@jest/globals'
import {
  getKeyboardCommandIntent,
  type KeyboardCommandState,
  type MoveSelectionIntent,
} from '../src/keyboard'

const merge = { rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 }

function getMoveIntent(key: string, activeCell: { row: number; col: number }): MoveSelectionIntent {
  const intent = getKeyboardCommandIntent(
    {
      key,
      resolveMergeRange: (row, col) =>
        row >= merge.rowStart && row <= merge.rowEnd && col >= merge.colStart && col <= merge.colEnd
          ? merge
          : null,
    },
    {
      mode: 'navigation',
      bounds: { rowCount: 6, colCount: 6 },
      selection: {
        kind: 'cell',
        sheetId: 'sheet-1',
        anchor: activeCell,
        focus: activeCell,
      },
    } satisfies KeyboardCommandState,
  )
  if (intent.type !== 'selection.move') throw new Error('Expected a movement intent')
  return intent
}

describe('keyboard merged-cell navigation', () => {
  test('enters a merge at its anchor and leaves it in one plain-arrow press', () => {
    expect(getMoveIntent('ArrowLeft', { row: 1, col: 3 }).to).toEqual({ row: 1, col: 1 })
    expect(getMoveIntent('ArrowRight', { row: 1, col: 1 }).to).toEqual({ row: 1, col: 3 })
    expect(getMoveIntent('ArrowDown', { row: 1, col: 1 }).to).toEqual({ row: 3, col: 1 })
  })

  test('normalizes a covered historical focus before navigating', () => {
    const intent = getKeyboardCommandIntent(
      {
        key: 'ArrowLeft',
        resolveMergeRange: (row, col) => (row === 2 && col === 2 ? merge : null),
      },
      {
        mode: 'navigation',
        bounds: { rowCount: 6, colCount: 6 },
        selection: {
          kind: 'range',
          sheetId: 'sheet-1',
          anchor: { row: 1, col: 1 },
          focus: { row: 2, col: 2 },
        },
      },
    )

    expect(intent).toMatchObject({ type: 'selection.move', to: { row: 1, col: 0 } })
  })
})
