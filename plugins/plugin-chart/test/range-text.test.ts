import { describe, expect, test } from 'vitest'
import {
  formatRangesText, formatRangeText, parseRangesText, parseRangeText, rangeCellCount, toCellRange,
} from '../src/core/range-text'

describe('parseRangeText', () => {
  test('a block reads as top-left to bottom-right, zero-based', () => {
    expect(parseRangeText('B2:D10')).toEqual({ startRow: 1, startCol: 1, endRow: 9, endCol: 3 })
  })

  test('absolute references with dollar signs parse the same way', () => {
    expect(parseRangeText('$B$2:$D$10')).toEqual(parseRangeText('B2:D10'))
    expect(parseRangeText('$b2')).toEqual({ startRow: 1, startCol: 1, endRow: 1, endCol: 1 })
  })

  test('a reversed block is normalised to top-left to bottom-right', () => {
    expect(parseRangeText('D10:B2')).toEqual(parseRangeText('B2:D10'))
  })

  test('a single cell is a one-cell range', () => {
    expect(parseRangeText('C3')).toEqual({ startRow: 2, startCol: 2, endRow: 2, endCol: 2 })
  })

  test('letters are case-insensitive and whitespace around parts is ignored', () => {
    expect(parseRangeText('b2:d10')).toEqual(parseRangeText('B2:D10'))
    expect(parseRangeText(' B2 : D10 ')).toEqual(parseRangeText('B2:D10'))
  })

  test('two-letter columns and the last Excel column and row are in range', () => {
    expect(parseRangeText('AA1')).toEqual({ startRow: 0, startCol: 26, endRow: 0, endCol: 26 })
    expect(parseRangeText('XFD1048576')).toEqual({ startRow: 1048575, startCol: 16383,
      endRow: 1048575, endCol: 16383 })
  })

  test('row 0, rows past 1048576, and columns past XFD are rejected', () => {
    expect(parseRangeText('A0')).toBeNull()
    expect(parseRangeText('A1048577')).toBeNull()
    expect(parseRangeText('XFE1')).toBeNull()
    expect(parseRangeText('A1:B1048577')).toBeNull()
  })

  test('malformed text is rejected', () => {
    for (const text of ['', 'B', '2', '1A', 'A-1', 'AAAA1', 'A12345678', 'A1:', ':B2', 'A1:B2:C3',
      'Sheet1!A1', 'A1 B2', 'A1.5']) {
      expect(parseRangeText(text), text).toBeNull()
    }
  })
})

describe('formatRangeText', () => {
  test('a block formats as A1 text, a single cell without the colon', () => {
    expect(formatRangeText(parseRangeText('B2:D10'))).toBe('B2:D10')
    expect(formatRangeText(parseRangeText('c3'))).toBe('C3')
  })

  test('a missing range formats as #REF!', () => {
    expect(formatRangeText(null)).toBe('#REF!')
    expect(formatRangeText(undefined)).toBe('#REF!')
  })

  test('format and parse round-trip the normalised text', () => {
    expect(formatRangeText(parseRangeText('$D$10:$B$2'))).toBe('B2:D10')
    expect(formatRangeText(parseRangeText('XFD1'))).toBe('XFD1')
  })
})

describe('parseRangesText and formatRangesText', () => {
  test('comma-separated blocks parse in order', () => {
    expect(parseRangesText('A3:A15,C3:C15')).toEqual([parseRangeText('A3:A15')!,
      parseRangeText('C3:C15')!])
  })

  test('whitespace around each block is ignored', () => {
    expect(parseRangesText(' A1 , B2 ')).toEqual([parseRangeText('A1')!, parseRangeText('B2')!])
  })

  test('one bad block makes the whole text invalid', () => {
    expect(parseRangesText('A1,B0')).toBeNull()
    expect(parseRangesText('A1,,B2')).toBeNull()
    expect(parseRangesText('A1,')).toBeNull()
    expect(parseRangesText(',A1')).toBeNull()
    expect(parseRangesText('')).toBeNull()
  })

  test('formatting joins blocks with commas and shows #REF! for a missing one', () => {
    const blocks = parseRangesText('A3:A15,C3:C15')!
    expect(formatRangesText(blocks)).toBe('A3:A15,C3:C15')
    expect(formatRangesText([])).toBe('#REF!')
    expect(formatRangesText([blocks[0]!, null])).toBe('A3:A15,#REF!')
  })
})

describe('range helpers', () => {
  test('rangeCellCount counts rows times columns', () => {
    expect(rangeCellCount(parseRangeText('B2:D10')!)).toBe(27)
    expect(rangeCellCount(parseRangeText('A1')!)).toBe(1)
  })

  test('toCellRange renames the fields to the cell-range shape', () => {
    expect(toCellRange(parseRangeText('B2:D10')!)).toEqual({ rowStart: 1, rowEnd: 9,
      colStart: 1, colEnd: 3 })
  })
})
