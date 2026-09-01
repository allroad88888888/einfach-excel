import {
  editingCommitFeedback,
  editingCommitLifecycleAtom,
  retryEditingRefreshAtom,
  runEditingCommitAtom,
  type CellCoord,
  type EditingCommitOutcome,
  type HistoryEntryRecorder,
} from '@einfach/spreadsheet-ui-core'
import { useCallback, useMemo } from 'react'
import { useEditingSession } from './use-editing-session'
import type { WorkbookViewport } from '../projection/use-workbook-viewport'
import { useStoreValue } from '../runtime/use-store-value'
import { useWorkbookRuntime } from '../runtime/use-workbook-runtime'

const unavailableHistoryRecorder: HistoryEntryRecorder = () => 'unavailable'

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
export function useCellEdit(viewport: WorkbookViewport): CellEdit {
  const core = useWorkbookRuntime()
  const editing = useEditingSession()
  const lifecycleSource = useMemo(
    () => ({
      getSnapshot: () => core.store.getter(editingCommitLifecycleAtom),
      subscribe: (onStoreChange: () => void) =>
        core.store.sub(editingCommitLifecycleAtom, onStoreChange),
    }),
    [core.store],
  )
  const lifecycle = useStoreValue(lifecycleSource)

  const start = useCallback(
    (cell: CellCoord) => {
      const projected = viewport.cells.find(
        (candidate) => candidate.row === cell.row && candidate.col === cell.col,
      )
      if (projected === undefined) return
      editing.start({
        sheetId: 'orders',
        cell,
        draft: projected.formula ?? projected.displayValue,
        source: 'cell',
      })
    },
    [editing, viewport.cells],
  )
  const setDraft = useCallback(
    (draft: string) => editing.setDraft({ draft, source: 'cell' }),
    [editing],
  )
  const commit = useCallback(
    () =>
      core.store.setter(runEditingCommitAtom, {
        source: core.backend,
        commitSource: 'cell',
        move: 'none',
        historyEntryRecorder: unavailableHistoryRecorder,
        refreshProjection: () => viewport.refresh(),
      }),
    [core.backend, core.store, viewport],
  )
  const retryRefresh = useCallback(
    () =>
      core.store.setter(retryEditingRefreshAtom, {
        refreshProjection: () => viewport.refresh(),
      }),
    [core.store, viewport],
  )

  return {
    activeCell: editing.session.source?.cell ?? null,
    busy: ['pending', 'local-acknowledged', 'refreshing', 'refresh-failed', 'outcome-unknown'].includes(
      lifecycle.status,
    ),
    canRetryRefresh: lifecycle.status === 'refresh-failed',
    draft: editing.draft,
    feedback: editingCommitFeedback(lifecycle),
    cancel: () => {
      editing.cancel()
    },
    commit,
    retryRefresh,
    setDraft,
    start,
  }
}
