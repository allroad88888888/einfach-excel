import { describe, expect, test } from 'vitest'
import {
  comboSeriesKind, DEFAULT_CHART_SPEC, hasAxes, MAX_CHART_TITLE_CHARS, parseChartSpec,
  supportsStack, type ChartSpec, type ChartType,
} from '../src/core/spec'

const parse = (payload: Record<string, unknown>) => parseChartSpec(payload)

describe('parseChartSpec fallbacks', () => {
  test('a missing, null or non-object payload gives the default spec', () => {
    expect(parseChartSpec(undefined)).toEqual(DEFAULT_CHART_SPEC)
    expect(parseChartSpec(null)).toEqual(DEFAULT_CHART_SPEC)
    expect(parseChartSpec('column')).toEqual(DEFAULT_CHART_SPEC)
    expect(parseChartSpec(42)).toEqual(DEFAULT_CHART_SPEC)
  })

  test('an empty object gives the default spec', () => {
    expect(parseChartSpec({})).toEqual(DEFAULT_CHART_SPEC)
  })

  test('a valid payload round-trips through the parser', () => {
    const spec: ChartSpec = { ...DEFAULT_CHART_SPEC, type: 'combo', title: 'Mix',
      legend: 'top', stack: 'none', yMin: 0, yMax: 10, fontSize: 14, colors: ['#abcdef', null],
      combo: [{ kind: 'column' }, { kind: 'line', secondary: true }], emptyCells: 'connect',
      showHidden: true, seriesIn: 'rows', headerRow: false }
    expect(parseChartSpec(JSON.parse(JSON.stringify(spec)))).toEqual(spec)
  })

  test('each known chart type parses to itself', () => {
    for (const type of ['column', 'bar', 'line', 'area', 'combo', 'pie', 'doughnut', 'scatter']) {
      expect(parse({ type }).type).toBe(type)
    }
  })

  test('an unknown chart type falls back to column', () => {
    expect(parse({ type: 'not-a-chart' }).type).toBe('column')
    expect(parse({ type: 3 }).type).toBe('column')
  })

  test('an unknown legend, stack or empty-cell mode falls back to its default', () => {
    expect(parse({ legend: 'middle' }).legend).toBe('right')
    expect(parse({ stack: 'sideways' }).stack).toBe('none')
    expect(parse({ emptyCells: 'fill' }).emptyCells).toBe('gap')
    expect(parse({ legend: 'bottom', stack: 'percent', emptyCells: 'zero' }))
      .toMatchObject({ legend: 'bottom', stack: 'percent', emptyCells: 'zero' })
  })
})

describe('parseChartSpec text and flags', () => {
  test('a non-string title or axis title becomes empty', () => {
    expect(parse({ title: 42 }).title).toBe('')
    expect(parse({ xTitle: null }).xTitle).toBe('')
    expect(parse({ yTitle: ['x'] }).yTitle).toBe('')
  })

  test('titles are cut to the maximum length', () => {
    expect(parse({ title: 'x'.repeat(MAX_CHART_TITLE_CHARS + 45) }).title)
      .toHaveLength(MAX_CHART_TITLE_CHARS)
  })

  test('seriesIn is rows only when asked for, otherwise columns', () => {
    expect(parse({ seriesIn: 'rows' }).seriesIn).toBe('rows')
    expect(parse({ seriesIn: 'cols' }).seriesIn).toBe('columns')
  })

  test('boolean flags keep their value or fall back when not a boolean', () => {
    expect(parse({ headerRow: false }).headerRow).toBe(false)
    expect(parse({ headerRow: 'no' }).headerRow).toBe(true)
    expect(parse({ headerCol: 0 }).headerCol).toBe(true)
    expect(parse({ dataLabels: 'yes' }).dataLabels).toBe(false)
    expect(parse({ gridlines: false }).gridlines).toBe(false)
    expect(parse({ showHidden: 'true' }).showHidden).toBe(false)
    expect(parse({ showHidden: true }).showHidden).toBe(true)
  })
})

