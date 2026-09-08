import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeWorkbookSheetAtom,
  getColumnLabel,
  selectGridHeaderAtom,
  selectionSnapshotAtom,
} from '@einfach/spreadsheet-ui-core'
import type { CSSProperties } from 'react'

/** 普通表头与冻结表头共用选中样式、Shift 扩选及整行整列命令。 */
export function GridHeading({
  axis,
  index,
  focusGrid,
  style,
}: {
  axis: 'row' | 'column'
  index: number
  focusGrid: () => void
  style?: CSSProperties
}) {
  const sheet = useAtomValue(activeWorkbookSheetAtom)
  const selection = useAtomValue(selectionSnapshotAtom)
  const select = useSetAtom(selectGridHeaderAtom)
  const label = axis === 'row' ? String(index + 1) : getColumnLabel(index)
  const selected =
    axis === 'row'
      ? index >= selection.range.rowStart && index <= selection.range.rowEnd
      : index >= selection.range.colStart && index <= selection.range.colEnd
  return (
    <button
      className={selected ? 'sheet-heading heading-selected' : 'sheet-heading'}
      role={axis === 'column' ? 'columnheader' : undefined}
      type="button"
      aria-label={`Select ${axis} ${label}`}
      aria-selected={axis === 'column' ? selected : undefined}
      aria-pressed={axis === 'row' ? selected : undefined}
      style={style}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onClick={async (event) => {
        if (
          sheet &&
          (await select({ kind: axis, sheetId: sheet.id, index, extend: event.shiftKey }))
        )
          focusGrid()
      }}
    >
      {label}
    </button>
  )
}
