/** @jsxImportSource solid-js */

/**
 * `SpreadsheetSpillBlockedHint` —— `activeSpillBlockageAtom` 的渲染面。
 *
 * 与 `vnext-diagnostics.test.tsx` 分开：那边测的是**日志流**（逐条可关、会堆叠），
 * 这里测的是**状态**（跟着活动单元格走，移开就没）。两者形状不同，混在一起会让
 * 「不该有 dismiss」这条要求变得看不出来。
 *
 * 四条不能回潮的性质：
 *
 *   1. 有线索就一定看得见 —— 缺了它 `#SPILL!` 又变回一个说不出理由的错误码；
 *   2. 地址按 **A1** 呈现 —— 用户接下来要去名称框里输的就是这个形式，报 `(2,7)`
 *      等于没报；
 *   3. 线索消失时组件跟着消失 —— 挂着上一个锚点的话比不说更糟；
 *   4. 挡路的是另一个数组时，话里得说出「数组」—— 那时指的是那个数组的**锚点**，
 *      而锚点在用户眼里可能是空的，照直说「清掉 H3」会像是提示指错了地方。
 */
import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore, type Store } from '@einfach/core'
import { cleanup, render } from '@solidjs/testing-library'
import {
  refreshSpillRegionAtom,
  clearSpillRegionAtom,
  type SpillRegionPort,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'

import { SpreadsheetUiProvider } from '../src-vnext/provider'
import { SpreadsheetSpillBlockedHint } from '../src-vnext/diagnostics'

afterEach(cleanup)

function createFakeBackend(): SpreadsheetBackend {
  return {
    async readVisibleProjection() {
      throw new Error('not used')
    },
    async readRangeProjection() {
      throw new Error('not used')
    },
    async setCellInput() {
      throw new Error('not used')
    },
  }
}

/** 后端：`H1` 是碰撞态锚点，被 `H3`(row 2, col 7) 挡住。 */
const blockedPort: SpillRegionPort = {
  async readSpillRegion(request) {
    return {
      kind: 'spill-region',
      sheetId: request.sheetId,
      region: null,
      blockedBy: { row: 2, col: 7 },
    }
  },
}

/** 同上，但 `H3` 是**另一个数组的锚点**——文案要换一句说。 */
const blockedByArrayPort: SpillRegionPort = {
  async readSpillRegion(request) {
    return {
      kind: 'spill-region',
      sheetId: request.sheetId,
      region: null,
      blockedBy: { row: 2, col: 7 },
      blockedByArray: true,
    }
  },
}

function mount(store: Store, sheetId?: string) {
  return render(() => (
    <SpreadsheetUiProvider backend={createFakeBackend()} store={store}>
      <SpreadsheetSpillBlockedHint sheetId={sheetId} />
    </SpreadsheetUiProvider>
  ))
}

async function seedBlockage(store: Store, sheetId = 'sheet-1') {
  return store.setter(refreshSpillRegionAtom, {
    source: blockedPort,
    sheetId,
    cell: { row: 0, col: 7 },
  })
}

describe('SpreadsheetSpillBlockedHint', () => {
  it('renders nothing while nothing is blocked', () => {
    const store = createStore()
    const { queryByTestId } = mount(store)
    expect(queryByTestId('spill-blocked-hint')).toBeNull()
  })

  it('names the blocking cell in A1 form instead of leaving #SPILL! unexplained', async () => {
    const store = createStore()
    const { queryByTestId } = mount(store)
    expect(await seedBlockage(store)).toBe('blocked')

    const hint = queryByTestId('spill-blocked-hint')
    expect(hint).not.toBeNull()
    // 锚点 H1、阻塞物 H3 —— 两个都是 A1 形式，(0,7)/(2,7) 泄漏出来这里就红。
    expect(hint?.getAttribute('data-anchor')).toBe('H1')
    expect(hint?.getAttribute('data-blocked-by')).toBe('H3')
    expect(hint?.textContent).toContain('H3')
    // 状态而非日志：没有关闭按钮。
    expect(hint?.querySelector('button')).toBeNull()
  })

  it('says the obstruction is an ARRAY when it is one, not just "clear H3"', async () => {
    const store = createStore()
    const { queryByTestId } = mount(store)
    expect(
      await store.setter(refreshSpillRegionAtom, {
        source: blockedByArrayPort,
        sheetId: 'sheet-1',
        cell: { row: 0, col: 7 },
      }),
    ).toBe('blocked')

    const hint = queryByTestId('spill-blocked-hint')
    expect(hint?.getAttribute('data-blocked-by')).toBe('H3')
    // 换的是**措辞**，指的还是同一格 —— 标志不许把地址也改掉。
    expect(hint).not.toBeNull()
    expect(hint?.hasAttribute('data-blocked-by-array')).toBe(true)
    // H3 那一格在用户眼里可能是空的（数组的内容画在它的投影格上），所以这句话必须
    // 点明「H3 处的**那个数组**」，否则提示看着像指错了地方。两个 locale 各认一段。
    expect(hint?.textContent).toMatch(/处的数组|the array at/)
    expect(hint?.textContent).toContain('H3')
  })

  it('keeps the plain wording when the obstruction is a value the user typed', async () => {
    const store = createStore()
    const { queryByTestId } = mount(store)
    await seedBlockage(store)

    const hint = queryByTestId('spill-blocked-hint')
    expect(hint?.hasAttribute('data-blocked-by-array')).toBe(false)
    expect(hint?.textContent).not.toMatch(/处的数组|the array at/)
  })

  it('disappears when the blockage is cleared', async () => {
    const store = createStore()
    const { queryByTestId } = mount(store)
    await seedBlockage(store)
    expect(queryByTestId('spill-blocked-hint')).not.toBeNull()

    store.setter(clearSpillRegionAtom)
    expect(queryByTestId('spill-blocked-hint')).toBeNull()
  })

  it('stays silent for another sheet than the one the host is showing', async () => {
    const store = createStore()
    const { queryByTestId } = mount(store, 'sheet-2')
    await seedBlockage(store, 'sheet-1')
    expect(queryByTestId('spill-blocked-hint')).toBeNull()
  })
})
