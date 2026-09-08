import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeWorkbookSheetAtom,
  projectedFreezeAtom,
  selectionSnapshotAtom,
  selectGridHeaderAtom,
} from '@einfach/spreadsheet-ui-core'
import type { CSSProperties } from 'react'
import { GridHeading } from './GridHeading'

/** 渲染可滚动表头；冻结的标题由固定区域渲染，避免同一个标题出现两次。 */
export function GridHeaders({
  rowStart,
  rowHeights,
  columnWidths,
  rowStyle,
  focusGrid,
}: {
  rowStart: number
  rowHeights: readonly number[]
  columnWidths: readonly number[]
  rowStyle: CSSProperties
  focusGrid: () => void
}) {
  const sheet = useAtomValue(activeWorkbookSheetAtom)
  const selection = useAtomValue(selectionSnapshotAtom)
  const freeze = useAtomValue(projectedFreezeAtom)
  const select = useSetAtom(selectGridHeaderAtom)
  const cols = freeze?.sheetId === sheet?.id ? (freeze?.cols ?? 0) : 0
  let columnTrack = 0
  return (
    <>
      <button
        className="sheet-corner"
        type="button"
        aria-label="Select all cells"
        aria-pressed={selection.selection.kind === 'all'}
        onPointerDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onClick={async () => {
          if (sheet && (await select({ kind: 'all', sheetId: sheet.id }))) focusGrid()
        }}
      >
        <span aria-hidden="true">◢</span>
      </button>
      <div className="column-headers" role="row">
        {columnWidths.map((width, col) => {
          if (width === 0) return null
          columnTrack++
          return col < cols ? null : (
            <GridHeading
              key={col}
              axis="column"
              index={col}
              focusGrid={focusGrid}
              style={{ gridColumn: columnTrack }}
            />
          )
        })}
      </div>
      <div className="row-headers grid-window" style={rowStyle}>
        {rowHeights.map((height, index) =>
          height === 0 ? null : (
            <GridHeading key={index} axis="row" index={rowStart + index} focusGrid={focusGrid} />
          ),
        )}
      </div>
    </>
  )
}
