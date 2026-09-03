import { useAtomValue } from '@einfach/react'
import { projectionSnapshotAtom, selectionSnapshotAtom } from '@einfach/spreadsheet-ui-core'
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

/** Shows the active range address and active-cell value. */
export function FormulaBar() {
  const selection = useAtomValue(selectionSnapshotAtom)
  const projection = useAtomValue(projectionSnapshotAtom).result
  const selectedCell =
    projection?.kind === 'visible-window'
      ? projection.cells.find(
          (cell) => cell.row === selection.range.rowStart && cell.col === selection.range.colStart,
        )
      : undefined
  const value = selectedCell?.formula ?? selectedCell?.displayValue ?? ''

  return (
    <div className="formula-bar">
      <output className="name-box" aria-label="Selected range">
        {selectionLabel(selection.range)}
      </output>
      <span className="formula-divider" aria-hidden="true" />
      <span className="insert-function" aria-hidden="true">
        fx
      </span>
      <output className="formula-value" aria-label="Active cell value">
        {value}
      </output>
    </div>
  )
}
