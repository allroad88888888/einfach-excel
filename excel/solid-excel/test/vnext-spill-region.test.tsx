/** @jsxImportSource solid-js */

/**
 * 溢出区在**表格里看得见**（ADR 0006 阶段 3）。
 *
 * 这套件盯的是「UI 对 spill 完全无感」这条缺陷本身，所以三条性质是承重的：
 *
 *   1. 选区落进动态数组 → 区内每一格都带得出身份（锚点 / 投影格），外圈画出蓝框；
 *   2. **选区移出去 → 标记与框都消失**。少了这条，第一条可以靠"永远画"骗过去；
 *   3. 后端没实现 `readSpillRegion` → 一个标记都不出现，也不报错。这是可选端口的
 *      降级契约，静态后端走的就是这条路。
 */

import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, render, waitFor } from '@solidjs/testing-library'
import {
  selectCellAtom,
  type SpreadsheetBackend,
  type SpillRegionRequest,
  type VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetGrid } from '../src-vnext/grid'
import { SpreadsheetUiProvider } from '../src-vnext/provider'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

const viewport = {
  scrollTop: 0,
  scrollLeft: 0,
  viewportHeight: 4,
  viewportWidth: 3,
  rowHeight: 1,
  colWidth: 1,
  rowCount: 4,
  colCount: 3,
  overscanRows: 0,
  overscanCols: 0,
}

/** A1 上一个 `=SEQUENCE(3)`：锚点 (0,0)，溢出到 A1:A3。 */
const SEQUENCE_REGION = {
  anchor: { row: 0, col: 0 },
  range: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 0 },
}

function baseBackend(): SpreadsheetBackend {
  return {
    async readVisibleProjection(request: VisibleProjectionRequest) {
      return {
        kind: 'visible-window' as const,
        sheetId: request.sheetId,
        window: { ...request.window },
        requestId: request.requestId,
        revision: request.revision,
        cells: [
          { row: 0, col: 0, displayValue: '1', formula: '=SEQUENCE(3)' },
          { row: 1, col: 0, displayValue: '2' },
          { row: 2, col: 0, displayValue: '3' },
          { row: 0, col: 1, displayValue: 'plain' },
        ],
      }
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    async setCellInput() {
      throw new Error('not used')
    },
  }
}

/** 建模 A1:A3 那一个数组；请求也记下来，用来盯「滚动不发多余 RPC」。 */
function spillAwareBackend() {
  const seen: SpillRegionRequest[] = []
  const backend: SpreadsheetBackend = {
    ...baseBackend(),
    async readSpillRegion(request) {
      seen.push(request)
      const inside =
        request.col === 0 && request.row >= 0 && request.row <= 2 ? SEQUENCE_REGION : null
      return {
        kind: 'spill-region' as const,
        sheetId: request.sheetId,
        region: inside,
        requestId: request.requestId,
      }
    },
  }
  return { backend, seen }
}

function renderGrid(backend: SpreadsheetBackend) {
  const store = createStore()
  // 用 SVG 覆盖层：jsdom 里没有 canvas 2d context。
  window.history.replaceState(null, '', '/?svgOverlay=1')
  const rendered = render(() => (
    <SpreadsheetUiProvider backend={backend} store={store}>
      <SpreadsheetGrid sheetId="sheet-1" viewport={viewport} />
    </SpreadsheetUiProvider>
  ))
  return { ...rendered, store }
}

function spillRoles(container: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {}
  for (const node of container.querySelectorAll('[data-cell-addr]')) {
    const role = node.getAttribute('data-spill')
    if (role) out[node.getAttribute('data-cell-addr') ?? ''] = role
  }
  return out
}

describe('vNext 溢出区可见性', () => {
  it('选中数组里任一格 → 区内每格带身份、外圈出蓝框；移出去就全部消失', async () => {
    const { backend, seen } = spillAwareBackend()
    const { container, store, queryByTestId } = renderGrid(backend)

    // 初始活动单元格就是 A1（锚点）。
    await waitFor(() => {
      expect(spillRoles(container)).toEqual({ A1: 'anchor', A2: 'projected', A3: 'projected' })
    })
    // 锚点与投影格分得开 —— 这是"这是数组溢出来的"与"这是我打的值"的区别。
    expect(container.querySelectorAll('.cell-spill').length).toBe(3)
    expect(container.querySelectorAll('.cell-spill-anchor').length).toBe(1)
    expect(queryByTestId('svg-overlay-spill-border')).not.toBeNull()

    // 选到区内另一格：同一个数组，标记不变（后端答的是同一个矩形）。
    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 2, col: 0 } })
    await waitFor(() => {
      expect(seen.at(-1)).toMatchObject({ sheetId: 'sheet-1', row: 2, col: 0 })
    })
    expect(spillRoles(container)).toEqual({ A1: 'anchor', A2: 'projected', A3: 'projected' })

    // 选到区外 —— 标记与框必须一起消失，否则第一条断言可以靠"永远画"骗过去。
    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 1 } })
    await waitFor(() => {
      expect(spillRoles(container)).toEqual({})
    })
    expect(queryByTestId('svg-overlay-spill-border')).toBeNull()
  })

  it('同一格重复触发不重复发 RPC —— 滚动重读投影不该刷屏后端', async () => {
    const { backend, seen } = spillAwareBackend()
    const { container, store } = renderGrid(backend)
    await waitFor(() => {
      expect(spillRoles(container)).not.toEqual({})
    })
    const before = seen.length

    // 选回当前活动单元格：selection atom 触发了，但 (表, 行, 列, revision) 没变。
    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
    await Promise.resolve()
    expect(seen.length).toBe(before)
  })

  it('后端没实现端口 → 一个标记都不出现，也不报错（静态后端走的就是这条）', async () => {
    const { container, queryByTestId } = renderGrid(baseBackend())
    await waitFor(() => {
      expect(container.querySelectorAll('[data-cell-addr]').length).toBeGreaterThan(0)
    })
    expect(spillRoles(container)).toEqual({})
    expect(container.querySelectorAll('.cell-spill').length).toBe(0)
    expect(queryByTestId('svg-overlay-spill-border')).toBeNull()
  })
})
