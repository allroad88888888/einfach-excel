import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  editingSessionAtom,
  runRustHistoryAtom,
  rustHistoryPanelAtom,
  rustHistoryStateAtom,
  toA1,
  workbookDocumentAtom,
} from '@einfach/spreadsheet-ui-core'
import { useEffect, useId, useRef } from 'react'
import './history.css'

/** 历史列表只展示 Rust 的操作目录，不能在 React 回放工作簿数据。 */
export function HistoryTools() {
  const state = useAtomValue(rustHistoryStateAtom)
  const panel = useAtomValue(rustHistoryPanelAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const document = useAtomValue(workbookDocumentAtom)
  const run = useSetAtom(runRustHistoryAtom)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    const dialog = dialogRef.current
    const trigger = triggerRef.current
    if (!dialog || !panel.open) return
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => {
      dialog.close?.()
      trigger?.focus({ preventScroll: true })
    }
  }, [panel.open])
  return (
    <>
      <button
        className="tool-button"
        type="button"
        aria-label="Undo"
        title="Undo (Ctrl/⌘+Z)"
        disabled={editing || panel.busy || state.undoCount === 0}
        onClick={() => void run('undo')}
      >
        ↶
      </button>
      <button
        className="tool-button"
        type="button"
        aria-label="Redo"
        title="Redo (Ctrl/⌘+Shift+Z or Ctrl+Y)"
        disabled={editing || panel.busy || state.redoCount === 0}
        onClick={() => void run('redo')}
      >
        ↷
      </button>
      <button
        ref={triggerRef}
        className="tool-button"
        type="button"
        aria-label="Recent operations"
        title="Recent operations"
        onClick={() => void run('open')}
      >
        ◷
      </button>
      {panel.error && !panel.open && (
        <span className="history-error" role="alert">
          {panel.error}
        </span>
      )}
      {panel.open && (
        <dialog
          ref={dialogRef}
          className="history-dialog"
          aria-labelledby={`${id}-title`}
          onCancel={(event) => {
            event.preventDefault()
            void run('close')
          }}
        >
          <h2 id={`${id}-title`}>Recent operations</h2>
          <p>
            {state.undoCount} undo · {state.redoCount} redo
          </p>
          <p className="history-hint">
            Cell edits, formatting, clearing, paste, cut moves and row/column sizes. Up to 50 steps
            in this session.
          </p>
          {state.notice && (
            <p role="status" className="history-hint">
              {state.notice}
            </p>
          )}
          {state.entries.length === 0 ? (
            <p>No recorded operations yet.</p>
          ) : (
            <ol>
              {state.entries.map((entry, index) => (
                <li key={index} className={index < state.undoCount ? '' : 'history-undone'}>
                  <span>{entry.label}</span>
                  <small>
                    {document.sheets.find((sheet) => sheet.index === entry.sheetIndex)?.name} ·{' '}
                    {toA1(entry.range.rowStart, entry.range.colStart)}:
                    {toA1(entry.range.rowEnd, entry.range.colEnd)}
                    {index >= state.undoCount ? ' · Undone' : ''}
                  </small>
                </li>
              ))}
            </ol>
          )}
          {panel.error && (
            <p role="alert" className="history-error">
              {panel.error}
            </p>
          )}
          <button
            className="history-close"
            type="button"
            disabled={panel.busy}
            onClick={() => void run('close')}
          >
            Close history
          </button>
        </dialog>
      )}
    </>
  )
}
