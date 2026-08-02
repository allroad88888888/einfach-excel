/**
 * `activeSpillBlockageAtom` 的渲染面 —— 一句话，告诉用户这个 `#SPILL!` 是被哪一格
 * 挡住的。
 *
 * 在这之前 `#SPILL!` **说不出自己被谁挡住**：用户看到一个错误码，没有任何线索指向
 * 「把 B3 清掉就好了」。引擎侧的 `spillBlocker` 查询补上了事实，这个组件是它唯一
 * 的出口。
 *
 * 设计取舍：
 *
 * - **不复用 `SpreadsheetDiagnostics`。** 那是**日志流**（「刚才那次操作为什么没
 *   成」，逐条可关、可堆叠、封顶 20 条）。阻塞线索是**状态**：跟着活动单元格走，
 *   移开就该消失。把它推进日志流意味着每次选区移动都追加一条、还得自己撤回。
 * - **不做成可关闭。** 没有「关掉」的语义 —— 选区一移开它自己就没了。
 * - **`role="status"` + `aria-live="polite"`**：它是随选区变化的状态播报，不是通知
 *   流；`polite` 让读屏在读完当前内容后再播，不打断。
 * - **地址用 A1 而不是行列号。** 用户接下来要做的事是「去 B3 把它删掉」，A1 是他
 *   在名称框里输得进去的那个形式。
 *
 * 这个组件不发查询 —— 查询由 `SpreadsheetGrid` 的选区探针统一发（与溢出边框同一
 * 次 RPC），这里只读结果。
 */
import { useAtomValue } from '@einfach/solid'
import { createMemo, Show } from 'solid-js'
import { activeSpillBlockageAtom, type CellCoord } from '@einfach/spreadsheet-ui-core'

import { useT } from '../../src/i18n'

function columnLabel(index: number): string {
  let value = index + 1
  let label = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    label = String.fromCharCode(65 + remainder) + label
    value = Math.floor((value - 1) / 26)
  }
  return label
}

function toA1(cell: CellCoord): string {
  return `${columnLabel(cell.col)}${cell.row + 1}`
}

export interface SpreadsheetSpillBlockedHintProps {
  /** 只为**这张表**的锚点显示。宿主多表时用来挡住别的表的线索。 */
  sheetId?: string
  /** 附加 class，便于宿主定位。 */
  class?: string
}

export function SpreadsheetSpillBlockedHint(props: SpreadsheetSpillBlockedHintProps) {
  const t = useT()
  const blockage = useAtomValue(activeSpillBlockageAtom)

  const visible = createMemo(() => {
    const current = blockage()
    if (!current) return null
    if (props.sheetId !== undefined && current.sheetId !== props.sheetId) return null
    return current
  })

  return (
    <Show when={visible()}>
      {(current) => (
        <div
          role="status"
          aria-live="polite"
          class={`spreadsheet-spill-blocked${props.class ? ` ${props.class}` : ''}`}
          data-testid="spill-blocked-hint"
          data-anchor={toA1(current().anchor)}
          data-blocked-by={toA1(current().blockedBy)}
        >
          <span class="spreadsheet-spill-blocked-code" aria-hidden="true">
            #SPILL!
          </span>
          <span class="spreadsheet-spill-blocked-message">
            {t('spill.blockedBy', { addr: toA1(current().blockedBy) })}
          </span>
        </div>
      )}
    </Show>
  )
}
