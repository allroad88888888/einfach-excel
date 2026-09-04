import { describe, expect, test } from 'vitest'
import type { DisplayCell } from '../src/backend'
import type { SelectionState } from '../src/selection'
import {
  computeSelectionAggregates,
  STATUS_BAR_AGGREGATE_MEMBERSHIP_CHECKS_MAX,
} from '../src/status-bar'
import { blankCell, numericCell, stringCell } from './fixtures/status-bar-cells'

const DEFAULT_BOUNDS = { rowCount: 100, colCount: 100 }

const SHEET_RANGE_SELECTION: SelectionState = {
  kind: 'range',
  sheetId: 'sheet-1',
  anchor: { row: 0, col: 0 },
  focus: { row: 0, col: 4 },
}

describe('status-bar aggregates', () => {
  test('sum / average / count over a 5-cell numeric range', () => {
    const cells: DisplayCell[] = [
      numericCell(0, 0, 1),
      numericCell(0, 1, 2),
      numericCell(0, 2, 3),
      numericCell(0, 3, 4),
      numericCell(0, 4, 5),
    ]

    const aggregates = computeSelectionAggregates(cells, [SHEET_RANGE_SELECTION], DEFAULT_BOUNDS)

    expect(aggregates.sum).toBe(15)
    expect(aggregates.average).toBe(3)
    expect(aggregates.count).toBe(5)
    expect(aggregates.numericCount).toBe(5)
    expect(aggregates.min).toBe(1)
    expect(aggregates.max).toBe(5)
    expect(aggregates.truncated).toBe(false)
  })

  test('mixed numeric and string cells track count vs numericCount separately', () => {
    const cells: DisplayCell[] = [
      numericCell(0, 0, 1),
      stringCell(0, 1, 'a'),
      numericCell(0, 2, 2),
      stringCell(0, 3, 'b'),
    ]
    const selection: SelectionState = {
      kind: 'range',
      sheetId: 'sheet-1',
      anchor: { row: 0, col: 0 },
      focus: { row: 0, col: 3 },
    }

    const aggregates = computeSelectionAggregates(cells, [selection], DEFAULT_BOUNDS)

    expect(aggregates.sum).toBe(3)
    expect(aggregates.average).toBe(1.5)
    expect(aggregates.count).toBe(4)
    expect(aggregates.numericCount).toBe(2)
    expect(aggregates.min).toBe(1)
    expect(aggregates.max).toBe(2)
  })

  test('formatted displays aggregate canonical raw values and raw wins on conflicts', () => {
    const cells: DisplayCell[] = [
      {
        row: 0,
        col: 0,
        displayValue: '$1,234.50',
        valueKind: 'number',
        numericValue: 1_234.5,
      },
      { row: 0, col: 1, displayValue: '999', valueKind: 'number', numericValue: 2 },
    ]
    const selection: SelectionState = {
      kind: 'range',
      sheetId: 'sheet-1',
      anchor: { row: 0, col: 0 },
      focus: { row: 0, col: 1 },
    }

    expect(computeSelectionAggregates(cells, [selection], DEFAULT_BOUNDS)).toEqual({
      sum: 1_236.5,
      average: 618.25,
      count: 2,
      numericCount: 2,
      min: 2,
      max: 1_234.5,
      truncated: false,
    })
  })

  test('missing or invalid numeric facts never fall back to display text and mark truncation', () => {
    const cells: DisplayCell[] = [
      blankCell(0, 0),
      stringCell(0, 1, 'text'),
      { row: 0, col: 2, displayValue: 'TRUE', valueKind: 'boolean' },
      { row: 0, col: 3, displayValue: '#DIV/0!', valueKind: 'error' },
      { row: 0, col: 4, displayValue: '99', valueKind: 'number' },
      { row: 0, col: 5, displayValue: '100', valueKind: 'number', numericValue: Number.NaN },
      numericCell(0, 6, 3),
    ]
    const selection: SelectionState = {
      kind: 'range',
      sheetId: 'sheet-1',
      anchor: { row: 0, col: 0 },
      focus: { row: 0, col: 6 },
    }

    const aggregates = computeSelectionAggregates(cells, [selection], DEFAULT_BOUNDS)

    expect(aggregates).toMatchObject({
      sum: 3,
      average: 3,
      count: 6,
      numericCount: 1,
      min: 3,
      max: 3,
      truncated: true,
    })
  })

  test('blank cells are ignored from count', () => {
    const cells: DisplayCell[] = [numericCell(0, 0, 10), blankCell(0, 1), blankCell(0, 2)]
    const selection: SelectionState = {
      kind: 'range',
      sheetId: 'sheet-1',
      anchor: { row: 0, col: 0 },
      focus: { row: 0, col: 2 },
    }

    const aggregates = computeSelectionAggregates(cells, [selection], DEFAULT_BOUNDS)

    expect(aggregates.count).toBe(1)
    expect(aggregates.numericCount).toBe(1)
    expect(aggregates.sum).toBe(10)
    expect(aggregates.min).toBe(10)
    expect(aggregates.max).toBe(10)
  })

  test('empty selection returns zeroed aggregates', () => {
    const aggregates = computeSelectionAggregates([], [], DEFAULT_BOUNDS)

    expect(aggregates).toEqual({
      sum: 0,
      average: 0,
      count: 0,
      numericCount: 0,
      min: 0,
      max: 0,
      truncated: false,
    })
  })

  test('selection covering no cells stays at zero', () => {
    const cells: DisplayCell[] = [numericCell(0, 0, 10), numericCell(0, 1, 20)]
    const selection: SelectionState = {
      kind: 'range',
      sheetId: 'sheet-1',
      anchor: { row: 5, col: 5 },
      focus: { row: 5, col: 6 },
    }

    const aggregates = computeSelectionAggregates(cells, [selection], DEFAULT_BOUNDS)

    expect(aggregates.count).toBe(0)
    expect(aggregates.sum).toBe(0)
    expect(aggregates.average).toBe(0)
  })

  test('multi-region selection aggregates across primary regions', () => {
    const cells: DisplayCell[] = [
      numericCell(0, 0, 1),
      numericCell(0, 1, 2),
      numericCell(2, 0, 10),
      numericCell(2, 1, 20),
      numericCell(5, 5, 999),
    ]
    const regions: SelectionState[] = [
      {
        kind: 'range',
        sheetId: 'sheet-1',
        anchor: { row: 0, col: 0 },
        focus: { row: 0, col: 1 },
      },
      {
        kind: 'range',
        sheetId: 'sheet-1',
        anchor: { row: 2, col: 0 },
        focus: { row: 2, col: 1 },
      },
    ]

    const aggregates = computeSelectionAggregates(cells, regions, DEFAULT_BOUNDS)

    expect(aggregates.sum).toBe(33)
    expect(aggregates.count).toBe(4)
    expect(aggregates.numericCount).toBe(4)
    expect(aggregates.min).toBe(1)
    expect(aggregates.max).toBe(20)
  })

  test('overlapping regions count each projected cell only once', () => {
    const cells: DisplayCell[] = [numericCell(0, 0, 1), numericCell(0, 1, 2), numericCell(0, 2, 3)]
    const regions: SelectionState[] = [
      {
        kind: 'range',
        sheetId: 'sheet-1',
        anchor: { row: 0, col: 0 },
        focus: { row: 0, col: 1 },
      },
      {
        kind: 'range',
        sheetId: 'sheet-1',
        anchor: { row: 0, col: 1 },
        focus: { row: 0, col: 2 },
      },
    ]

    expect(computeSelectionAggregates(cells, regions, DEFAULT_BOUNDS)).toMatchObject({
      sum: 6,
      average: 2,
      count: 3,
      numericCount: 3,
      min: 1,
      max: 3,
      truncated: false,
    })
  })

  test('truncated flag propagates from caller', () => {
    const aggregates = computeSelectionAggregates(
      [numericCell(0, 0, 1)],
      [
        {
          kind: 'range',
          sheetId: 'sheet-1',
          anchor: { row: 0, col: 0 },
          focus: { row: 0, col: 0 },
        },
      ],
      DEFAULT_BOUNDS,
      { truncated: true },
    )

    expect(aggregates.truncated).toBe(true)
    expect(aggregates.sum).toBe(1)
  })

  test('fixed membership budget stops before an unbounded multi-region scan', () => {
    const completeCells = STATUS_BAR_AGGREGATE_MEMBERSHIP_CHECKS_MAX / 2
    const cells = Array.from({ length: completeCells + 1 }, (_unused, index) =>
      numericCell(index + 1, 0, 1),
    )
    const regions: SelectionState[] = [
      {
        kind: 'cell',
        sheetId: 'sheet-1',
        anchor: { row: 0, col: 0 },
        focus: { row: 0, col: 0 },
      },
      {
        kind: 'range',
        sheetId: 'sheet-1',
        anchor: { row: 1, col: 0 },
        focus: { row: completeCells + 1, col: 0 },
      },
    ]

    const aggregates = computeSelectionAggregates(cells, regions, {
      rowCount: completeCells + 2,
      colCount: 1,
    })

    expect(aggregates.count).toBe(completeCells)
    expect(aggregates.sum).toBe(completeCells)
    expect(aggregates.truncated).toBe(true)
  })
})
