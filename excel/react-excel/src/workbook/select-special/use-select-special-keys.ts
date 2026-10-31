import { useSetAtom } from '@einfach/react'
import {
  selectAllOrRegionAtom,
  selectCurrentRegionAtom,
  selectVisibleCellsAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import type { KeyboardEvent } from 'react'

/**
 * Ctrl+A（先当前区域，再整表）、Ctrl+Shift+*（当前区域）与 Alt+;（仅可见单元格）。
 * 返回 true 表示已处理；命令本身在 UI Core 中完成原生查询与选区发布。
 */
export function useSelectSpecialKeys(): (event: KeyboardEvent) => boolean {
  const selectAll = useSetAtom(selectAllOrRegionAtom)
  const currentRegion = useSetAtom(selectCurrentRegionAtom)
  const visibleOnly = useSetAtom(selectVisibleCellsAtom)
  return (event) => {
    const mod = event.ctrlKey || event.metaKey
    if (event.altKey && !mod && !event.shiftKey && event.code === 'Semicolon') {
      event.preventDefault()
      void visibleOnly()
      return true
    }
    if (!mod || event.altKey) return false
    if (!event.shiftKey && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      void selectAll()
      return true
    }
    if (event.key === '*' || (event.shiftKey && event.code === 'Digit8')) {
      event.preventDefault()
      void currentRegion()
      return true
    }
    return false
  }
}
