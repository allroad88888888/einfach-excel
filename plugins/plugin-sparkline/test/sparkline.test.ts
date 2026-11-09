import { DEFAULT_SPARKLINE_SPEC, formatRange, parseRange, parseSparklineSpec, sparklineMarks,
  sparklineSlots } from '../src/core'

const r = (text: string) => parseRange(text)!

describe('sparkline layout', () => {
  it('slices data rows for a vertical location and columns for a horizontal one', () => {
    const vertical = sparklineSlots(r('G2:G4'), r('B2:F4'))
    expect('slots' in vertical && vertical.slots.map((slot) => formatRange(slot.data)))
      .toEqual(['B2:F2', 'B3:F3', 'B4:F4'])
    const horizontal = sparklineSlots(r('B6:D6'), r('B2:D5'))
    expect('slots' in horizontal && horizontal.slots.map((slot) => formatRange(slot.data)))
      .toEqual(['B2:B5', 'C2:C5', 'D2:D5'])
    expect(sparklineSlots(r('G2'), r('B2:F2'))).toMatchObject({ slots: [{ row: 1, col: 6 }] })
  })

  it('rejects mismatched and two-dimensional locations', () => {
    expect(sparklineSlots(r('G2:H3'), r('B2:F3'))).toHaveProperty('error')
    expect(sparklineSlots(r('G2:G3'), r('B2:F5'))).toHaveProperty('error')
    expect(sparklineSlots(r('G2'), r('B2:F3'))).toHaveProperty('error')
  })

  it('parses and formats A1 ranges', () => {
    expect(parseRange('$b$2:$f$2')).toEqual({ startRow: 1, endRow: 1, startCol: 1, endCol: 5 })
    expect(formatRange(r('AA10'))).toBe('AA10')
    expect(parseRange('Sheet2!A1')).toBeNull()
  })
})

describe('sparkline marks', () => {
  it('draws a broken line across empty cells with high and low markers', () => {
    const spec = { ...DEFAULT_SPARKLINE_SPEC, high: true, low: true }
    const marks = sparklineMarks([1, 3, null, 2], spec, 104, 24)
    expect(marks.filter((mark) => mark.kind === 'line')).toHaveLength(2)
    expect(marks.filter((mark) => mark.kind === 'dot')).toHaveLength(2)
  })

  it('draws columns from zero and colors negatives', () => {
    const spec = { ...DEFAULT_SPARKLINE_SPEC, type: 'column' as const, negative: true }
    const marks = sparklineMarks([2, -1], spec, 44, 24)
    expect(marks.map((mark) => mark.kind === 'rect' && mark.color))
      .toEqual(['#376092', '#D00000'])
  })

  it('draws win/loss bars above and below the middle, skipping zeros', () => {
    const spec = { ...DEFAULT_SPARKLINE_SPEC, type: 'winLoss' as const }
    const marks = sparklineMarks([5, 0, -2], spec, 34, 24)
    expect(marks).toHaveLength(2)
    expect(marks[0]).toMatchObject({ kind: 'rect', y: 2 })
    expect(marks[1]).toMatchObject({ kind: 'rect', y: 12 })
  })

  it('falls back to defaults for invalid stored settings', () => {
    expect(parseSparklineSpec({ type: 'pie', color: 'red', high: 'yes', low: true }))
      .toEqual({ ...DEFAULT_SPARKLINE_SPEC, low: true })
  })
})
