import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  cancelEditingAtom,
  commitCellEditingAtom,
  editingCommitFeedback,
  editingCommitLifecycleAtom,
  editingDraftAtom,
  insertEditingLineBreakAtom,
  editingSessionAtom,
  projectionSnapshotAtom,
  selectionSnapshotAtom,
  startCellEditingFromProjectionAtom,
} from '@einfach/spreadsheet-ui-core'
import type { FocusEvent, FormEvent, KeyboardEvent } from 'react'
import { flushSync } from 'react-dom'
import { NameBox } from './NameBox'
import './formula-bar.css'

/** Edits the active cell through the same atom session as the in-cell editor. */
export function FormulaBar() {
  const selection = useAtomValue(selectionSnapshotAtom)
  const projection = useAtomValue(projectionSnapshotAtom).result
  const editingSession = useAtomValue(editingSessionAtom)
  const editingDraft = useAtomValue(editingDraftAtom)
  const editingLifecycle = useAtomValue(editingCommitLifecycleAtom)
  const startEditing = useSetAtom(startCellEditingFromProjectionAtom)
  const setEditingDraft = useSetAtom(editingDraftAtom)
  const insertLineBreak = useSetAtom(insertEditingLineBreakAtom)
  const commitEditing = useSetAtom(commitCellEditingAtom)
  const cancelEditing = useSetAtom(cancelEditingAtom)
  const activeCell = selection.activeCell
  const activeSheetId =
    projection?.kind === 'visible-window' ? projection.sheetId : activeCell.sheetId
  const selectedCell =
    projection?.kind === 'visible-window'
      ? projection.cells.find((cell) => cell.row === activeCell.row && cell.col === activeCell.col)
      : undefined
  const editingActiveCell =
    editingSession.source?.sheetId === activeSheetId &&
    editingSession.source.cell.row === activeCell.row &&
    editingSession.source.cell.col === activeCell.col
  const value = editingActiveCell
    ? editingDraft
    : (selectedCell?.inputText ?? selectedCell?.formula ?? selectedCell?.displayValue ?? '')
  const busy =
    editingLifecycle.status === 'pending' || editingLifecycle.status === 'outcome-unknown'
  const feedback =
    editingActiveCell && editingSession.source?.source === 'formula-bar'
      ? editingCommitFeedback(editingLifecycle)
      : null

  const beginFormulaEditing = () => {
    if (busy) return
    if (editingActiveCell) {
      setEditingDraft({ draft: editingDraft, source: 'formula-bar' })
      return
    }
    startEditing({
      sheetId: activeSheetId,
      cell: { row: activeCell.row, col: activeCell.col },
      source: 'formula-bar',
    })
  }
  const updateFormula = (event: FormEvent<HTMLTextAreaElement>) => {
    if (!editingActiveCell) {
      const started = startEditing({
        sheetId: activeSheetId,
        cell: { row: activeCell.row, col: activeCell.col },
        source: 'formula-bar',
      })
      if (!started) return
    }
    setEditingDraft({ draft: event.currentTarget.value, source: 'formula-bar' })
  }
  const commitFormula = (event: FocusEvent<HTMLTextAreaElement>) => {
    if (event.relatedTarget?.closest('[data-cell-editor]')) return
    void commitEditing()
  }
  const handleFormulaKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation()
    // 输入法确认键属于浏览器；229 覆盖部分浏览器 compositionend 后的确认事件。
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === 'Enter' && event.altKey) {
      event.preventDefault()
      const input = event.currentTarget
      let caret: number | null = null
      flushSync(() => {
        caret = insertLineBreak({ start: input.selectionStart, end: input.selectionEnd })
      })
      if (caret !== null) input.setSelectionRange(caret, caret)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelEditing()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      void commitEditing()
    }
  }

  return (
    <>
      <div className="formula-bar">
        <NameBox />
        <span className="formula-divider" aria-hidden="true" />
        <span className="insert-function" aria-hidden="true">
          fx
        </span>
        <textarea
          aria-label="Active cell value"
          aria-invalid={feedback ? true : undefined}
          aria-describedby={feedback ? 'formula-edit-feedback' : undefined}
          autoComplete="off"
          className="formula-value"
          data-formula-input="true"
          disabled={busy}
          id="formula-input"
          name="formula-input"
          onBlur={commitFormula}
          onFocus={beginFormulaEditing}
          onInput={updateFormula}
          onKeyDown={handleFormulaKey}
          onMouseDown={beginFormulaEditing}
          spellCheck={false}
          rows={Math.min(4, value.split('\n').length)}
          value={value}
        />
      </div>
      {feedback && (
        <p className="formula-edit-feedback" id="formula-edit-feedback" role="alert">
          {feedback.message}
        </p>
      )}
    </>
  )
}
