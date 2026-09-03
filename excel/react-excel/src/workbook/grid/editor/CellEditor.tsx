import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  cancelEditingAtom,
  commitCellEditingAtom,
  editingCommitFeedback,
  editingCommitLifecycleAtom,
  editingDraftAtom,
  editingSessionAtom,
  retryCellEditingRefreshAtom,
  visibleWindowAtom,
} from '@einfach/spreadsheet-ui-core'
import type { CSSProperties, FocusEvent, KeyboardEvent, PointerEvent } from 'react'
import { useEffect, useRef } from 'react'
import './cell-editor.css'

export interface CellEditorProps {
  readonly focusGrid: () => void
}

/** Renders the active in-cell input over its Rust-projected grid cell. */
export function CellEditor({ focusGrid }: CellEditorProps) {
  const session = useAtomValue(editingSessionAtom)
  const draft = useAtomValue(editingDraftAtom)
  const lifecycle = useAtomValue(editingCommitLifecycleAtom)
  const rowStart = useAtomValue(visibleWindowAtom).rowStart
  const cancelEditing = useSetAtom(cancelEditingAtom)
  const commitEditing = useSetAtom(commitCellEditingAtom)
  const retryRefresh = useSetAtom(retryCellEditingRefreshAtom)
  const setDraft = useSetAtom(editingDraftAtom)
  const inputRef = useRef<HTMLInputElement>(null)
  const committingRef = useRef(false)
  const suppressBlurRef = useRef(false)
  const cell = session.source?.cell ?? null
  const busy = [
    'pending',
    'local-acknowledged',
    'refreshing',
    'refresh-failed',
    'outcome-unknown',
  ].includes(lifecycle.status)
  const feedback = editingCommitFeedback(lifecycle)

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
    inputRef.current?.select()
  }, [cell?.col, cell?.row])

  if (cell === null) return null

  const commitOnce = async (restoreKeyboardFocus: boolean) => {
    if (committingRef.current || busy) return
    committingRef.current = true
    try {
      const outcome = await commitEditing()
      if (restoreKeyboardFocus && outcome === 'completed') focusGrid()
      if (restoreKeyboardFocus && outcome === 'rejected') inputRef.current?.focus()
    } finally {
      committingRef.current = false
    }
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      suppressBlurRef.current = true
      cancelEditing()
      focusGrid()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      void commitOnce(true)
    }
  }
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (suppressBlurRef.current) {
      suppressBlurRef.current = false
      return
    }
    if (!event.currentTarget.contains(event.relatedTarget)) void commitOnce(false)
  }
  const stopPointer = (event: PointerEvent<HTMLDivElement>) => event.stopPropagation()
  const style = {
    '--editor-row': cell.row - rowStart,
    '--editor-col': cell.col,
  } as CSSProperties
  const fieldIdentity = `cell-editor-r${cell.row}-c${cell.col}`

  return (
    <div className="cell-editor" onBlur={onBlur} onPointerDown={stopPointer} style={style}>
      <input
        ref={inputRef}
        aria-label="Cell editor"
        disabled={busy}
        id={fieldIdentity}
        name={fieldIdentity}
        onChange={(event) => setDraft({ draft: event.currentTarget.value, source: 'cell' })}
        onKeyDown={onKeyDown}
        value={draft}
      />
      {feedback && (
        <div className="cell-editor-feedback" role="alert">
          <span>{feedback.message}</span>
          {lifecycle.status === 'refresh-failed' && (
            <button type="button" onClick={() => void retryRefresh()}>
              Retry refresh
            </button>
          )}
        </div>
      )}
    </div>
  )
}
