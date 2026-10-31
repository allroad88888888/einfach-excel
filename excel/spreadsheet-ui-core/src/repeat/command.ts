import { atom } from '@einfach/core'
import { runSelectionMergeAtom } from '../toolbar/selection-merge-command'
import { runSelectionMutationAtom } from '../toolbar/selection-mutation-command'
import { runSelectionSizeAtom } from '../toolbar/selection-size-command'
import { runSelectionStructureAtom } from '../toolbar/selection-structure-command'
import { runSelectionVisibilityAtom } from '../toolbar/selection-visibility-command'
import { selectionSnapshotAtom } from '../selection'
import { lastRepeatRecordAtom } from './state'

/** 用同样的参数对“当前”选区重放最近一次动作；每次重放仍是各命令自己的一个撤销步。 */
export const repeatLastActionAtom = atom(null, async (get, set): Promise<boolean> => {
  const intent = get(lastRepeatRecordAtom)?.intent
  if (!intent) return false
  switch (intent.kind) {
    case 'mutation':
      return (await set(runSelectionMutationAtom, intent.mutation)) === 'completed'
    case 'structure':
      return set(runSelectionStructureAtom, intent.action)
    case 'merge':
      return set(runSelectionMergeAtom, intent.action)
    case 'visibility':
      return set(runSelectionVisibilityAtom, intent.action)
    case 'size': {
      const selection = get(selectionSnapshotAtom)
      const sheetId = selection.selection.sheetId
      if (!sheetId) return false
      return set(runSelectionSizeAtom, {
        axis: intent.axis,
        pixels: intent.pixels,
        target: { sheetId, range: { ...selection.range } },
      })
    }
  }
})
repeatLastActionAtom.debugLabel = 'spreadsheet.repeat.repeatLast'
