/** @jsxImportSource solid-js */

/**
 * `SpreadsheetDiagnostics` —— `diagnosticsAtom` 的渲染面。
 *
 * 这个组件存在的理由本身就是一条缺陷：UI core 一侧的诊断长期**只进不出**
 * （mutation gateway 灌入、码表齐全、单测齐全，但 solid-excel 侧零消费者），
 * 于是"改一个受保护的单元格"在用户眼里就是"什么也没发生"。
 *
 * 所以本套件的重点不在样式，而在三条**不能回潮**的性质：
 *
 *   1. 有诊断就一定看得见（这是缺陷本身）；
 *   2. **没有 i18n 映射的码也必须看得见** —— 回落到 core 的英文 message。
 *      静默吞掉一条陌生码 = 把同一个缺陷换个地方重演；
 *   3. 关闭动作真的把它从 store 里拿掉，而不只是从视图里藏掉。
 */
import { afterEach, describe, expect, it } from '@jest/globals'
import { createStore, type Store } from '@einfach/core'
import { cleanup, render } from '@solidjs/testing-library'
import {
  appendDiagnosticsAtom,
  createSpreadsheetDiagnostic,
  diagnosticsAtom,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'

import { SpreadsheetUiProvider } from '../src-vnext/provider'
import { SpreadsheetDiagnostics } from '../src-vnext/diagnostics'

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

function mount(store: Store, maxVisible?: number) {
  return render(() => (
    <SpreadsheetUiProvider backend={createFakeBackend()} store={store}>
      <SpreadsheetDiagnostics maxVisible={maxVisible} />
    </SpreadsheetUiProvider>
  ))
}

const blockedByProtection = createSpreadsheetDiagnostic({
  severity: 'error',
  source: 'operations',
  code: 'MUTATION_BLOCKED_LOCKED',
  message: 'Cell is locked',
})

describe('SpreadsheetDiagnostics', () => {
  it('renders nothing while there are no diagnostics', () => {
    const store = createStore()
    const { queryByTestId } = mount(store)
    expect(queryByTestId('diagnostics')).toBeNull()
  })

  it('surfaces a blocked mutation instead of failing silently', () => {
    const store = createStore()
    const rendered = mount(store)

    store.setter(appendDiagnosticsAtom, blockedByProtection)

    const item = rendered.getByTestId('diagnostics-item')
    expect(item.getAttribute('data-code')).toBe('MUTATION_BLOCKED_LOCKED')
    expect(item.getAttribute('data-severity')).toBe('error')
    // 关键性质：走的是 i18n 映射，**不是** core 那句英文 fallback。
    // 负向断言是承重的那条 —— 它在默认 locale 换掉之后依然成立。
    expect(item.textContent).not.toContain('Cell is locked')
    expect(item.textContent).toContain('该单元格受保护，无法编辑。')
  })

  it('falls back to the core message for a code with no i18n mapping', () => {
    const store = createStore()
    const rendered = mount(store)

    // 一个引擎将来才会产出的码 —— 本组件的映射表里没有它。
    store.setter(
      appendDiagnosticsAtom,
      createSpreadsheetDiagnostic({
        severity: 'warning',
        source: 'backend',
        code: 'SOME_FUTURE_ENGINE_CODE',
        message: 'Engine says: not today',
      }),
    )

    const item = rendered.getByTestId('diagnostics-item')
    expect(item.getAttribute('data-code')).toBe('SOME_FUTURE_ENGINE_CODE')
    // 可见 > 好看：陌生码宁可显示英文，也不能被吞掉。
    expect(item.textContent).toContain('Engine says: not today')
  })

  it('announces through a polite log region', () => {
    const store = createStore()
    const rendered = mount(store)
    store.setter(appendDiagnosticsAtom, blockedByProtection)

    const region = rendered.getByTestId('diagnostics')
    expect(region.getAttribute('role')).toBe('log')
    expect(region.getAttribute('aria-live')).toBe('polite')
  })

  it('shows newest first and counts the overflow', () => {
    const store = createStore()
    const rendered = mount(store, 2)

    store.setter(
      appendDiagnosticsAtom,
      ...['A', 'B', 'C', 'D'].map((tag) =>
        createSpreadsheetDiagnostic({
          severity: 'info',
          source: 'backend',
          code: `CODE_${tag}`,
          message: `message ${tag}`,
        }),
      ),
    )

    const codes = rendered
      .getAllByTestId('diagnostics-item')
      .map((el) => el.getAttribute('data-code'))
    expect(codes).toEqual(['CODE_D', 'CODE_C'])
    expect(rendered.getByTestId('diagnostics-overflow').textContent).toContain('2')
  })

  it('dismissing one drops it from the store, not just from the view', () => {
    const store = createStore()
    const rendered = mount(store)

    const keep = createSpreadsheetDiagnostic({
      severity: 'info',
      source: 'backend',
      code: 'CODE_KEEP',
      message: 'keep me',
    })
    store.setter(appendDiagnosticsAtom, blockedByProtection, keep)
    expect(store.getter(diagnosticsAtom).items).toHaveLength(2)

    // 最新的在最前 —— 关掉的是 `keep`。
    rendered.getAllByTestId('diagnostics-dismiss')[0].click()

    const remaining = store.getter(diagnosticsAtom).items
    expect(remaining).toHaveLength(1)
    expect(remaining[0].code).toBe('MUTATION_BLOCKED_LOCKED')
  })

  it('clear-all empties the store and unmounts the region', () => {
    const store = createStore()
    const rendered = mount(store)
    store.setter(appendDiagnosticsAtom, blockedByProtection)

    rendered.getByTestId('diagnostics-clear').click()

    expect(store.getter(diagnosticsAtom).items).toHaveLength(0)
    expect(rendered.queryByTestId('diagnostics')).toBeNull()
  })
})
