/** @jsxImportSource solid-js */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import {
  keyboardModeAtom,
  selectCellAtom,
  setSelectionAtom,
  setSelectionBoundsAtom,
  statusBarAggregateConfigAtom,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetUiProvider } from '../src/provider'
import { SpreadsheetStatusBar } from '../src/status-bar'
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

describe('vNext SpreadsheetStatusBar', () => {
  it('keeps the status bar a pure consumer of the Provider-owned projection bridge', () => {
    const statusBarSource = readFileSync(
      join(process.cwd(), 'excel/solid-excel/src/status-bar/SpreadsheetStatusBar.tsx'),
      'utf8',
    )
    const bridgeSource = readFileSync(
      join(process.cwd(), 'excel/solid-excel/src/provider/status-bar-projection-bridge.ts'),
      'utf8',
    )
    const componentSource = statusBarSource.slice(
      statusBarSource.indexOf('export function SpreadsheetStatusBar'),
    )

    expect(statusBarSource).not.toContain('syncStatusBarProjectionAtom')
    expect(componentSource).not.toContain('createEffect(')
    expect(componentSource).not.toContain('onCleanup(')
    expect(componentSource).not.toContain('useStore(')
    expect(componentSource).not.toContain('store.setter(')
    expect(componentSource).not.toContain('rangesIntersect(')
    expect(componentSource).not.toContain('rangeContains(')
    expect(statusBarSource).not.toContain('statusBarProjectionCellsAtom')
    expect(statusBarSource).not.toContain('statusBarAggregateTruncatedAtom')
    expect(bridgeSource).toContain('store.sub(spreadsheetProjectionSnapshotAtom')
    expect(bridgeSource).toContain('store.setter(syncStatusBarProjectionAtom')
  })

  it('renders one address segment — a single-cell selection is never printed twice', async () => {
    const store = createStore()
    const backend = createFakeBackend()

    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 1, col: 2 } })

    const { container, getByTestId, queryByTestId } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetStatusBar />
      </SpreadsheetUiProvider>
    ))

    expect(getByTestId('status-selection').textContent).toBe('C2')
    // 旧版并排渲染 `status-active-cell` 与 `status-selection`，单格选区下两者逐字相同，
    // 于是状态栏上出现「C2 C2」。活动单元格现在只由公式栏左侧的名称框负责。
    expect(queryByTestId('status-active-cell')).toBeNull()
    expect(container.textContent?.match(/C2/g)).toHaveLength(1)

    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 2, col: 2 }, extend: true })
    await waitFor(() => expect(getByTestId('status-selection').textContent).toBe('C2:C3'))
  })

  it('mounts only selection, aggregates and the mode badge by default', () => {
    const store = createStore()
    const backend = createFakeBackend()

    const { getByTestId, queryByTestId } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetStatusBar />
      </SpreadsheetUiProvider>
    ))

    expect(getByTestId('status-selection')).toBeTruthy()
    expect(getByTestId('status-aggregates')).toBeTruthy()
    expect(getByTestId('status-mode-badge')).toBeTruthy()

    // 缩放与视图模式（普通/分页预览/页面布局）整条线已删除：网格从不读它们的 atom，
    // 点击只会改一个没人看的数字。调试读数迁到了 SpreadsheetDiagnosticsReadout。
    expect(queryByTestId('status-zoom')).toBeNull()
    expect(queryByTestId('status-view-modes')).toBeNull()
    expect(queryByTestId('status-projection')).toBeNull()
    expect(queryByTestId('status-visible-cells')).toBeNull()
    expect(queryByTestId('status-loaded-values')).toBeNull()
    expect(queryByTestId('status-last-command')).toBeNull()
  })

  it('right-clicking the aggregate group opens a checkable picker that survives repeated ticks', async () => {
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

    const { getByRole, getByTestId, queryByTestId } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetStatusBar />
      </SpreadsheetUiProvider>
    ))

    expect(queryByTestId('status-aggregate-menu')).toBeNull()

    fireEvent.contextMenu(getByTestId('status-aggregates'))
    await waitFor(() => expect(getByTestId('status-aggregate-menu')).toBeTruthy())
    expect(getByRole('menu', { name: 'Status bar aggregates' })).toBe(
      getByTestId('status-aggregate-menu'),
    )

    const minItem = getByTestId('status-aggregate-menu-min')
    expect(minItem.getAttribute('role')).toBe('menuitemcheckbox')
    expect(minItem.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(minItem)
    await waitFor(() => expect(store.getter(statusBarAggregateConfigAtom).min).toBe(true))
    expect(minItem.getAttribute('aria-checked')).toBe('true')
    expect(getByTestId('status-aggregate-min-value').textContent).toBe('1')

    // 勾选后菜单保持打开：调整显示项通常连点两三下，每点一次就关掉会逼用户重新右键。
    expect(getByTestId('status-aggregate-menu')).toBeTruthy()
    fireEvent.click(getByTestId('status-aggregate-menu-sum'))
    await waitFor(() => expect(store.getter(statusBarAggregateConfigAtom).sum).toBe(false))
    expect(queryByTestId('status-aggregate-sum-value')).toBeNull()
    expect(store.getter(statusBarAggregateConfigAtom).average).toBe(true)
    expect(store.getter(statusBarAggregateConfigAtom).count).toBe(true)

    fireEvent.keyDown(getByTestId('status-aggregate-menu'), { key: 'Escape' })
    await waitFor(() => expect(queryByTestId('status-aggregate-menu')).toBeNull())
  })

  it('closes the aggregate picker on an outside pointer press', async () => {
    const store = createStore()
    const backend = createFakeBackend()

    const { getByTestId, queryByTestId } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetStatusBar />
      </SpreadsheetUiProvider>
    ))

    fireEvent.contextMenu(getByTestId('status-aggregates'))
    await waitFor(() => expect(getByTestId('status-aggregate-menu')).toBeTruthy())

    fireEvent.mouseDown(document.body)
    await waitFor(() => expect(queryByTestId('status-aggregate-menu')).toBeNull())
  })

  it('localizes the selection, aggregate group and live summary', async () => {
    const store = createStore()
    const backend = createFakeBackend()
    const window = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }

    store.setter(setSelectionBoundsAtom, { rowCount: 1, colCount: 1 })
    store.setter(setSelectionAtom, { kind: 'all', sheetId: 'sheet-1' })
    seedReadyVisibleProjection(store, {
      status: 'ready',
      result: {
        kind: 'visible-window',
        sheetId: 'sheet-1',
        window,
        requestId: 1,
        cells: [numericCell(0, 0, 7)],
      },
    })

    const { getByRole, getByTestId } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetStatusBar />
      </SpreadsheetUiProvider>
    ))

    await waitFor(() => expect(getByTestId('status-selection').textContent).toBe('All'))
    expect(getByRole('group', { name: 'Selection aggregates' })).toBe(
      getByTestId('status-aggregates'),
    )
    expect(getByTestId('status-aggregates').getAttribute('title')).toBe(
      'Right-click to choose which aggregates to show',
    )

    const liveSummary = getByTestId('status-aggregates-summary')
    expect(liveSummary.getAttribute('role')).toBe('status')
    expect(liveSummary.getAttribute('aria-live')).toBe('polite')
    expect(liveSummary.getAttribute('aria-atomic')).toBe('true')
    expect(liveSummary.querySelector('button')).toBeNull()
    expect(liveSummary.textContent).toContain('Selection aggregates: Sum 7')

    setLocale('zh')
    await waitFor(() => expect(getByTestId('status-selection').textContent).toBe('全部'))
    expect(getByTestId('status-aggregates').getAttribute('aria-label')).toBe('选区聚合')
    expect(getByTestId('status-aggregates').getAttribute('title')).toBe('右键选择要显示的聚合项')
    expect(liveSummary.textContent).toContain('选区聚合：求和 7')
  })

  it('mode badge mirrors keyboardModeAtom', async () => {
    const store = createStore()
    const backend = createFakeBackend()

    const { getByTestId } = render(() => (
      <SpreadsheetUiProvider backend={backend} store={store}>
        <SpreadsheetStatusBar />
      </SpreadsheetUiProvider>
    ))

    expect(getByTestId('status-mode-badge').textContent).toBe('Ready')

    store.setter(keyboardModeAtom, 'editing')
    await waitFor(() => expect(getByTestId('status-mode-badge').textContent).toBe('Edit'))
    expect(getByTestId('status-mode-badge').getAttribute('data-mode')).toBe('edit')

    store.setter(keyboardModeAtom, 'formula-reference')
    await waitFor(() => expect(getByTestId('status-mode-badge').textContent).toBe('Point'))

    store.setter(keyboardModeAtom, 'navigation')
    await waitFor(() => expect(getByTestId('status-mode-badge').textContent).toBe('Ready'))
  })
})
