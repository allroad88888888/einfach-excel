/** @jsxImportSource solid-js */

import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, render, waitFor } from '@solidjs/testing-library'
import {
  selectCellAtom,
  setSelectionAtom,
  setSelectionBoundsAtom,
  setStatusBarAggregateConfigAtom,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetUiProvider } from '../src-vnext/provider'
import { SpreadsheetStatusBar } from '../src-vnext/status-bar'
import { setLocale } from '../src/i18n'
import { seedReadyVisibleProjection } from './projection-test-fixture'
import { createFakeBackend, numericCell } from './status-bar-test-fixture'

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

/**
 * 状态栏承认「这个和不完整」的四条来路：选区超出可见投影窗口、后端上报 upstream 截断、
 * 选区与投影不在同一张表、以及一项聚合都没勾。宁可显示「结果不完整」，也不要静默给出
 * 一个看起来正常的错数字。
 */
describe('vNext status bar aggregate truncation disclosure', () => {
  it('marks a selection outside the visible result window as truncated', async () => {
    const store = createStore()
    const backend = createFakeBackend()
    const window = { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 4 }

    store.setter(setSelectionBoundsAtom, { rowCount: 20, colCount: 20 })
    store.setter(setSelectionAtom, {
      kind: 'range',
      sheetId: 'sheet-1',
      anchor: { row: 10, col: 0 },
      focus: { row: 11, col: 0 },
    })
    seedReadyVisibleProjection(store, {
      status: 'ready',
      result: {
        kind: 'visible-window',
        sheetId: 'sheet-1',
        window,
        requestId: 1,
        cells: [numericCell(0, 0, 9)],
      },
    })

    const { getByTestId } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetStatusBar />
      </SpreadsheetUiProvider>
    ))

    await waitFor(() =>
      expect(getByTestId('status-aggregates').getAttribute('data-truncated')).toBe('true'),
    )
    expect(getByTestId('status-aggregate-sum-value').textContent).toBe('0')
    expect(getByTestId('status-aggregate-count-value').textContent).toBe('0')
  })

  it('forwards upstream backend truncation without recomputing it in Solid', async () => {
    const store = createStore()
    const backend = createFakeBackend()
    const window = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }

    store.setter(selectCellAtom, {
      sheetId: 'sheet-1',
      coord: { row: 0, col: 0 },
    })
    seedReadyVisibleProjection(store, {
      status: 'ready',
      result: {
        kind: 'visible-window',
        sheetId: 'sheet-1',
        window,
        requestId: 1,
        cells: [numericCell(0, 0, 4)],
        truncated: true,
      },
    })

    const { getByTestId } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetStatusBar />
      </SpreadsheetUiProvider>
    ))

    await waitFor(() =>
      expect(getByTestId('status-aggregates').getAttribute('data-truncated')).toBe('true'),
    )
    expect(getByTestId('status-aggregate-sum-value').textContent).toBe('4')
  })

  it('suppresses stale cells when result and selection sheets differ', async () => {
    const store = createStore()
    const backend = createFakeBackend()
    const window = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }

    store.setter(selectCellAtom, {
      sheetId: 'sheet-1',
      coord: { row: 0, col: 0 },
    })
    seedReadyVisibleProjection(store, {
      status: 'ready',
      result: {
        kind: 'visible-window',
        sheetId: 'sheet-2',
        window,
        requestId: 1,
        cells: [numericCell(0, 0, 99)],
      },
    })

    const { getByTestId } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetStatusBar />
      </SpreadsheetUiProvider>
    ))

    await waitFor(() =>
      expect(getByTestId('status-aggregates').getAttribute('data-truncated')).toBe('true'),
    )
    expect(getByTestId('status-aggregate-sum-value').textContent).toBe('0')
    expect(getByTestId('status-aggregate-count-value').textContent).toBe('0')
  })

  it('shows localized empty and truncated aggregate notices in visible and live text', async () => {
    const store = createStore()
    const backend = createFakeBackend()
    const window = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }

    store.setter(selectCellAtom, {
      sheetId: 'sheet-1',
      coord: { row: 0, col: 0 },
    })
    store.setter(setStatusBarAggregateConfigAtom, {
      sum: false,
      average: false,
      count: false,
      numericCount: false,
      min: false,
      max: false,
    })
    seedReadyVisibleProjection(store, {
      status: 'ready',
      result: {
        kind: 'visible-window',
        sheetId: 'sheet-1',
        window,
        requestId: 1,
        cells: [numericCell(0, 0, 7)],
        truncated: true,
      },
    })

    const { getByTestId } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetStatusBar />
      </SpreadsheetUiProvider>
    ))

    await waitFor(() =>
      expect(getByTestId('status-aggregates').getAttribute('data-truncated')).toBe('true'),
    )
    expect(getByTestId('status-aggregates-empty').textContent).toBe('No aggregates')
    expect(getByTestId('status-aggregates-truncated').textContent).toBe('Partial results')
    expect(getByTestId('status-aggregates-summary').textContent).toBe(
      'Selection aggregates: none. Results are truncated.',
    )

    setLocale('zh')
    await waitFor(() => expect(getByTestId('status-aggregates-empty').textContent).toBe('无聚合项'))
    expect(getByTestId('status-aggregates-truncated').textContent).toBe('结果不完整')
    expect(getByTestId('status-aggregates-summary').textContent).toBe('选区聚合：无。结果不完整。')
  })
})

