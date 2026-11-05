import { useLayoutEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react/macro'
import {
  cellContextMenuAtom,
  closeCellContextMenuAtom,
  openShiftCellsDialogAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { PluginMenuItems } from '../../plugin/PluginMounts'
import { contextMenuItemShown, useWorkbookUiOptions } from '../../page/workbook-ui-options'
import './shift-cells.css'

/** 单元格右键菜单：内置插入/删除单元格，其后是插件菜单项；位置由 UI Core 保存。 */
export function CellContextMenu() {
  const { t } = useLingui()
  const menu = useAtomValue(cellContextMenuAtom)
  const close = useSetAtom(closeCellContextMenuAtom)
  const open = useSetAtom(openShiftCellsDialogAtom)
  const ref = useRef<HTMLDivElement>(null)
  const ui = useWorkbookUiOptions()
  useLayoutEffect(() => {
    if (!menu) return
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const dismiss = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('pointerdown', dismiss, true)
    return () => document.removeEventListener('pointerdown', dismiss, true)
  }, [menu, close])
  if (!menu || ui.contextMenu === false) return null
  return (
    <div
      ref={ref}
      className="cell-context-menu"
      role="menu"
      aria-label={t`Cell actions`}
      style={{ left: menu.x, top: menu.y }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          close()
          return
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
        const index = items.indexOf(document.activeElement as HTMLButtonElement)
        const step = event.key === 'ArrowDown' ? 1 : -1
        items[(index + step + items.length) % items.length]?.focus()
      }}
    >
      {contextMenuItemShown(ui, 'cells.insert') && <button type="button" role="menuitem"
        data-menu-item="cells.insert" onClick={() => void open({ mode: 'insert', source: 'menu' })}>
        {t`Insert…`}
      </button>}
      {contextMenuItemShown(ui, 'cells.delete') && <button type="button" role="menuitem"
        data-menu-item="cells.delete" onClick={() => void open({ mode: 'delete', source: 'menu' })}>
        {t`Delete…`}
      </button>}
      <PluginMenuItems close={close} />
    </div>
  )
}
