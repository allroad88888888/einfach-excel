import { useLingui } from '@lingui/react/macro'
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
  const { t } = useLingui()
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
        aria-label={t`Select all cells`}
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
        {/* 用真实行作身份，避免切窗时把正在点击的行头复用成另一行。 */}
        {rowHeights.map((height, index) =>
          height === 0 ? null : (
            <GridHeading
              key={rowStart + index}
              axis="row"
              index={rowStart + index}
              focusGrid={focusGrid}
            />
          ),
        )}
      </div>
    </>
  )
}
