import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  cancelEditingAtom,
  commitCellEditingAtom,
  editingCommitLifecycleAtom,
  editingDraftAtom,
  editingSessionAtom,
  projectionSnapshotAtom,
  selectionSnapshotAtom,
  startCellEditingFromProjectionAtom,
} from '@einfach/spreadsheet-ui-core'
import type { FocusEvent, FormEvent, KeyboardEvent } from 'react'
import './formula-bar.css'

function columnLabel(index: number): string {
  return String.fromCharCode(65 + index)
}

function selectionLabel(range: {
  colEnd: number
  colStart: number
  rowEnd: number
  rowStart: number
}): string {
  const start = `${columnLabel(range.colStart)}${range.rowStart + 1}`
  const end = `${columnLabel(range.colEnd)}${range.rowEnd + 1}`
  return start === end ? start : `${start}:${end}`
}

const BUSY_EDITING_STATUSES = new Set([
  'pending',
  'local-acknowledged',
  'refreshing',
  'refresh-failed',
  'outcome-unknown',
])

/** Edits the active cell through the same atom session as the in-cell editor. */
export function FormulaBar() {
  const selection = useAtomValue(selectionSnapshotAtom)
  const projection = useAtomValue(projectionSnapshotAtom).result
  const editingSession = useAtomValue(editingSessionAtom)
  const editingDraft = useAtomValue(editingDraftAtom)
  const editingLifecycle = useAtomValue(editingCommitLifecycleAtom)
  const startEditing = useSetAtom(startCellEditingFromProjectionAtom)
  const setEditingDraft = useSetAtom(editingDraftAtom)
  const commitEditing = useSetAtom(commitCellEditingAtom)
  const cancelEditing = useSetAtom(cancelEditingAtom)
  const activeCell = selection.activeCell
  const activeSheetId = projection?.kind === 'visible-window'
    ? projection.sheetId
    : activeCell.sheetId
  const selectedCell =
    projection?.kind === 'visible-window'
      ? projection.cells.find(
          (cell) => cell.row === activeCell.row && cell.col === activeCell.col,
        )
      : undefined
  const editingActiveCell =
    editingSession.source?.sheetId === activeSheetId &&
    editingSession.source.cell.row === activeCell.row &&
    editingSession.source.cell.col === activeCell.col
  const value = editingActiveCell
    ? editingDraft
    : (selectedCell?.formula ?? selectedCell?.displayValue ?? '')
  const busy = BUSY_EDITING_STATUSES.has(editingLifecycle.status)

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
  const updateFormula = (event: FormEvent<HTMLInputElement>) => {
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
  const commitFormula = (event: FocusEvent<HTMLInputElement>) => {
    if (event.relatedTarget?.closest('[data-cell-editor]')) return
    void commitEditing()
  }
  const handleFormulaKey = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelEditing()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      void commitEditing()
    }
  }

  return (
    <div className="formula-bar">
      <output className="name-box" aria-label="Selected range">
        {selectionLabel(selection.range)}
      </output>
      <span className="formula-divider" aria-hidden="true" />
      <span className="insert-function" aria-hidden="true">
        fx
      </span>
      <input
        aria-label="Active cell value"
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
        value={value}
      />
    </div>
  )
}
