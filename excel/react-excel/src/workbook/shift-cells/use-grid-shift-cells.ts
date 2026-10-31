import { useSetAtom } from '@einfach/react'
import { openCellContextMenuAtom, openShiftCellsDialogAtom } from '@einfach-excel/spreadsheet-ui-core'
import type { KeyboardEvent, MouseEvent } from 'react'
import { workbookCellAt } from '../grid/viewport/workbook-grid-hit-test'

/** DOM 适配：Ctrl/⌘+Shift+= 与 Ctrl/⌘+- 打开插入/删除，右键单元格打开菜单。 */
export function useGridShiftCells() {
  const open = useSetAtom(openShiftCellsDialogAtom)
  const openMenu = useSetAtom(openCellContextMenuAtom)
  return {
    onKeyDown(event: KeyboardEvent<HTMLDivElement>): boolean {
      if (event.nativeEvent.isComposing || event.altKey || !(event.ctrlKey || event.metaKey))
        return false
      // Shift+= 在多数布局产生 '+'；数字小键盘的 '+'/'-' 也接受。
      const insert = event.key === '+' || (event.shiftKey && (event.key === '=' || event.code === 'Equal'))
      const remove = !event.shiftKey && (event.key === '-' || event.code === 'Minus')
      if (!insert && !remove) return false
      event.preventDefault()
      void open({ mode: insert ? 'insert' : 'delete', source: 'keyboard' })
      return true
    },
    onContextMenu(event: MouseEvent<HTMLDivElement>): void {
      if (workbookCellAt(event) === null) return
      if (openMenu({ x: event.clientX, y: event.clientY })) event.preventDefault()
    },
  }
}
