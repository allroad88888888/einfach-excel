/**
 * 诊断渲染面 —— `diagnosticsAtom` 的**唯一**消费者。
 *
 * 在这之前，UI core 一侧的诊断是**只进不出**的：mutation gateway 把
 * `MUTATION_BLOCKED_LOCKED` 之类推进 `diagnosticsAtom`（`excel/spreadsheet-ui-core/
 * src/editing/mutation-gateway.ts`），码表、上限、单测都齐全，但 solid-excel 侧
 * 没有任何组件读它。用户去改一个受保护的单元格，观察到的现象是「什么也没发生」——
 * 失败是被记录了，只是记录在一个没人看的地方。
 *
 * 设计取舍：
 *
 * - **不塞进状态栏。** `SpreadsheetStatusBar.tsx` 已经 518 行、十个 section，
 *   而且状态栏讲的是「当前是什么状态」，诊断讲的是「刚才那次操作为什么没成」——
 *   两件事，两个文件。
 * - **`role="log"` + `aria-live="polite"`**：这是通知流的标准 a11y 形状，新条目
 *   进来会被读屏announce，而不像 `assertive` 那样打断用户正在读的内容。
 * - **码没有映射也必须可见**：`DIAGNOSTIC_COPY_KEY` 是 `Partial` 的，未映射的码
 *   回落到 UI core 带来的英文 message。宁可显示一句英文，也不要静默吞掉一条新码
 *   —— 静默吞掉正是这个组件存在的原因。沿用 `SpreadsheetNameManagerDialog.tsx`
 *   对 table diagnostic 的同一套策略。
 * - **逐条关闭走 `replaceDiagnosticsAtom`**：UI core 只有「全清」没有「关一条」，
 *   而用 replace 重写剩余项就够了，不必为此往 core 里加原子。
 */
import { useAtomValue, useSetAtom } from '@einfach/solid'
import { createMemo, For, Show } from 'solid-js'
import {
  clearDiagnosticsAtom,
  diagnosticsAtom,
  replaceDiagnosticsAtom,
  type DiagnosticSeverity,
  type SpreadsheetDiagnostic,
} from '@einfach/spreadsheet-ui-core'

import { useT } from '../../src/i18n'

/**
 * 诊断码 → i18n key。**刻意不做成穷尽映射**：`DiagnosticCode` 里的
 * `SpreadsheetError['code']` 那一支是开放的 `string`，编译期穷尽不了，
 * 所以这里只覆盖引擎与 UI core 今天真会产出的那批，其余回落到 message。
 */
const DIAGNOSTIC_COPY_KEY: Readonly<Record<string, string>> = Object.freeze({
  // editing/mutation-gateway
  MUTATION_BLOCKED_LOCKED: 'diagnostics.code.mutationBlockedLocked',
  MUTATION_INVALID_TARGET: 'diagnostics.code.mutationInvalidTarget',
  // formula-bar / backend
  INVALID_FORMULA: 'diagnostics.code.invalidFormula',
  FORMULA_CYCLE: 'diagnostics.code.formulaCycle',
  OUT_OF_BOUNDS: 'diagnostics.code.outOfBounds',
  BACKEND_ERROR: 'diagnostics.code.backendError',
  CANCELLED: 'diagnostics.code.cancelled',
  // projection
  INVALID_SHEET: 'diagnostics.code.invalidSheet',
  INVALID_REQUEST_ID: 'diagnostics.code.invalidRequestId',
  INVALID_RANGE: 'diagnostics.code.invalidRange',
  EMPTY_RANGE: 'diagnostics.code.emptyRange',
  RANGE_TOO_LARGE: 'diagnostics.code.rangeTooLarge',
  RESULT_TOO_LARGE: 'diagnostics.code.resultTooLarge',
  CELL_OUT_OF_RANGE: 'diagnostics.code.cellOutOfRange',
  STALE_RESULT: 'diagnostics.code.staleResult',
  // sheet-tabs / workspace / operations
  TAB_RENAME_EMPTY: 'diagnostics.code.tabRenameEmpty',
  TAB_REORDER_INVALID: 'diagnostics.code.tabReorderInvalid',
  OPERATION_INVALID: 'diagnostics.code.operationInvalid',
  WORKSPACE_STALE_PROJECTION: 'diagnostics.code.workspaceStaleProjection',
})

