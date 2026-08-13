import { describe, expect, test } from '@jest/globals'
import { getColumnLabel, getWindowIndexes, isCoordInsideRange, keyFor, toA1 } from '../src/shared'

describe('grid coordinate helpers', () => {
  test('creates stable keys and spreadsheet addresses', () => {
    expect(keyFor(4, 27)).toBe('4:27')
    expect(getColumnLabel(27)).toBe('AB')
    expect(toA1(4, 27)).toBe('AB5')
  })

  test('enumerates a closed grid window without inverted indexes', () => {
    expect(getWindowIndexes(2, 4)).toEqual([2, 3, 4])
    expect(getWindowIndexes(4, 2)).toEqual([])
  })

  test('includes the edges of a grid range', () => {
    const range = { rowStart: 2, rowEnd: 4, colStart: 3, colEnd: 5 }

    expect(isCoordInsideRange(2, 3, range)).toBe(true)
    expect(isCoordInsideRange(4, 5, range)).toBe(true)
    expect(isCoordInsideRange(5, 5, range)).toBe(false)
  })
})
