import { atom } from '@einfach/core'
import { dispatchKeyboardInputAtom, type KeyboardInput } from '../keyboard'
import type { CellCoord } from '../shared'
import { viewportMetricsAtom } from '../viewport/metrics'
import { commitCellEditingAtom } from './commit-cell-editing'
import { cancelEditingAtom } from './session-atoms'
import { startCellEditingFromProjectionAtom } from './start-cell-editing'
import type { EditingCommitOutcome } from './types'
import { clearSelectionAtom } from '../toolbar/selection-mutation-command'
import { runRustHistoryAtom } from '../history/rust-history-command'
import { fillSelectionAtom } from '../auto-fill/directional-command'
import { exitFormulaReferenceAtom } from '../formula-reference'
import { dispatchTableTabAtom } from '../tables/tab-navigation'

export interface GridCellKeyboardInput {
  readonly sheetId: string
  readonly cell: CellCoord
  readonly keyboard: KeyboardInput
  readonly allowEditing: boolean
}

export type EditorKeyboardOutcome = EditingCommitOutcome | 'cancelled' | 'ignored'

/** Executes one grid key through the shared keyboard intent and editing state. */
export const dispatchGridCellKeyboardInputAtom = atom(
  null,
  (_get, set, input: GridCellKeyboardInput) => {
    const tableIntent = set(dispatchTableTabAtom, {
      ...input.keyboard, allowAppend: input.allowEditing,
    })
    if (tableIntent) return tableIntent
    const intent = set(dispatchKeyboardInputAtom, input.keyboard)
    if (intent.type === 'range.fill' && input.allowEditing) {
      void set(fillSelectionAtom, intent.direction)
      return intent
    }
    // 历史操作不读取旧画面的单元格；保留帧只禁止就地编辑，不吞撤销／重做。
    if (intent.type === 'history.undo' || intent.type === 'history.redo') {
      void set(runRustHistoryAtom, intent.type === 'history.undo' ? 'undo' : 'redo')
      return intent
    }
    if (intent.type === 'cell.clear' && input.allowEditing) {
      void set(clearSelectionAtom, 'contents')
      return intent
    }
    if (intent.type !== 'editing.start' || !input.allowEditing) return intent

    set(startCellEditingFromProjectionAtom, {
      sheetId: input.sheetId,
      cell: input.cell,
      source: intent.source,
      initialDraft: intent.initialDraft,
    })
    return intent
  },
)
dispatchGridCellKeyboardInputAtom.debugLabel = 'spreadsheet.editing.dispatchGridCellKeyboard'

/** Commits or cancels one editor key, moving only after Rust confirms the commit. */
export const dispatchEditorKeyboardInputAtom = atom(
  null,
  async (get, set, input: KeyboardInput): Promise<EditorKeyboardOutcome> => {
    let intent = set(dispatchKeyboardInputAtom, input)
    if (intent.type === 'formulaReference.exit') {
      set(exitFormulaReferenceAtom, intent.reason)
      intent = set(dispatchKeyboardInputAtom, input)
    }
    if (intent.type === 'editing.cancel') {
      return set(cancelEditingAtom) ? 'cancelled' : 'ignored'
    }
    if (intent.type !== 'editing.commit') return 'ignored'

    const viewportWitness = get(viewportMetricsAtom)
    const outcome = await set(commitCellEditingAtom)
    if (outcome === 'completed' && get(viewportMetricsAtom) === viewportWitness) {
      if (!set(dispatchTableTabAtom, input)) set(dispatchKeyboardInputAtom, input)
    }
    return outcome
  },
)
dispatchEditorKeyboardInputAtom.debugLabel = 'spreadsheet.editing.dispatchEditorKeyboard'
