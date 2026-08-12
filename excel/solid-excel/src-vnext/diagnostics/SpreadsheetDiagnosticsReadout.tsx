/**
 * 开发用读数条：投影状态、可见格数、已加载值数、最后一条命令。
 *
 * 为什么单独一个组件，而不是塞进 `SpreadsheetStatusBar` 或 `SpreadsheetDiagnostics`：
 *
 * - **不进状态栏。** 这四行的文字每滚一次投影就变，宽度一变整条 flex 布局跟着挤，
 *   滚动时状态栏会持续抖动。它们回答的也不是「当前选区是什么」，而是「取数管线现在
 *   到哪一步了」—— 那是调试问题，不是用户问题。
 * - **不并进 `SpreadsheetDiagnostics`。** 那个组件是 `role="log"` + `aria-live="polite"`
 *   的通知流，逐条可关闭；把一个每次滚动都变的读数塞进 live region，读屏会把每一次
 *   滚动都念出来。这里刻意**不加** aria-live：需要时用眼睛看，不打扰读屏用户。
 *
 * testid 沿用状态栏时代的 `status-projection` / `status-visible-cells` /
 * `status-loaded-values` / `status-last-command`：搬家的是渲染位置，不是这四个读数的
 * 含义，既有 e2e 断言继续成立。
 */
import { useAtomValue } from '@einfach/solid'
import { createMemo } from 'solid-js'
import {
  clipboardIntentAtom,
  clipboardStateAtom,
  menuCommandIntentAtom,
  toolbarIntentAtom,
  visibleWindowAtom,
} from '@einfach/spreadsheet-ui-core'

import { spreadsheetProjectionSnapshotAtom } from '../provider'
import { useT } from '../../src/i18n'
import {
  formatClipboardIntent,
  formatLoadedValues,
  formatMenuIntent,
  formatProjectionStatus,
  formatToolbarIntent,
  formatVisibleWindow,
} from './diagnostics-readout-format'

export interface SpreadsheetDiagnosticsReadoutProps {
  class?: string
  'data-testid'?: string
}

export function SpreadsheetDiagnosticsReadout(props: SpreadsheetDiagnosticsReadoutProps) {
  const t = useT()
  const projectionSnapshot = useAtomValue(spreadsheetProjectionSnapshotAtom)
  const visibleWindow = useAtomValue(visibleWindowAtom)
  const toolbarIntent = useAtomValue(toolbarIntentAtom)
  const menuCommandIntent = useAtomValue(menuCommandIntentAtom)
  const clipboardIntent = useAtomValue(clipboardIntentAtom)
  const clipboardState = useAtomValue(clipboardStateAtom)

  const projectionText = createMemo(() => formatProjectionStatus(projectionSnapshot(), t))
  const visibleCellsText = createMemo(() =>
    formatVisibleWindow(projectionSnapshot(), visibleWindow(), t),
  )
  const loadedValuesText = createMemo(() => formatLoadedValues(projectionSnapshot(), t))
  const commandText = createMemo(
    () =>
      (clipboardState().status === 'error' ? clipboardState().error?.message : null) ??
      formatClipboardIntent(clipboardIntent(), t) ??
      formatMenuIntent(menuCommandIntent(), t) ??
      formatToolbarIntent(toolbarIntent(), t) ??
      t('status.lastCommand.ready'),
  )

  return (
    <div
      class={`spreadsheet-diagnostics-readout${props.class ? ` ${props.class}` : ''}`}
      data-testid={props['data-testid'] ?? 'diagnostics-readout'}
    >
      <span
        class="spreadsheet-diagnostics-readout-item"
        data-testid="status-projection"
        aria-label={t('status.projection.label')}
      >
        {projectionText()}
      </span>
      <span class="spreadsheet-diagnostics-readout-item" data-testid="status-visible-cells">
        {visibleCellsText()}
      </span>
      <span class="spreadsheet-diagnostics-readout-item" data-testid="status-loaded-values">
        {loadedValuesText()}
      </span>
      <span class="spreadsheet-diagnostics-readout-item" data-testid="status-last-command">
        {commandText()}
      </span>
    </div>
  )
}
