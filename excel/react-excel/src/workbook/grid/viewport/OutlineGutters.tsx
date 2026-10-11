import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeWorkbookSheetAtom,
  editingSessionAtom,
  getAxisOffsetForIndex,
  nativeOutlineAtom,
  nativeOutlineFeedbackAtom,
  nativeOutlineLevels,
  projectedFreezeAtom,
  projectionSnapshotAtom,
  runNativeOutlineAtom,
  viewportGeometrySizesAtom,
  viewportMetricsAtom,
  toA1,
} from '@einfach/spreadsheet-ui-core'
import type { CSSProperties } from 'react'
import {
  WORKBOOK_GRID_COLUMN_WIDTH,
  WORKBOOK_GRID_ROW_HEADER_WIDTH,
  WORKBOOK_GRID_ROW_HEIGHT,
} from './workbook-grid-config'
import './outline.css'

const STEP = 20

/** 大纲放在滚动容器外；只投影像素位置，不进入格子事件或保存分组副本。 */
export function OutlineGutters({ focusGrid }: { readonly focusGrid: () => void }) {
  const outline = useAtomValue(nativeOutlineAtom)
  const sheet = useAtomValue(activeWorkbookSheetAtom)
  const metrics = useAtomValue(viewportMetricsAtom)
  const sizes = useAtomValue(viewportGeometrySizesAtom)
  const freeze = useAtomValue(projectedFreezeAtom)
  const feedback = useAtomValue(nativeOutlineFeedbackAtom)
  const editing = useAtomValue(editingSessionAtom).source !== null
  const projection = useAtomValue(projectionSnapshotAtom)
  const run = useSetAtom(runNativeOutlineAtom)
  if (!sheet || (!outline.rows.length && !outline.columns.length)) return null
  const rows = nativeOutlineLevels(outline.rows),
    columns = nativeOutlineLevels(outline.columns)
  const rowDepth = Math.max(0, ...rows.map((g) => g.level))
  const columnDepth = Math.max(0, ...columns.map((g) => g.level))
  const width = rowDepth ? (rowDepth + 1) * STEP : 0
  const height = columnDepth ? (columnDepth + 1) * STEP : STEP
  const disabled = feedback.busy || editing || projection.status !== 'ready'
  const showLevel = (axis: 'row' | 'column', level: number) => {
    void run({ axis, action: { kind: 'show-level', level } }).then(focusGrid)
  }
  return (
    <>
      <div className="outline-corner" style={{ width, height }} aria-label="Row outline levels">
        {rowDepth > 0 &&
          Array.from({ length: rowDepth + 1 }, (_, i) => (
            <button
              key={i}
              type="button"
              disabled={disabled}
              aria-label={`Show row outline level ${i + 1}`}
              onClick={() => showLevel('row', i + 1)}
            >
              {i + 1}
            </button>
          ))}
      </div>
      {(
        [
          ['row', rows],
          ['column', columns],
        ] as const
      ).map(([axis, groups]) => {
        const vertical = axis === 'row'
        const count = vertical ? sheet.rowCount : sheet.colCount
        const fallback = vertical ? WORKBOOK_GRID_ROW_HEIGHT : WORKBOOK_GRID_COLUMN_WIDTH
        const overrides = (vertical ? sizes.rowHeightsBySheet : sizes.colWidthsBySheet)[sheet.id]
        const offset = (index: number) => getAxisOffsetForIndex(index, count, fallback, overrides)
        const header = vertical ? WORKBOOK_GRID_ROW_HEIGHT : WORKBOOK_GRID_ROW_HEADER_WIDTH
        const scroll = vertical ? metrics.scrollTop : metrics.scrollLeft
        const extent = header + (vertical ? metrics.viewportHeight : metrics.viewportWidth)
        const frozen = freeze?.sheetId === sheet.id ? (vertical ? freeze.rows : freeze.cols) : 0
        const frozenEnd = header + offset(frozen)
        const position = (index: number, fixed: boolean) =>
          header + offset(index) - (fixed ? 0 : scroll)
        return (
          <div
            key={axis}
            className={`outline-gutter outline-${axis}`}
            aria-label={`${vertical ? 'Row' : 'Column'} outline`}
            style={vertical ? { width } : { height }}
          >
            {!vertical && columnDepth > 0 && (
              <div className="outline-column-levels">
                {Array.from({ length: columnDepth + 1 }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={disabled}
                    aria-label={`Show column outline level ${i + 1}`}
                    onClick={() => showLevel('column', i + 1)}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
            {groups
              .filter((group) => !group.hiddenByParent)
              .map((group) => {
                const cross = group.level * STEP - STEP / 2
                const end = position(group.end + 1, group.end < frozen)
                const min = group.end < frozen ? header : frozenEnd
                const visibleButton = end >= min && end <= extent
                const buttonPosition = Math.min(Math.max(end - 9, min), extent - STEP)
                // 冻结前缀和滚动正文分别裁线；跨冻结组不画过被固定内容遮住的部分。
                const segments = [
                  { start: group.start, end: Math.min(group.end + 1, frozen), fixed: true },
                  { start: Math.max(group.start, frozen), end: group.end + 1, fixed: false },
                ]
                const label = vertical
                  ? `rows ${group.start + 1}–${group.end + 1}`
                  : `columns ${toA1(0, group.start).slice(0, -1)}–${toA1(0, group.end).slice(0, -1)}`
                return (
                  <div key={group.index}>
                    {!group.collapsed &&
                      segments.map((segment, i) => {
                        const start = Math.max(
                          position(segment.start, segment.fixed),
                          segment.fixed ? header : frozenEnd,
                        )
                        const finish = Math.min(
                          position(segment.end, segment.fixed),
                          segment.fixed ? frozenEnd : extent,
                        )
                        if (segment.start >= segment.end || finish <= start) return null
                        return (
                          <span
                            key={i}
                            aria-hidden="true"
                            className="outline-line"
                            style={
                              (vertical
                                ? { left: cross, top: start, height: finish - start }
                                : {
                                    top: cross,
                                    left: start,
                                    width: finish - start,
                                  }) as CSSProperties
                            }
                          />
                        )
                      })}
                    {visibleButton && (
                      <button
                        type="button"
                        className="outline-toggle"
                        disabled={disabled}
                        style={
                          vertical
                            ? { left: cross - 9, top: buttonPosition }
                            : { top: cross - 9, left: buttonPosition }
                        }
                        aria-label={`${group.collapsed ? 'Expand' : 'Collapse'} ${label}, level ${group.level}`}
                        aria-expanded={!group.collapsed}
                        title={label}
                        onClick={() =>
                          void run({
                            axis,
                            action: {
                              kind: 'set-collapsed',
                              index: group.index,
                              collapsed: !group.collapsed,
                            },
                          }).then(focusGrid)
                        }
                      >
                        {group.collapsed ? '+' : '−'}
                      </button>
                    )}
                  </div>
                )
              })}
          </div>
        )
      })}
    </>
  )
}
