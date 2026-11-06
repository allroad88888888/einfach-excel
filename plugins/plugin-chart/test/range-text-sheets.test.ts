import { describe, expect, test } from 'vitest'
import {
  formatRangesText, formatRangeText, parseRangesText, parseRangeText, type SheetDirectory,
} from '../src/core/range-text'

const directory: SheetDirectory = { ownerId: 'main', sheets: [
  { id: 'main', name: 'Sheet1' }, { id: 'data', name: 'Data' },
  { id: 'q', name: 'Q1, 2026' }, { id: 'it', name: "It's" },
] }
const cells = { startRow: 0, startCol: 0, endRow: 4, endCol: 1 }

describe('sheet-qualified ranges', () => {
  test('a sheet name resolves to its id, case-insensitively and with quotes', () => {
    expect(parseRangeText('Data!A1:B5', directory)).toEqual({ ...cells, sheetId: 'data' })
    expect(parseRangeText('data!$A$1:$B$5', directory)).toEqual({ ...cells, sheetId: 'data' })
    expect(parseRangeText("'It''s'!A1:B5", directory)).toEqual({ ...cells, sheetId: 'it' })
  })

  test('the chart sheet itself is stored without a sheet id', () => {
    expect(parseRangeText('Sheet1!A1:B5', directory)).toEqual(cells)
  })

  test('an unknown sheet, or a name without a directory, is invalid', () => {
    expect(parseRangeText('Missing!A1:B5', directory)).toBeNull()
    expect(parseRangeText('Data!A1:B5')).toBeNull()
    expect(parseRangeText('Data!', directory)).toBeNull()
  })

  test('areas split on commas outside quoted sheet names', () => {
    expect(parseRangesText("'Q1, 2026'!A1:A5,Data!C1:C5", directory)).toEqual([
      { startRow: 0, startCol: 0, endRow: 4, endCol: 0, sheetId: 'q' },
      { startRow: 0, startCol: 2, endRow: 4, endCol: 2, sheetId: 'data' },
    ])
  })

  test('formatting names other sheets, quoting when needed, and omits the chart sheet', () => {
    expect(formatRangeText({ ...cells, sheetId: 'data' }, directory)).toBe('Data!A1:B5')
    expect(formatRangeText({ ...cells, sheetId: 'q' }, directory)).toBe("'Q1, 2026'!A1:B5")
    expect(formatRangeText({ ...cells, sheetId: 'it' }, directory)).toBe("'It''s'!A1:B5")
    expect(formatRangeText({ ...cells, sheetId: 'main' }, directory)).toBe('A1:B5')
    expect(formatRangesText([cells, { ...cells, sheetId: 'data' }], directory))
      .toBe('A1:B5,Data!A1:B5')
  })

  test('a range on a deleted sheet formats as #REF!', () => {
    expect(formatRangeText({ ...cells, sheetId: 'gone' }, directory)).toBe('#REF!')
  })

  test('parse and format round-trip', () => {
    for (const text of ["'Q1, 2026'!A1:A5,Data!C1:C5", 'A1:B5', "'It''s'!B2"])
      expect(formatRangesText(parseRangesText(text, directory)!, directory)).toBe(text)
  })
})
