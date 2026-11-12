import { atom } from '@einfach/core'

/**
 * 功能区按整组折叠：collapsed 是当前分类末尾收进“更多”的组数（视图测量后上报），
 * expanded 是“更多”面板是否打开。每个工作簿 store 独立，不进入 Rust 工作簿或撤销历史。
 */
export interface WorkbookRibbonOverflow {
  readonly collapsed: number
  readonly expanded: boolean
}

const NONE: WorkbookRibbonOverflow = { collapsed: 0, expanded: false }
const ribbonOverflowStateAtom = atom<WorkbookRibbonOverflow>(NONE)

export const workbookRibbonOverflowAtom = atom((get) => get(ribbonOverflowStateAtom))

/** 视图测量结果；没有折叠组时同时关闭面板。 */
export const reportWorkbookRibbonOverflowAtom = atom(null, (get, set, collapsed: number) => {
  const current = get(ribbonOverflowStateAtom)
  const next = Number.isInteger(collapsed) && collapsed > 0 ? collapsed : 0
  if (current.collapsed === next) return
  set(ribbonOverflowStateAtom, { collapsed: next, expanded: next > 0 && current.expanded })
})

/** “更多”按钮、Escape 与外部点击的唯一入口；没有折叠组时不能打开。 */
export const setWorkbookRibbonExpandedAtom = atom(null, (get, set, expanded: boolean) => {
  const current = get(ribbonOverflowStateAtom)
  const next = expanded && current.collapsed > 0
  if (current.expanded !== next) set(ribbonOverflowStateAtom, { ...current, expanded: next })
})

/** 切换分类：先全部展开排布，由视图按新分类重新测量。 */
export const resetWorkbookRibbonOverflowAtom = atom(null, (get, set) => {
  if (get(ribbonOverflowStateAtom) !== NONE) set(ribbonOverflowStateAtom, NONE)
})

workbookRibbonOverflowAtom.debugLabel = 'spreadsheet.toolbar.ribbonOverflow'
reportWorkbookRibbonOverflowAtom.debugLabel = 'spreadsheet.toolbar.reportRibbonOverflow'
setWorkbookRibbonExpandedAtom.debugLabel = 'spreadsheet.toolbar.setRibbonExpanded'
resetWorkbookRibbonOverflowAtom.debugLabel = 'spreadsheet.toolbar.resetRibbonOverflow'
