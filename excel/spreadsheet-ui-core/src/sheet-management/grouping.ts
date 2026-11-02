import { atom, type Atom, type Getter, type Setter } from '@einfach/core'
import { activateWorkbookSheetAtom } from '../runtime/activate-workbook-sheet'
import { groupedSheetIdsBackingAtom } from '../runtime/sheet-view-state'
import {
  activeWorkbookSheetAtom,
  workbookDocumentAtom,
  type WorkbookDocumentSheet,
} from '../runtime/workbook-document'
import { sheetTabsAtom } from '../sheet-tabs/state'
import { closeSheetTabMenuAtom } from './ui-state'
import { visibleSheets } from './visible-sheets'

export type SheetTabSelectMode = 'single' | 'toggle' | 'range'

/**
 * 当前工作表分组（按工作簿索引有序排列，仅包含可见工作表，且始终包含当前活动工作表）。
 */
export const groupedSheetIdsAtom: Atom<readonly string[]> = atom((get) => {
  const visible = visibleSheets(get(workbookDocumentAtom).sheets)
  const active = get(activeWorkbookSheetAtom)
  if (!active || visible.length === 0) return []
  const raw = get(groupedSheetIdsBackingAtom)
  const selected = visible.filter((sheet) => raw.includes(sheet.id)).map((sheet) => sheet.id)
  if (selected.includes(active.id)) return selected
  return active.hidden ? [] : [active.id]
})
groupedSheetIdsAtom.debugLabel = 'spreadsheet.sheetManagement.groupedIds'

/** 多于一张可见工作表处于分组中时为 true。 */
export const isSheetGroupActiveAtom: Atom<boolean> = atom(
  (get) => get(groupedSheetIdsAtom).length > 1,
)
isSheetGroupActiveAtom.debugLabel = 'spreadsheet.sheetManagement.isGroupActive'

export function applySheetTabSwitch(
  get: Getter,
  set: Setter,
  target: WorkbookDocumentSheet,
  mode: SheetTabSelectMode = 'single',
): boolean {
  if (target.hidden) return false
  const visible = visibleSheets(get(workbookDocumentAtom).sheets)
  const active = get(activeWorkbookSheetAtom)
  if (!active) return false
  if (mode === 'single') {
    set(groupedSheetIdsBackingAtom, [target.id])
    set(activateWorkbookSheetAtom, target)
    set(sheetTabsAtom, {
      ...get(sheetTabsAtom),
      rename: null,
      error: null,
      deleteConfirmation: null,
    })
    return true
  }
  if (mode === 'toggle') {
    const current = get(groupedSheetIdsAtom)
    if (current.includes(target.id)) {
      if (current.length > 1) {
        const next = current.filter((id) => id !== target.id)
        set(groupedSheetIdsBackingAtom, next)
        if (target.id === active.id) {
          const promoted = visible.find((sheet) => sheet.id === next[0])
          if (promoted) set(activateWorkbookSheetAtom, promoted)
        }
      }
    } else {
      const next = visible
        .filter((sheet) => current.includes(sheet.id) || sheet.id === target.id)
        .map((sheet) => sheet.id)
      set(groupedSheetIdsBackingAtom, next)
    }
    set(sheetTabsAtom, {
      ...get(sheetTabsAtom),
      rename: null,
      error: null,
      deleteConfirmation: null,
    })
    return true
  }
  const activeIndex = visible.findIndex((sheet) => sheet.id === active.id)
  const targetIndex = visible.findIndex((sheet) => sheet.id === target.id)
  if (activeIndex < 0 || targetIndex < 0) return false
  const start = Math.min(activeIndex, targetIndex)
  const end = Math.max(activeIndex, targetIndex)
  set(
    groupedSheetIdsBackingAtom,
    visible.slice(start, end + 1).map((sheet) => sheet.id),
  )
  set(sheetTabsAtom, {
    ...get(sheetTabsAtom),
    rename: null,
    error: null,
    deleteConfirmation: null,
  })
  return true
}

/** 右键菜单「全选工作表」：把全部可见工作表加入当前工作表组。 */
export const selectAllSheetsAtom = atom(null, (get, set): boolean => {
  set(closeSheetTabMenuAtom)
  const visible = visibleSheets(get(workbookDocumentAtom).sheets)
  if (visible.length <= 1) return false
  set(
    groupedSheetIdsBackingAtom,
    visible.map((sheet) => sheet.id),
  )
  return true
})
selectAllSheetsAtom.debugLabel = 'spreadsheet.sheetManagement.selectAllSheets'

/** 右键菜单「取消工作表分组」：恢复为仅选中当前活动工作表。 */
export const ungroupSheetsAtom = atom(null, (get, set): boolean => {
  set(closeSheetTabMenuAtom)
  const active = get(activeWorkbookSheetAtom)
  if (!active) return false
  set(groupedSheetIdsBackingAtom, [active.id])
  return true
})
ungroupSheetsAtom.debugLabel = 'spreadsheet.sheetManagement.ungroupSheets'