describe('parseChartSpec numeric fields', () => {
  test('font size must be an integer from 8 to 24, otherwise it follows the default', () => {
    expect(parse({ fontSize: 8 }).fontSize).toBe(8)
    expect(parse({ fontSize: 24 }).fontSize).toBe(24)
    expect(parse({ fontSize: 7 }).fontSize).toBeNull()
    expect(parse({ fontSize: 25 }).fontSize).toBeNull()
    expect(parse({ fontSize: 12.5 }).fontSize).toBeNull()
    expect(parse({ fontSize: '12' }).fontSize).toBeNull()
  })

  test('non-finite bounds become automatic', () => {
    expect(parse({ yMin: Number.NaN, yMax: Number.POSITIVE_INFINITY })).toMatchObject({
      yMin: null, yMax: null,
    })
    expect(parse({ yMin: '0' }).yMin).toBeNull()
  })

  test('a maximum at or below the minimum is dropped, a lone maximum is kept', () => {
    expect(parse({ yMin: 10, yMax: 5 })).toMatchObject({ yMin: 10, yMax: null })
    expect(parse({ yMin: 10, yMax: 10 })).toMatchObject({ yMin: 10, yMax: null })
    expect(parse({ yMin: 0, yMax: 100 })).toMatchObject({ yMin: 0, yMax: 100 })
    expect(parse({ yMax: 5 })).toMatchObject({ yMin: null, yMax: 5 })
  })
})

describe('parseChartSpec colours and combo options', () => {
  test('valid hex colours are lower-cased, invalid entries become automatic slots', () => {
    expect(parse({ colors: ['#FF0000', '#abc', 5, '#00ff00', '#zz0000'] }).colors)
      .toEqual(['#ff0000', null, null, '#00ff00', null])
  })

  test('a non-array colour list is empty and only 64 entries are kept', () => {
    expect(parse({ colors: '#ff0000' }).colors).toEqual([])
    expect(parse({ colors: Array.from({ length: 70 }, () => '#000000') }).colors).toHaveLength(64)
  })

  test('combo options keep only valid kinds and boolean secondary flags', () => {
    expect(parse({ combo: [{ kind: 'line', secondary: true }, { kind: 'area', secondary: 'yes' },
      3, null] }).combo).toEqual([{ kind: 'line', secondary: true }, {}, {}, {}])
  })

  test('a non-array combo list is empty', () => {
    expect(parse({ combo: { kind: 'line' } }).combo).toEqual([])
  })
})

describe('comboSeriesKind', () => {
  const spec = (over: Partial<ChartSpec> = {}): ChartSpec =>
    ({ ...DEFAULT_CHART_SPEC, type: 'combo', ...over })

  test('by default the last of several series is a secondary line, the rest are columns', () => {
    expect(comboSeriesKind(spec(), 0, 3)).toEqual({ kind: 'column', secondary: false })
    expect(comboSeriesKind(spec(), 1, 3)).toEqual({ kind: 'column', secondary: false })
    expect(comboSeriesKind(spec(), 2, 3)).toEqual({ kind: 'line', secondary: true })
  })

  test('a single series is a primary column', () => {
    expect(comboSeriesKind(spec(), 0, 1)).toEqual({ kind: 'column', secondary: false })
  })

  test('explicit kind and secondary settings override the defaults independently', () => {
    const combo = spec({ combo: [{ kind: 'line' }, { secondary: true }] })
    expect(comboSeriesKind(combo, 0, 3)).toEqual({ kind: 'line', secondary: false })
    expect(comboSeriesKind(combo, 1, 3)).toEqual({ kind: 'column', secondary: true })
    expect(comboSeriesKind(combo, 2, 3)).toEqual({ kind: 'line', secondary: true })
  })
})

describe('chart type capabilities', () => {
  test('stacking is offered for column, bar, line and area only', () => {
    const stackable: ChartType[] = ['column', 'bar', 'line', 'area']
    const unstackable: ChartType[] = ['pie', 'doughnut', 'scatter', 'combo']
    expect(stackable.every(supportsStack)).toBe(true)
    expect(unstackable.some(supportsStack)).toBe(false)
  })

  test('pie and doughnut have no axes, every other type does', () => {
    expect(hasAxes('pie')).toBe(false)
    expect(hasAxes('doughnut')).toBe(false)
    for (const type of ['column', 'bar', 'line', 'area', 'combo', 'scatter'] as const) {
      expect(hasAxes(type)).toBe(true)
    }
  })
})
