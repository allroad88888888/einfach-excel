/** @jsxImportSource solid-js */

import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, render, waitFor } from '@solidjs/testing-library'
import {
  setSelectionAtom,
  setSelectionBoundsAtom,
  setStatusBarAggregateConfigAtom,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetUiProvider } from '../src/provider'
import { SpreadsheetStatusBar } from '../src/status-bar'
import { setLocale } from '../src/i18n'
import { seedReadyVisibleProjection } from './projection-test-fixture'
import { createFakeBackend, numericCell } from './status-bar-test-fixture'

// Status bar tests assert on English labels; pin the locale so the default
// (currently 'zh') doesn't break textContent comparisons.
beforeAll(() => {
  setLocale('en')
})
afterAll(() => {
  setLocale('en')
})

afterEach(() => {
  cleanup()
  setLocale('en')
})

describe('vNext status bar aggregates', () => {
  it('renders only the enabled aggregates, never a placeholder for the disabled ones', async () => {
    const store = createStore()
    const backend = createFakeBackend()
    const window = { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 4 }

    store.setter(setSelectionBoundsAtom, { rowCount: 100, colCount: 100 })
    store.setter(setSelectionAtom, {
      kind: 'range',
      sheetId: 'sheet-1',
      anchor: { row: 0, col: 0 },
      focus: { row: 0, col: 4 },
    })
    seedReadyVisibleProjection(store, {
      status: 'ready',
      result: {
        kind: 'visible-window',
        sheetId: 'sheet-1',
        window,
        requestId: 1,
        cells: [
          numericCell(0, 0, 1),
          numericCell(0, 1, 2),
          numericCell(0, 2, 3),
          numericCell(0, 3, 4),
          numericCell(0, 4, 5),
        ],
      },
    })

    const { getByTestId, queryByTestId } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetStatusBar />
      </SpreadsheetUiProvider>
    ))

    await waitFor(() => expect(getByTestId('status-aggregate-sum-value').textContent).toBe('15'))
    expect(getByTestId('status-aggregate-average-value').textContent).toBe('3')
    expect(getByTestId('status-aggregate-count-value').textContent).toBe('5')
    expect(getByTestId('status-aggregates').getAttribute('data-truncated')).toBe('false')

    // 关掉的三项**整个不渲染**，而不是渲染一个只有标签的空壳 —— 后者正是旧状态栏
    // 里「数值计数 最小值 最大值」三个占位按钮的来源。
    expect(queryByTestId('status-aggregate-min')).toBeNull()
    expect(queryByTestId('status-aggregate-max')).toBeNull()
    expect(queryByTestId('status-aggregate-numericCount')).toBeNull()

    store.setter(setStatusBarAggregateConfigAtom, {
      sum: true,
      average: true,
      count: true,
      numericCount: false,
      min: true,
      max: false,
    })
    await waitFor(() => expect(getByTestId('status-aggregate-min-value').textContent).toBe('1'))
    expect(queryByTestId('status-aggregate-max')).toBeNull()
  })

  it('aggregates mixed numeric and string cells correctly', async () => {
    const store = createStore()
    const backend = createFakeBackend()
    const window = { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 4 }

    store.setter(setSelectionAtom, {
      kind: 'range',
      sheetId: 'sheet-1',
      anchor: { row: 0, col: 0 },
      focus: { row: 0, col: 3 },
    })
    seedReadyVisibleProjection(store, {
      status: 'ready',
      result: {
        kind: 'visible-window',
        sheetId: 'sheet-1',
        window,
        requestId: 1,
        cells: [
          numericCell(0, 0, 1),
          { row: 0, col: 1, displayValue: 'a', valueKind: 'string' },
          numericCell(0, 2, 2),
          { row: 0, col: 3, displayValue: 'b', valueKind: 'string' },
        ],
      },
    })
    // Enable numericCount badge for this assertion.
    store.setter(setStatusBarAggregateConfigAtom, {
      sum: true,
      average: true,
      count: true,
      numericCount: true,
      min: false,
      max: false,
    })

    const { getByTestId } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetStatusBar />
      </SpreadsheetUiProvider>
    ))

    await waitFor(() => expect(getByTestId('status-aggregate-sum-value').textContent).toBe('3'))
    expect(getByTestId('status-aggregate-average-value').textContent).toBe('1.5')
    expect(getByTestId('status-aggregate-count-value').textContent).toBe('4')
    expect(getByTestId('status-aggregate-numericCount-value').textContent).toBe('2')
  })

  it('aggregate values round to 2 decimal places (Excel-standard)', async () => {
    const store = createStore()
    const backend = createFakeBackend()
    const window = { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 4 }

    // Values 120, 180, 240 -> avg=180 (integer, no decimals).
    seedReadyVisibleProjection(store, {
      status: 'ready',
      result: {
        kind: 'visible-window',
        sheetId: 'sheet-1',
        window,
        requestId: 1,
        cells: [numericCell(0, 0, 120), numericCell(1, 0, 180), numericCell(2, 0, 240)],
      },
    })
    store.setter(setSelectionAtom, {
      kind: 'range',
      sheetId: 'sheet-1',
      anchor: { row: 0, col: 0 },
      focus: { row: 2, col: 0 },
    })

    const { getByTestId } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetStatusBar />
      </SpreadsheetUiProvider>
    ))

    await waitFor(() =>
      expect(getByTestId('status-aggregate-average-value').textContent).toBe('180'),
    )
  })

  it('aggregate average rounds 1.234 + 1.567 to two decimals (1.4)', async () => {
    const store = createStore()
    const backend = createFakeBackend()
    const window = { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 4 }

    seedReadyVisibleProjection(store, {
      status: 'ready',
      result: {
        kind: 'visible-window',
        sheetId: 'sheet-1',
        window,
        requestId: 1,
        cells: [numericCell(0, 0, 1.234), numericCell(1, 0, 1.567)],
      },
    })
    store.setter(setSelectionAtom, {
      kind: 'range',
      sheetId: 'sheet-1',
      anchor: { row: 0, col: 0 },
      focus: { row: 1, col: 0 },
    })

    const { getByTestId } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetStatusBar />
      </SpreadsheetUiProvider>
    ))

    await waitFor(() =>
      expect(getByTestId('status-aggregate-average-value').textContent).toBe('1.4'),
    )
  })

  it('aggregate average of a repeating decimal rounds to 2 decimals', async () => {
    const store = createStore()
    const backend = createFakeBackend()
    const window = { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 }

    seedReadyVisibleProjection(store, {
      status: 'ready',
      result: {
        kind: 'visible-window',
        sheetId: 'sheet-1',
        window,
        requestId: 1,
        cells: [numericCell(0, 0, 1), numericCell(1, 0, 2), numericCell(2, 0, 4)],
      },
    })
    store.setter(setSelectionAtom, {
      kind: 'range',
      sheetId: 'sheet-1',
      anchor: { row: 0, col: 0 },
      focus: { row: 2, col: 0 },
    })

    const { getByTestId } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetStatusBar />
      </SpreadsheetUiProvider>
    ))

    // (1+2+4)/3 = 2.333..., formatted to "2.33"
    await waitFor(() =>
      expect(getByTestId('status-aggregate-average-value').textContent).toBe('2.33'),
    )
  })

  it('aggregates respond to selection changes', async () => {
    const store = createStore()
    const backend = createFakeBackend()
    const window = { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 4 }

    seedReadyVisibleProjection(store, {
      status: 'ready',
      result: {
        kind: 'visible-window',
        sheetId: 'sheet-1',
        window,
        requestId: 1,
        cells: [numericCell(0, 0, 10), numericCell(1, 0, 20), numericCell(2, 0, 30)],
      },
    })

    store.setter(setSelectionAtom, {
      kind: 'cell',
      sheetId: 'sheet-1',
      anchor: { row: 0, col: 0 },
      focus: { row: 0, col: 0 },
    })

    const { getByTestId } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetStatusBar />
      </SpreadsheetUiProvider>
    ))

    await waitFor(() => expect(getByTestId('status-aggregate-sum-value').textContent).toBe('10'))

    store.setter(setSelectionAtom, {
      kind: 'range',
      sheetId: 'sheet-1',
      anchor: { row: 0, col: 0 },
      focus: { row: 2, col: 0 },
    })

    await waitFor(() => expect(getByTestId('status-aggregate-sum-value').textContent).toBe('60'))
    expect(getByTestId('status-aggregate-average-value').textContent).toBe('20')
  })

})
