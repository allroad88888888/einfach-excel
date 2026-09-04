/** @jsxImportSource solid-js */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createStore } from '@einfach/core'
import { cleanup, render, waitFor } from '@solidjs/testing-library'
import {
  rejectProjectionAtom,
  resolveProjectionAtom,
  selectCellAtom,
  selectionAggregatesAtom,
  statusBarProjectionCellsAtom,
} from '@einfach/spreadsheet-ui-core'
import { spreadsheetProjectionSnapshotAtom, SpreadsheetUiProvider } from '../src/provider'
import { SpreadsheetStatusBar } from '../src/status-bar'
import { setLocale } from '../src/i18n'
import { seedReadyVisibleProjection } from './projection-test-fixture'
import {
  beginVisibleRefresh,
  createFakeBackend,
  numericCell,
  resolveVisibleRefresh,
} from './status-bar-test-fixture'

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
 * 投影刷新期间聚合值必须**保持上一次的可信结果**：加载中和刷新失败都不能把已经算对的
 * 和清成 0 —— 那会让用户以为数据没了。刷新成功才换新值，过期世代一律丢弃。
 */
describe('vNext status bar aggregates across projection refreshes', () => {
  it('refreshes values while loading and error retain the last aggregate', async () => {
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
        cells: [numericCell(0, 0, 10)],
      },
    })

    const { getByTestId } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetStatusBar />
      </SpreadsheetUiProvider>
    ))

    await waitFor(() => expect(getByTestId('status-aggregate-sum-value').textContent).toBe('10'))

    // 投影状态本身由 `SpreadsheetDiagnosticsReadout` 渲染，不在状态栏里；这里断言的是
    // 状态栏**不受**刷新阶段影响 —— 加载中与失败后都还显示上一次算对的和。
    const failedRequest = beginVisibleRefresh(store, window)
    expect(store.getter(spreadsheetProjectionSnapshotAtom).status).toBe('loading')
    expect(getByTestId('status-aggregate-sum-value').textContent).toBe('10')

    const rejected = store.setter(rejectProjectionAtom, {
      request: failedRequest,
      error: new Error('refresh failed'),
    })
    expect(rejected.status).toBe('rejected')
    await waitFor(() =>
      expect(store.getter(spreadsheetProjectionSnapshotAtom).status).toBe('error'),
    )
    expect(getByTestId('status-aggregate-sum-value').textContent).toBe('10')

    const refreshedRequest = beginVisibleRefresh(store, window)
    expect(store.getter(spreadsheetProjectionSnapshotAtom).status).toBe('loading')
    expect(getByTestId('status-aggregate-sum-value').textContent).toBe('10')
    resolveVisibleRefresh(store, refreshedRequest, [numericCell(0, 0, 25)])

    await waitFor(() => expect(getByTestId('status-aggregate-sum-value').textContent).toBe('25'))
    expect(getByTestId('status-aggregate-average-value').textContent).toBe('25')
  })

  it('ignores stale projection generations after a newer aggregate is visible', async () => {
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
        cells: [numericCell(0, 0, 10)],
      },
    })

    const { getByTestId } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetStatusBar />
      </SpreadsheetUiProvider>
    ))
    await waitFor(() => expect(getByTestId('status-aggregate-sum-value').textContent).toBe('10'))

    const staleRequest = beginVisibleRefresh(store, window)
    resolveVisibleRefresh(store, staleRequest, [numericCell(0, 0, 20)])
    const newestRequest = beginVisibleRefresh(store, window)
    resolveVisibleRefresh(store, newestRequest, [numericCell(0, 0, 30)])
    await waitFor(() => expect(getByTestId('status-aggregate-sum-value').textContent).toBe('30'))

    const lateOutcome = store.setter(resolveProjectionAtom, {
      request: staleRequest,
      result: {
        kind: 'visible-window',
        sheetId: staleRequest.sheetId,
        window: staleRequest.window,
        requestId: staleRequest.requestId,
        cells: [numericCell(0, 0, 999)],
      },
    })

    expect(lateOutcome).toEqual({ status: 'ignored', reason: 'stale' })
    expect(getByTestId('status-aggregate-sum-value').textContent).toBe('30')
  })

  it('clears the Core projection mirror when its Provider unmounts and ignores later results', async () => {
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
        cells: [numericCell(0, 0, 10)],
      },
    })

    const rendered = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetStatusBar />
      </SpreadsheetUiProvider>
    ))
    await waitFor(() => expect(store.getter(selectionAggregatesAtom).sum).toBe(10))

    rendered.unmount()
    await waitFor(() => expect(store.getter(statusBarProjectionCellsAtom)).toHaveLength(0))
    expect(store.getter(selectionAggregatesAtom).sum).toBe(0)

    const postUnmountRequest = beginVisibleRefresh(store, window)
    resolveVisibleRefresh(store, postUnmountRequest, [numericCell(0, 0, 99)])
    expect(store.getter(statusBarProjectionCellsAtom)).toHaveLength(0)
    expect(store.getter(selectionAggregatesAtom).sum).toBe(0)
  })

})
