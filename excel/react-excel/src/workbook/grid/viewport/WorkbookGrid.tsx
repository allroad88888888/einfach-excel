import { useLingui, Trans } from '@lingui/react/macro'
import type { I18n } from '@lingui/core'
import { translateFeedback } from '../../../i18n/translate-feedback'
import { useAtomValue } from '@einfach/react'
import {
  activeWorkbookSheetAtom,
  formatPainterAtom,
  getAxisOffsetForIndex,
  getViewportRowHeight,
  getViewportColumnWidth,
  viewportGeometrySizesAtom,
  projectedFreezeAtom,
  type WorkbookDocumentSheet,
} from '@einfach/spreadsheet-ui-core'
import type { CSSProperties } from 'react'
import { useWorkbookViewport, type WorkbookViewport } from '../../projection/use-workbook-viewport'
import { CellRenderer } from './CellRenderer'
import { CellEditor } from '../editor/CellEditor'
import { CellValidationList } from '../editor/CellValidationList'
import { ValidationInputMessage } from '../../advanced-validation/ValidationInputMessage'
import { ValidationErrorAlert } from '../../advanced-validation/ValidationErrorAlert'
import { ResizeGuide } from './ResizeGuide'
import {
  WORKBOOK_GRID_COLUMN_WIDTH,
  WORKBOOK_GRID_ROW_HEADER_WIDTH,
  WORKBOOK_GRID_ROW_HEIGHT,
} from './workbook-grid-config'
import { useWorkbookGridEvents } from './use-workbook-grid-events'
import { useGridClipboard } from '../../clipboard/use-grid-clipboard'
import { useWorkbookGridWindow } from './use-workbook-grid-window'
import { GridHeaders } from './GridHeaders'
import { FrozenGrid } from './FrozenGrid'
import { OutlineGutters } from './OutlineGutters'
import { FillHandle } from '../fill/FillHandle'
import './grid.css'

function rowNumbers(rowStart: number, rowEnd: number): readonly number[] {
  return Array.from(
    { length: Math.max(0, rowEnd - rowStart + 1) },
    (_, index) => rowStart + index + 1,
  )
}

function projectionState(viewport: WorkbookViewport, i18n: I18n) {
  if (viewport.status === 'error') {
    return (
      <div className="grid-projection-state" role="alert">
        {translateFeedback(i18n, viewport.error?.message)}
      </div>
    )
  }
  if (viewport.status !== 'ready' && !viewport.hasResult) {
    return (
      <div className="grid-projection-state" role="status"><Trans>
        Loading visible cells…
      </Trans></div>
    )
  }
  return null
}

