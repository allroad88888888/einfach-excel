/** @jsxImportSource solid-js */

/**
 * 选中**投影格**时，公式栏显示的是锚点的公式，而且**不接受输入**（ADR 0006 之后
 * 剩下的最后一块 UI 回填）。
 *
 * 在这之前公式栏落到 `displayValue`，也就是显示那一格**投影出来的值**。Excel 显示
 * 的是锚点的公式，并且置灰 —— 差别不是审美：一旦把 `=SEQUENCE(10)` 显示在一条**可
 * 编辑**的输入框里，用户在里面敲一个字符就会把这条公式提交进**投影格**，按 ADR 0006
 * 的写入语义整个数组当场塌成 `#SPILL!`。所以「显示」和「只读」必须同一批落地，
 * 单独做前者比不做更危险。
 *
 * 四条不能回潮的性质：
 *
 *   1. 投影格显示的是**锚点的公式**，不是自己的投影值；
 *   2. 那条输入框**只读** —— 少了这条，第 1 条就是个陷阱；
 *   3. **锚点自己照常可编辑** —— 把锚点也置灰等于让用户永远改不了这个数组；
 *   4. 只读态**让位给编辑会话**：往投影格里直接打字是 Excel 允许的操作（数组塌成
 *      `#SPILL!`），只读态不许把它一起禁掉。这条是只读态与 editing 状态机的边界。
 */

import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore } from '@einfach/core'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import {
  editingSessionAtom,
  selectCellAtom,
  startEditingAtom,
  type SpreadsheetBackend,
  type VisibleProjectionRequest,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetFormulaBar } from '../src-vnext/formula-bar'
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

const ANCHOR_FORMULA = '=SEQUENCE(3)'

/** A1 上一个 `=SEQUENCE(3)`：锚点 (0,0)，溢出到 A1:A3。 */
const SEQUENCE_REGION = {
  anchor: { row: 0, col: 0 },
  range: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 0 },
}

/**
 * `anchorFormula` 传 `null` 就是「后端答不出」那条降级路径（老 wasm-pkg、手写
 * 替身），用来盯第 5 条性质：答不出时公式栏必须退回原行为，而不是变成一条空的
 * 只读框。
 *
 * 用 `null` 而不是 `undefined` 表达「答不出」：显式传 `undefined` 会触发默认参数，
 * 于是降级用例悄悄跑成了正常用例（写这条测试时真踩了一次）。
 */
function spillBackend(anchorFormula: string | null = ANCHOR_FORMULA) {
  const writes: string[] = []
  const backend: SpreadsheetBackend = {
    async readVisibleProjection(request: VisibleProjectionRequest) {
      return {
        kind: 'visible-window' as const,
        sheetId: request.sheetId,
        window: { ...request.window },
        requestId: request.requestId,
        revision: request.revision,
        cells: [
          // 锚点带着自己的公式；两个投影格只有值 —— 它们没有自己的公式，这正是
          // 公式栏原先会掉到 `displayValue` 的原因。
          { row: 0, col: 0, displayValue: '1', formula: ANCHOR_FORMULA },
          { row: 1, col: 0, displayValue: '2' },
          { row: 2, col: 0, displayValue: '3' },
          { row: 0, col: 1, displayValue: 'plain' },
        ],
      }
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    async setCellInput(request) {
      writes.push(String(request.input))
      return { ok: true as const, sheetId: request.sheetId, revision: 1 }
    },
    async readSpillRegion(request) {
      const inside =
        request.col === 0 && request.row >= 0 && request.row <= 2 ? SEQUENCE_REGION : null
      return {
        kind: 'spill-region' as const,
        sheetId: request.sheetId,
        region: inside,
        anchorFormula: inside && anchorFormula !== null ? anchorFormula : undefined,
        requestId: request.requestId,
      }
    },
  }
  return { backend, writes }
}

function mount(backend: SpreadsheetBackend) {
  const store = createStore()
  // 用 SVG 覆盖层：jsdom 里没有 canvas 2d context。
  window.history.replaceState(null, '', '/?svgOverlay=1')
  const rendered = render(() => (
    <SpreadsheetUiProvider backend={backend} store={store}>
      <SpreadsheetGrid sheetId="sheet-1" viewport={viewport} />
      <SpreadsheetFormulaBar />
    </SpreadsheetUiProvider>
  ))
  const input = () => rendered.getByTestId('formula-bar-input') as HTMLInputElement
  return { ...rendered, store, input }
}

function selectCell(store: ReturnType<typeof createStore>, row: number, col: number) {
  store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row, col } })
}

