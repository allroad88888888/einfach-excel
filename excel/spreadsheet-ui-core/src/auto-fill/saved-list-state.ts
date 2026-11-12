import { atom } from '@einfach/core'

export interface SavedFillList {
  readonly name: string
  readonly text: string
}
export const EMPTY_SAVED_FILL_LISTS: readonly SavedFillList[] = Object.freeze([])
/** 唯一保存目录；面板草稿、宿主配置、只读投影均不持有可写副本。 */
export const savedFillListsBackingAtom = atom(EMPTY_SAVED_FILL_LISTS)
savedFillListsBackingAtom.debugLabel = 'spreadsheet.autoFill.savedLists'
