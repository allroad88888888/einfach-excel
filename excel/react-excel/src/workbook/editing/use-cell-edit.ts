import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  commitCellEditingAtom,
  editingCommitFeedback,
  editingCommitLifecycleAtom,
  retryCellEditingRefreshAtom,
  startCellEditingFromProjectionAtom,
  type CellCoord,
  type EditingCommitOutcome,
} from '@einfach/spreadsheet-ui-core'
import { useEditingSession } from './use-editing-session'

export interface CellEdit {
  readonly activeCell: CellCoord | null
  readonly busy: boolean
  readonly canRetryRefresh: boolean
  readonly draft: string
  readonly feedback: ReturnType<typeof editingCommitFeedback>
  cancel(): void
  commit(): Promise<EditingCommitOutcome>
  retryRefresh(): Promise<EditingCommitOutcome>
  setDraft(draft: string): void
  start(cell: CellCoord): void
}

/** Connects the cell editor to UI-core's acknowledged Rust mutation command. */
export function useCellEdit(): CellEdit {
  const editing = useEditingSession()
  const lifecycle = useAtomValue(editingCommitLifecycleAtom)
  const startCellEditing = useSetAtom(startCellEditingFromProjectionAtom)
  const commit = useSetAtom(commitCellEditingAtom)
  const retryRefresh = useSetAtom(retryCellEditingRefreshAtom)

  const start = (cell: CellCoord) => startCellEditing({ sheetId: 'orders', cell })
  const setDraft = (draft: string) => editing.setDraft({ draft, source: 'cell' })
  return {
    activeCell: editing.session.source?.cell ?? null,
    busy: ['pending', 'local-acknowledged', 'refreshing', 'refresh-failed', 'outcome-unknown'].includes(
      lifecycle.status,
    ),
    canRetryRefresh: lifecycle.status === 'refresh-failed',
    draft: editing.draft,
    feedback: editingCommitFeedback(lifecycle),
    cancel: editing.cancel,
    commit,
    retryRefresh,
    setDraft,
    start,
  }
}