describe('vNext 公式栏 —— 投影格上的只读锚点公式', () => {
  it('投影格显示锚点公式且只读；锚点自己显示同一条但可编辑', async () => {
    const { backend } = spillBackend()
    const { store, input } = mount(backend)

    // 初始活动单元格是 A1 —— 锚点。它是那条公式的主人，照常可编辑。
    await waitFor(() => expect(input().value).toBe(ANCHOR_FORMULA))
    expect(input().readOnly).toBe(false)
    expect(input().getAttribute('data-spill-readonly')).toBeNull()

    // A2 是投影格：显示的必须是**锚点的**公式，而不是它自己的投影值 `2`。
    selectCell(store, 1, 0)
    await waitFor(() => expect(input().getAttribute('data-spill-readonly')).toBe('true'))
    expect(input().value).toBe(ANCHOR_FORMULA)
    expect(input().readOnly).toBe(true)
    // 「主人在哪」用 A1 形式说出来 —— 用户接下来要去改的就是这一格。
    expect(input().getAttribute('data-spill-anchor')).toBe('A1')
    expect(input().getAttribute('aria-readonly')).toBe('true')

    // 移出溢出区：只读态必须跟着消失，否则第 2 条可以靠"永远只读"骗过去。
    selectCell(store, 0, 1)
    await waitFor(() => expect(input().value).toBe('plain'))
    expect(input().readOnly).toBe(false)
    expect(input().getAttribute('data-spill-anchor')).toBeNull()
  })

  it('在只读公式栏里敲字符：不开编辑会话、不写后端、显示不变', async () => {
    const { backend, writes } = spillBackend()
    const { store, input } = mount(backend)

    selectCell(store, 1, 0)
    await waitFor(() => expect(input().readOnly).toBe(true))

    // 这就是那个真坑：这一下如果被当成输入，提交的会是 `=SEQUENCE(3)` 写进 A2，
    // 整个数组当场塌成 `#SPILL!`。
    fireEvent.input(input(), { target: { value: '=SEQUENCE(3)x' } })
    fireEvent.keyDown(input(), { key: 'Enter' })
    await Promise.resolve()

    expect(store.getter(editingSessionAtom).status).not.toBe('drafting')
    expect(writes).toEqual([])
    expect(input().value).toBe(ANCHOR_FORMULA)
    expect(input().readOnly).toBe(true)
  })

  it('单元格里直接开编辑会话 → 只读态让位（往溢出区写入是 Excel 允许的）', async () => {
    const { backend } = spillBackend()
    const { store, input } = mount(backend)

    selectCell(store, 1, 0)
    await waitFor(() => expect(input().readOnly).toBe(true))

    // 用户在 A2 上直接开始打字（F2 / 双击 / 键入都走 `startEditingAtom`）。
    store.setter(startEditingAtom, {
      sheetId: 'sheet-1',
      cell: { row: 1, col: 0 },
      draft: '9',
      source: 'cell',
    })

    // 只读态是**显示层**的事实，编辑会话一开它就退场：公式栏改为镜像草稿并恢复
    // 可编辑。少了这条，只读态会把 ADR 0006 明确允许的写入路径一起禁掉。
    await waitFor(() => expect(input().readOnly).toBe(false))
    expect(input().value).toBe('9')
    expect(input().getAttribute('data-spill-readonly')).toBeNull()
  })

  it('后端答不出锚点公式 → 退回原行为：显示投影值、可编辑', async () => {
    const { backend } = spillBackend(null)
    const { store, input } = mount(backend)

    selectCell(store, 1, 0)
    // 蓝框照画（区域还在），但公式栏不装作知道那条公式。
    await waitFor(() => expect(input().value).toBe('2'))
    expect(input().readOnly).toBe(false)
    expect(input().getAttribute('data-spill-readonly')).toBeNull()
  })
})
