import { useLingui } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { useEffect } from 'react'
import {
  activeWorkbookSheetAtom, chooseNativeValidationItemAtom, editingSessionAtom,
  getViewportRangeRectangle, mergeRangeAt, nativeValidationListAtom,
  nativeValidationTargetAtom, projectedFreezeAtom, projectionSnapshotAtom,
  refreshNativeValidationListAtom,
  viewportGeometrySizesAtom, viewportMetricsAtom,
} from '@einfach/spreadsheet-ui-core'
import { WORKBOOK_GRID_COLUMN_WIDTH, WORKBOOK_GRID_ROW_HEADER_WIDTH,
  WORKBOOK_GRID_ROW_HEIGHT } from '../viewport/workbook-grid-config'
import './cell-validation-list.css'

/** 原生 select 只负责选项交互；选项写入复用普通编辑 command。 */
export function CellValidationList({ focusGrid }: { readonly focusGrid: () => void }) {
  const { t } = useLingui()
  const target = useAtomValue(nativeValidationTargetAtom)
  const state = useAtomValue(nativeValidationListAtom)
  const projection = useAtomValue(projectionSnapshotAtom)
  const sheet = useAtomValue(activeWorkbookSheetAtom)
  const editing = useAtomValue(editingSessionAtom)
  const viewport = useAtomValue(viewportMetricsAtom)
  const sizes = useAtomValue(viewportGeometrySizesAtom)
  const freeze = useAtomValue(projectedFreezeAtom)
  const refresh = useSetAtom(refreshNativeValidationListAtom)
  const choose = useSetAtom(chooseNativeValidationItemAtom)
  // 同一活动格滚动不重读规则；值／规则／历史变更后的原生 revision 才触发刷新。
  useEffect(() => { if (state.needsRefresh) void refresh() }, [refresh, state.needsRefresh])
  if (!target || !sheet || editing.source || projection.status !== 'ready' ||
    state.busy || state.rule?.kind !== 'list') return null
  const result = projection.result
  const range = result?.kind === 'visible-window'
    ? mergeRangeAt(result.mergedRanges ?? [], target) : undefined
  const metrics = { ...viewport, sheetId: sheet.id, rowCount: sheet.rowCount,
    colCount: sheet.colCount, rowHeight: WORKBOOK_GRID_ROW_HEIGHT,
    colWidth: WORKBOOK_GRID_COLUMN_WIDTH }
  const rect = getViewportRangeRectangle(metrics, sizes, range ?? {
    rowStart: target.row, rowEnd: target.row, colStart: target.col, colEnd: target.col })
  const frozenRow = freeze?.sheetId === sheet.id && target.row < freeze.rows
  const frozenCol = freeze?.sheetId === sheet.id && target.col < freeze.cols
  const width = Math.min(22, rect.width)
  const height = Math.min(24, rect.height)
  const top = WORKBOOK_GRID_ROW_HEIGHT + rect.top + (frozenRow ? metrics.scrollTop : 0)
  const left = WORKBOOK_GRID_ROW_HEADER_WIDTH + rect.left + rect.width - width +
    (frozenCol ? metrics.scrollLeft : 0)
  const viewTop = metrics.scrollTop + WORKBOOK_GRID_ROW_HEIGHT
  const viewLeft = metrics.scrollLeft + WORKBOOK_GRID_ROW_HEADER_WIDTH
  const clipTop = Math.max(0, viewTop + (frozenRow ? 0 : freeze?.height ?? 0) - top)
  const clipLeft = Math.max(0, viewLeft + (frozenCol ? 0 : freeze?.width ?? 0) - left)
  const clipRight = Math.max(0, left + width - viewLeft - metrics.viewportWidth)
  const clipBottom = Math.max(0, top + height - viewTop - metrics.viewportHeight)
  if (width <= clipLeft + clipRight || height <= clipTop + clipBottom) return null
  return <select className="cell-validation-list" aria-label={t`Choose cell value`}
    title={t`Choose a value from the validation list`} value=""
    style={{ top, left, width, height,
      clipPath: `inset(${clipTop}px ${clipRight}px ${clipBottom}px ${clipLeft}px)` }}
    onPointerDown={(event) => event.stopPropagation()}
    onDoubleClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => event.stopPropagation()}
    onChange={(event) => {
      void choose(Number(event.currentTarget.value)).then((outcome) => {
        if (outcome === 'completed' && document.activeElement === document.body) focusGrid()
      })
    }}>
    <option value="" disabled />
    {state.rule.items.map((item, index) => <option key={index} value={index}>{item}</option>)}
  </select>
}
