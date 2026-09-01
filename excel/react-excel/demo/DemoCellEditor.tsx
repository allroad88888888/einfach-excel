import type { CSSProperties, FocusEvent, KeyboardEvent, PointerEvent } from 'react'
import { useEffect, useRef } from 'react'
import type { DemoCellEdit } from './use-demo-cell-edit'
import './cell-editor.css'

export interface DemoCellEditorProps {
  readonly edit: DemoCellEdit
  readonly focusGrid: () => void
  readonly rowStart: number
}

/** Renders the active in-cell input over its Rust-projected grid cell. */
export function DemoCellEditor({ edit, focusGrid, rowStart }: DemoCellEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const committingRef = useRef(false)
  const suppressBlurRef = useRef(false)
  const cell = edit.activeCell

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
    inputRef.current?.select()
  }, [cell?.col, cell?.row])

  if (cell === null) return null

  const commitOnce = async (restoreKeyboardFocus: boolean) => {
    if (committingRef.current || edit.busy) return
    committingRef.current = true
    try {
      const outcome = await edit.commit()
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
      edit.cancel()
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

  return (
    <div className="cell-editor" onBlur={onBlur} onPointerDown={stopPointer} style={style}>
      <input
        ref={inputRef}
        aria-label="Cell editor"
        disabled={edit.busy}
        onChange={(event) => edit.setDraft(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        value={edit.draft}
      />
      {edit.feedback && (
        <div className="cell-editor-feedback" role="alert">
          <span>{edit.feedback.message}</span>
          {edit.canRetryRefresh && (
            <button type="button" onClick={() => void edit.retryRefresh()}>Retry refresh</button>
          )}
        </div>
      )}
    </div>
  )
}
