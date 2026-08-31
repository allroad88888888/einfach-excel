/** @jsxImportSource solid-js */

import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, render, waitFor } from '@solidjs/testing-library'
import {
  dispatchToolbarFormatCommandAtom,
  rejectProjectionAtom,
  selectCellAtom,
  setClipboardErrorAtom,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetDiagnosticsReadout } from '../src/diagnostics'
import { SpreadsheetUiProvider } from '../src/provider'
import { setLocale } from '../src/i18n'
import { seedReadyVisibleProjection } from './projection-test-fixture'
import { beginVisibleRefresh, createFakeBackend } from './status-bar-test-fixture'

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
 * 这四个读数从状态栏搬来，testid 原样保留 —— 搬家的是渲染位置，不是读数的含义，
 * 既有 e2e 断言继续成立。
 */
describe('SpreadsheetDiagnosticsReadout', () => {
  it('reports projection status, visible cell count, loaded values and the last command', () => {
    const store = createStore()
    const backend = createFakeBackend()
    const window = { rowStart: 0, rowEnd: 5, colStart: 0, colEnd: 4 }

    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 1, col: 2 } })
    seedReadyVisibleProjection(store, {
      status: 'ready',
      request: { kind: 'visible-window', sheetId: 'sheet-1', window, requestId: 1 },
      result: {
        kind: 'visible-window',
        sheetId: 'sheet-1',
        window,
        requestId: 1,
        cells: [
          { row: 1, col: 2, displayValue: 'C2' },
          { row: 5, col: 4, displayValue: 'E6' },
        ],
      },
    })

    const { getByTestId } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetDiagnosticsReadout />
      </SpreadsheetUiProvider>
    ))

    expect(getByTestId('status-projection').textContent).toBe('Ready')
    expect(getByTestId('status-projection').getAttribute('aria-label')).toBe('Projection status')
    expect(getByTestId('status-visible-cells').textContent).toBe('30 cells')
    expect(getByTestId('status-loaded-values').textContent).toBe('2 loaded')
    expect(getByTestId('status-last-command').textContent).toBe('Ready')
  })

  it('follows the projection through loading and failure', async () => {
    const store = createStore()
    const backend = createFakeBackend()
    const window = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }

    seedReadyVisibleProjection(store, {
      status: 'ready',
      result: {
        kind: 'visible-window',
        sheetId: 'sheet-1',
        window,
        requestId: 1,
        cells: [{ row: 0, col: 0, displayValue: '10' }],
      },
    })

    const { getByTestId } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetDiagnosticsReadout />
      </SpreadsheetUiProvider>
    ))

    await waitFor(() => expect(getByTestId('status-projection').textContent).toBe('Ready'))

    const failedRequest = beginVisibleRefresh(store, window)
    await waitFor(() => expect(getByTestId('status-projection').textContent).toBe('Loading'))

    const rejected = store.setter(rejectProjectionAtom, {
      request: failedRequest,
      error: new Error('refresh failed'),
    })
    expect(rejected.status).toBe('rejected')
    // 错误分支刻意显示后端原文而不是一句通用的「投影错误」：能说出「为什么」的字符串
    // 比一个漂亮的占位更有用。
    await waitFor(() => expect(getByTestId('status-projection').textContent).toBe('refresh failed'))
  })

  it('names the most recent toolbar command and localizes every readout', async () => {
    const store = createStore()
    const backend = createFakeBackend()
    const window = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }

    seedReadyVisibleProjection(store, {
      status: 'ready',
      result: {
        kind: 'visible-window',
        sheetId: 'sheet-1',
        window,
        requestId: 1,
        cells: [{ row: 0, col: 0, displayValue: '7' }],
      },
    })

    const { getByTestId } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetDiagnosticsReadout />
      </SpreadsheetUiProvider>
    ))

    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
    store.setter(dispatchToolbarFormatCommandAtom, { command: 'bold' })
    await waitFor(() => expect(getByTestId('status-last-command').textContent).toBe('Toolbar bold'))

    setLocale('zh')
    await waitFor(() => expect(getByTestId('status-last-command').textContent).toBe('工具栏 bold'))
    expect(getByTestId('status-projection').textContent).toBe('就绪')
    expect(getByTestId('status-projection').getAttribute('aria-label')).toBe('投影状态')
    expect(getByTestId('status-visible-cells').textContent).toBe('1 个单元格')
    expect(getByTestId('status-loaded-values').textContent).toBe('已加载 1 个值')
  })

  it('surfaces the latest clipboard error through the existing command readout', async () => {
    const store = createStore()
    const backend = createFakeBackend()
    const { getByTestId } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetDiagnosticsReadout />
      </SpreadsheetUiProvider>
    ))

    store.setter(setClipboardErrorAtom, {
      code: 'CLIPBOARD_MULTI_REGION_UNSUPPORTED',
      message:
        'Copying multiple selection regions is not supported. Select one region and try again.',
      severity: 'warning',
      source: 'validation',
    })

    await waitFor(() =>
      expect(getByTestId('status-last-command').textContent).toBe(
        'Copying multiple selection regions is not supported. Select one region and try again.',
      ),
    )
  })

  it('stays out of the diagnostics log live region', () => {
    const store = createStore()
    const backend = createFakeBackend()

    const { getByTestId } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetDiagnosticsReadout />
      </SpreadsheetUiProvider>
    ))

    // 每次滚动这些数字都会变。放进 aria-live 区域会让读屏把每一次滚动都念一遍，
    // 所以这里既没有 role="log" 也没有 aria-live —— 需要时用眼睛看。
    const readout = getByTestId('diagnostics-readout')
    expect(readout.getAttribute('aria-live')).toBeNull()
    expect(readout.getAttribute('role')).toBeNull()
  })
})
