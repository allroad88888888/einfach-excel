import { useLayoutEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react/macro'
import {
  cellContextMenuAtom,
  closeCellContextMenuAtom,
  openShiftCellsDialogAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import './shift-cells.css'

/** 单元格右键菜单：只承载插入/删除单元格入口，位置由 UI Core 保存。 */
export function CellContextMenu() {
  const { t } = useLingui()
  const menu = useAtomValue(cellContextMenuAtom)
  const close = useSetAtom(closeCellContextMenuAtom)
  const open = useSetAtom(openShiftCellsDialogAtom)
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!menu) return
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const dismiss = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('pointerdown', dismiss, true)
    return () => document.removeEventListener('pointerdown', dismiss, true)
  }, [menu, close])
  if (!menu) return null
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
      <button type="button" role="menuitem" onClick={() => void open({ mode: 'insert', source: 'menu' })}>
        {t`Insert…`}
      </button>
      <button type="button" role="menuitem" onClick={() => void open({ mode: 'delete', source: 'menu' })}>
        {t`Delete…`}
      </button>
    </div>
  )
}
