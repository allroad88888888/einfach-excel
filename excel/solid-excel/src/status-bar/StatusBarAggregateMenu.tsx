/**
 * 状态栏右键弹出的聚合项勾选菜单（Excel 口径）。
 *
 * 取代了从前那一排常驻按钮：六个按钮里没勾上的三个只剩一个标签，既占位置又不给信息，
 * 而它们真正的用途——「选择状态栏显示哪几项」——每次会话大概只会用到一次。
 *
 * 状态放 `createSignal`（由宿主 `SpreadsheetStatusBar` 持有）而不是 atom：它是纯粹的
 * 每实例瞬时 UI 状态，同一页面挂两条状态栏时两个菜单必须各开各的。
 */
import { useAtomValue, useSetAtom } from '@einfach/solid'
import { For, onCleanup, onMount } from 'solid-js'
import {
  statusBarAggregateConfigAtom,
  toggleStatusBarAggregateAtom,
  type StatusBarAggregateKey,
} from '@einfach/spreadsheet-ui-core'

import { useT } from '../i18n'
import { AGGREGATE_LABEL_KEYS, AGGREGATE_ORDER } from './status-bar-format'

export interface StatusBarAggregateMenuProps {
  /** 视口坐标，来自触发的 contextmenu 事件。 */
  x: number
  y: number
  onClose: () => void
}

export function StatusBarAggregateMenu(props: StatusBarAggregateMenuProps) {
  const t = useT()
  const config = useAtomValue(statusBarAggregateConfigAtom)
  const toggleAggregate = useSetAtom(toggleStatusBarAggregateAtom)

  let menuRef: HTMLDivElement | undefined
  const itemRefs: HTMLButtonElement[] = []

  function focusItem(index: number) {
    const bounded = (index + itemRefs.length) % itemRefs.length
    itemRefs[bounded]?.focus()
  }

  function currentIndex(): number {
    return itemRefs.findIndex((item) => item === document.activeElement)
  }

  function handleDocumentPointerDown(event: MouseEvent) {
    if (menuRef && event.target instanceof Node && menuRef.contains(event.target)) return
    props.onClose()
  }

  function handleKeyDown(event: KeyboardEvent) {
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        props.onClose()
        return
      case 'ArrowDown':
        event.preventDefault()
        focusItem(currentIndex() + 1)
        return
      case 'ArrowUp':
        event.preventDefault()
        focusItem(currentIndex() - 1)
        return
      case 'Home':
        event.preventDefault()
        focusItem(0)
        return
      case 'End':
        event.preventDefault()
        focusItem(itemRefs.length - 1)
        return
      default:
        return
    }
  }

  onMount(() => {
    focusItem(0)
    document.addEventListener('mousedown', handleDocumentPointerDown, true)
    onCleanup(() => {
      document.removeEventListener('mousedown', handleDocumentPointerDown, true)
    })
  })

  // 勾选后**不关闭**：调整显示项通常是连着点两三下的动作，每点一次就关掉会逼用户
  // 重新右键。Excel 的状态栏菜单同样保持打开。
  function toggle(key: StatusBarAggregateKey) {
    toggleAggregate(key)
  }

  return (
    <div
      ref={menuRef}
      class="spreadsheet-status-bar-aggregate-menu"
      data-testid="status-aggregate-menu"
      role="menu"
      aria-label={t('status.aggregate.menuLabel')}
      style={{ left: `${Math.trunc(props.x)}px`, top: `${Math.trunc(props.y)}px` }}
      onKeyDown={handleKeyDown}
    >
      <For each={AGGREGATE_ORDER}>
        {(key, index) => (
          <button
            ref={(element) => {
              itemRefs[index()] = element
            }}
            type="button"
            class="spreadsheet-status-bar-aggregate-menu-item"
            data-testid={`status-aggregate-menu-${key}`}
            role="menuitemcheckbox"
            aria-checked={Boolean(config()[key])}
            onClick={() => toggle(key)}
          >
            <span class="spreadsheet-status-bar-aggregate-menu-check" aria-hidden="true">
              {config()[key] ? '✓' : ''}
            </span>
            {t(AGGREGATE_LABEL_KEYS[key])}
          </button>
        )}
      </For>
    </div>
  )
}