const SEVERITY_LABEL_KEY: Readonly<Record<DiagnosticSeverity, string>> = Object.freeze({
  error: 'diagnostics.severity.error',
  warning: 'diagnostics.severity.warning',
  info: 'diagnostics.severity.info',
})

/** 同时可见的条数上限。UI core 自己封顶 20 条，这里只管一屏塞得下多少。 */
const DEFAULT_MAX_VISIBLE = 3

export interface SpreadsheetDiagnosticsProps {
  /** 同时渲染几条（最新的在前）。默认 3。 */
  maxVisible?: number
  /** 附加 class，便于宿主定位。 */
  class?: string
}

export function SpreadsheetDiagnostics(props: SpreadsheetDiagnosticsProps) {
  const t = useT()
  const state = useAtomValue(diagnosticsAtom)
  const replaceDiagnostics = useSetAtom(replaceDiagnosticsAtom)
  const clearAll = useSetAtom(clearDiagnosticsAtom)

  // 最新的在前：core 是往尾部追加的。
  const ordered = createMemo(() => [...state().items].reverse())
  const visible = createMemo(() => ordered().slice(0, props.maxVisible ?? DEFAULT_MAX_VISIBLE))
  const overflow = createMemo(() => ordered().length - visible().length)

  const describe = (diagnostic: SpreadsheetDiagnostic): string => {
    const key = DIAGNOSTIC_COPY_KEY[diagnostic.code]
    // 未映射的码回落到 core 的英文 message —— 可见 > 好看。
    return key === undefined ? diagnostic.message : t(key)
  }

  const dismiss = (id: string) => {
    replaceDiagnostics(...state().items.filter((item) => item.id !== id))
  }

  return (
    <Show when={ordered().length > 0}>
      <div
        role="log"
        aria-live="polite"
        aria-label={t('diagnostics.region.label')}
        class={`spreadsheet-diagnostics${props.class ? ` ${props.class}` : ''}`}
        data-testid="diagnostics"
      >
        <For each={visible()}>
          {(diagnostic) => (
            <div
              class="spreadsheet-diagnostics-item"
              data-testid="diagnostics-item"
              data-severity={diagnostic.severity}
              data-code={diagnostic.code}
              data-source={diagnostic.source}
            >
              <span class="spreadsheet-diagnostics-severity" aria-hidden="true">
                {t(SEVERITY_LABEL_KEY[diagnostic.severity])}
              </span>
              <span class="spreadsheet-diagnostics-message">
                <span class="spreadsheet-diagnostics-severity-sr">
                  {t(SEVERITY_LABEL_KEY[diagnostic.severity])}
                </span>
                {describe(diagnostic)}
              </span>
              <button
                type="button"
                class="spreadsheet-diagnostics-dismiss"
                data-testid="diagnostics-dismiss"
                aria-label={t('diagnostics.dismiss')}
                onClick={() => dismiss(diagnostic.id)}
              >
                ×
              </button>
            </div>
          )}
        </For>

        <Show when={overflow() > 0}>
          <span class="spreadsheet-diagnostics-overflow" data-testid="diagnostics-overflow">
            {t('diagnostics.more', { count: overflow() })}
          </span>
        </Show>

        <button
          type="button"
          class="spreadsheet-diagnostics-clear"
          data-testid="diagnostics-clear"
          aria-label={t('diagnostics.clearAll')}
          onClick={() => clearAll()}
        >
          {t('diagnostics.clearAll')}
        </button>
      </div>
    </Show>
  )
}