function WorkbookGridProjection({ activeSheet }: { readonly activeSheet: WorkbookDocumentSheet }) {
  const { t, i18n } = useLingui()
  const painter = useAtomValue(formatPainterAtom)
  const freeze = useAtomValue(projectedFreezeAtom)
  const sizeOverrides = useAtomValue(viewportGeometrySizesAtom)
  const gridWindow = useWorkbookGridWindow()
  const viewport = useWorkbookViewport({
    sheetId: activeSheet.id,
    window: gridWindow,
    rowCount: activeSheet.rowCount,
    colCount: activeSheet.colCount,
  })
  const events = useWorkbookGridEvents(viewport)
  const clipboard = useGridClipboard(viewport.retained)
  const frozenRows = freeze?.sheetId === activeSheet.id ? freeze.rows : 0
  const frozenCols = freeze?.sheetId === activeSheet.id ? freeze.cols : 0
  const bodyWindow = {
    ...viewport.window,
    rowStart: Math.max(viewport.window.rowStart, frozenRows),
    colStart: Math.max(viewport.window.colStart, frozenCols),
  }
  const rows = rowNumbers(bodyWindow.rowStart, bodyWindow.rowEnd)
  const rowHeights = sizeOverrides.rowHeightsBySheet[activeSheet.id]
  // 只取投影窗口内的列：空白工作簿有 16384 列，整行表头会让一次替换卡住主线程数秒。
  const columnCount = Math.max(0, bodyWindow.colEnd - bodyWindow.colStart + 1)
  const columnWidths = Array.from({ length: columnCount }, (_, index) =>
    getViewportColumnWidth(
      sizeOverrides, activeSheet.id, bodyWindow.colStart + index, WORKBOOK_GRID_COLUMN_WIDTH))
  const columnOffset = (index: number) =>
    getAxisOffsetForIndex(
      index,
      activeSheet.colCount,
      WORKBOOK_GRID_COLUMN_WIDTH,
      sizeOverrides.colWidthsBySheet[activeSheet.id],
    )
  const sheetContentWidth = columnOffset(activeSheet.colCount)
  const visibleRowHeights = rows.map((_, index) =>
    getViewportRowHeight(
      sizeOverrides,
      activeSheet.id,
      bodyWindow.rowStart + index,
      WORKBOOK_GRID_ROW_HEIGHT,
    ),
  )
  const sheetContentHeight = getAxisOffsetForIndex(
    activeSheet.rowCount,
    activeSheet.rowCount,
    WORKBOOK_GRID_ROW_HEIGHT,
    rowHeights,
  )
  // 等待新投影时，旧格仍留在真实坐标；搬到新窗口会让内容先跳一下再换回来。
  const windowOffset = getAxisOffsetForIndex(
    Math.max(viewport.window.rowStart, frozenRows),
    activeSheet.rowCount,
    WORKBOOK_GRID_ROW_HEIGHT,
    rowHeights,
  )
  const frameStyle = {
    '--grid-column-width': `${WORKBOOK_GRID_COLUMN_WIDTH}px`,
    '--grid-row-height': `${WORKBOOK_GRID_ROW_HEIGHT}px`,
    '--grid-row-header-width': `${WORKBOOK_GRID_ROW_HEADER_WIDTH}px`,
    '--grid-sheet-content-width': `${sheetContentWidth}px`,
    '--grid-sheet-height': `${sheetContentHeight + WORKBOOK_GRID_ROW_HEIGHT}px`,
    '--grid-sheet-width': `${sheetContentWidth + WORKBOOK_GRID_ROW_HEADER_WIDTH}px`,
  } as CSSProperties
  const windowStyle = {
    '--grid-window-offset': `${windowOffset}px`,
    '--grid-window-row-heights': visibleRowHeights
      .filter((height) => height > 0)
      .map((height) => `${height}px`)
      .join(' '),
  } as CSSProperties
  const windowOffsetX = `${columnOffset(bodyWindow.colStart)}px`
  const columnWindowStyle = {
    '--grid-window-offset-x': windowOffsetX,
    '--grid-window-column-widths': columnWidths
      .filter((width) => width > 0)
      .map((width) => `${width}px`)
      .join(' '),
  } as CSSProperties
  const cellWindowStyle = {
    ...windowStyle,
    '--grid-window-offset-x': windowOffsetX,
    '--grid-window-width': `${
      columnOffset(Math.max(viewport.window.colEnd + 1, frozenCols)) -
      columnOffset(Math.max(viewport.window.colStart, frozenCols))
    }px`,
  } as CSSProperties

  return (
    <section className="worksheet-panel" aria-label={t`${activeSheet.name} worksheet`}>
      <OutlineGutters focusGrid={events.focusGrid} />
      {(sheetContentHeight === 0 || sheetContentWidth === 0) && (
        <div className="grid-visibility-state" role="status">{sheetContentHeight === 0
          ? t`All rows are hidden. Use Hide / Unhide to restore them.`
          : t`All columns are hidden. Use Hide / Unhide to restore them.`}</div>
      )}
      <div
        ref={events.scrollRef}
        className="sheet-scroll"
        data-testid="sheet-scroll"
        onScroll={events.onScroll}
      >
        <div
          className="sheet-grid-frame grid-viewport-frame"
          data-frozen-rows={frozenRows}
          data-format-painter={painter.mode === 'idle' ? undefined : painter.mode}
          data-frozen-cols={frozenCols}
          style={frameStyle}
          onCopy={clipboard.onCopy}
          onCut={clipboard.onCut}
          onPaste={clipboard.onPaste}
          onDoubleClick={events.onDoubleClick}
          onKeyDown={events.onKeyDown}
          onPointerDown={events.onPointerDown}
          onPointerMove={events.onPointerMove}
          onPointerUp={events.onPointerUp}
          onPointerCancel={events.onPointerCancel}
          onLostPointerCapture={events.onPointerCancel}
        >
          <GridHeaders
            rowStart={bodyWindow.rowStart}
            rowHeights={visibleRowHeights}
            colStart={bodyWindow.colStart}
            columnWidths={columnWidths}
            rowStyle={windowStyle}
            columnStyle={columnWindowStyle}
            focusGrid={events.focusGrid}
          />
          <div
            ref={events.gridRef}
            className="grid-surface grid-window"
            data-workbook-grid="true"
            data-row-count={activeSheet.rowCount}
            data-projection-retained={viewport.retained ? 'true' : 'false'}
            aria-busy={viewport.retained}
            aria-label={t`${activeSheet.name} cells`}
            style={cellWindowStyle}
            tabIndex={viewport.retained ? -1 : 0}
          >
            {projectionState(viewport, i18n) ?? (
              <CellRenderer
                interactive={!viewport.retained}
                cells={viewport.cells}
                mergedRanges={viewport.mergedRanges}
                window={bodyWindow}
                rowHeights={visibleRowHeights}
                columnWidths={columnWidths}
              />
            )}
          </div>
          <FrozenGrid focusGrid={events.focusGrid} />
          <FillHandle scrollRef={events.scrollRef} focusGrid={events.focusGrid} />
          <CellEditor focusGrid={events.focusGrid} />
          <CellValidationList focusGrid={events.focusGrid} />
          <ResizeGuide />
        </div>
      </div>
      <div className="grid-validation-feedback">
        <ValidationInputMessage />
        <ValidationErrorAlert />
      </div>
    </section>
  )
}

/** Renders the visible Rust projection for the active workbook sheet. */
export function WorkbookGrid() {
  const activeSheet = useAtomValue(activeWorkbookSheetAtom)
  if (activeSheet === null) {
    return <div role="alert"><Trans>The active workbook sheet is unavailable.</Trans></div>
  }
  return <WorkbookGridProjection activeSheet={activeSheet} />
}
