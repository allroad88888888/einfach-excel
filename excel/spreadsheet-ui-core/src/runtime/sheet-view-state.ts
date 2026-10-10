import { atom } from '@einfach/core'
import type { MultiRangeSelectionState } from '../selection/types'

interface SheetView {
  readonly selection: MultiRangeSelectionState
  readonly scrollTop: number
  readonly scrollLeft: number
}

/** 离开工作表时的 UI 位置，不存单元格、格式、窗口投影或 DOM 尺寸。 */
export const EMPTY_SHEET_VIEWS = { views: {}, referenceBrowsing: false }
export const sheetViewsBackingAtom = atom<{
  views: Readonly<Record<string, SheetView>>
  /** 引用拾取只是临时浏览，不得覆盖各表的普通视图。 */
  referenceBrowsing: boolean
}>(EMPTY_SHEET_VIEWS)
