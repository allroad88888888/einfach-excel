/**
 * 状态栏：**当前选区是什么** + **由它算出的聚合值** + **当前输入模式**。三段，没别的。
 *
 * 这一版砍掉的东西与理由：
 *
 * - **缩放（预设按钮 + 滑块 + 百分比）**：`zoomLevelAtom` 全仓没有第二个读者，网格从不
 *   读它。点 150% 只是改了一个没人看的数字。整条线（含 ui-core 的 atom）已删除。
 * - **视图模式（普通 / 分页预览 / 页面布局）**：同样零消费者。真正的打印预览是工具栏
 *   那条线（`print/`），状态栏这三个按钮是它的空壳复制品。
 * - **活动单元格段**：单格选区时与选区段逐字相同（截图里的 `B1562 B1562`）；范围选区
 *   下的活动单元格由公式栏左侧的名称框负责。
 * - **投影/可见格数/已加载值/最后一条命令**：调试读数，迁到
 *   `diagnostics/SpreadsheetDiagnosticsReadout.tsx`，testid 不变。
 */
import { useAtomValue } from '@einfach/solid'
import { createMemo, createSignal, Show } from 'solid-js'
import {
  keyboardModeAtom,
  selectionSnapshotAtom,
  type StatusBarAggregateConfig,
  type StatusBarAggregateKey,
  type StatusBarInputMode,
} from '@einfach/spreadsheet-ui-core'

import { useT } from '../../src/i18n'
import { StatusBarAggregateMenu } from './StatusBarAggregateMenu'
import { StatusBarAggregates } from './StatusBarAggregates'
import { INPUT_MODE_LABEL_KEY, KEYBOARD_MODE_TO_BADGE, formatRange } from './status-bar-format'

export type SpreadsheetStatusBarSection = 'selection' | 'aggregates' | 'mode-badge'

export const SPREADSHEET_STATUS_BAR_ALL_SECTIONS: readonly SpreadsheetStatusBarSection[] = [
  'selection',
  'aggregates',
  'mode-badge',
]

export interface SpreadsheetStatusBarProps {
  class?: string
  'data-testid'?: string
  sections?: readonly SpreadsheetStatusBarSection[]
  orientation?: 'horizontal' | 'vertical'
}

interface PickerPosition {
  readonly x: number
  readonly y: number
}

export function SpreadsheetStatusBar(props: SpreadsheetStatusBarProps) {
  const t = useT()
  const selectionSnapshot = useAtomValue(selectionSnapshotAtom)
  const keyboardMode = useAtomValue(keyboardModeAtom)

  const [picker, setPicker] = createSignal<PickerPosition | null>(null)

  const selectionText = createMemo(() =>
    formatRange(selectionSnapshot().selection, selectionSnapshot().range, t),
  )
  const inputMode = createMemo<StatusBarInputMode>(() => KEYBOARD_MODE_TO_BADGE[keyboardMode()])

  const sections = createMemo<readonly SpreadsheetStatusBarSection[]>(
    () => props.sections ?? SPREADSHEET_STATUS_BAR_ALL_SECTIONS,
  )
  const showSection = (section: SpreadsheetStatusBarSection) => sections().includes(section)
  const orientation = createMemo(() => props.orientation ?? 'horizontal')

  function openPicker(event: MouseEvent) {
    event.preventDefault()
    setPicker({ x: event.clientX, y: event.clientY })
  }

  return (
    <div
      class={`spreadsheet-status-bar spreadsheet-status-bar--${orientation()} ${props.class ?? ''}`.trim()}
      data-testid={props['data-testid'] ?? 'spreadsheet-status-bar'}
      data-orientation={orientation()}
    >
      <Show when={showSection('selection')}>
        <span class="spreadsheet-status-bar-item" data-testid="status-selection">
          {selectionText()}
        </span>
      </Show>

      <Show when={showSection('aggregates')}>
        <StatusBarAggregates onRequestPicker={openPicker} />
      </Show>

      <Show when={showSection('mode-badge')}>
        <span
          class="spreadsheet-status-bar-mode-badge"
          data-testid="status-mode-badge"
          data-mode={inputMode()}
        >
          {t(INPUT_MODE_LABEL_KEY[inputMode()])}
        </span>
      </Show>

      <Show keyed when={picker()}>
        {(position) => (
          <StatusBarAggregateMenu
            x={position.x}
            y={position.y}
            onClose={() => setPicker(null)}
          />
        )}
      </Show>
    </div>
  )
}

export type { StatusBarAggregateConfig, StatusBarAggregateKey, StatusBarInputMode }
