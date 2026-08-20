import { createEffect, Show } from 'solid-js'
import { selectCellAtom } from '@einfach/spreadsheet-ui-core'
import { reportCommandFailure } from '../provider'
import { SpreadsheetPresenceOverlay } from '../presence'
import { syncGridActiveDescendant } from './focus-grid-active-descendant'
import { shouldLeaveGridOnTab } from './focus-grid-tab-boundary'
import { SpreadsheetGridFormatPainterCursor } from './SpreadsheetGridFormatPainterCursor'
import { SpreadsheetGridOverlay } from './SpreadsheetGridOverlay'
import { SpreadsheetGridOverlaySvg } from './SpreadsheetGridOverlaySvg'
import { SpreadsheetGridTable } from './SpreadsheetGridTable'
import { type GridRuntime } from './grid-runtime'

function useSvgOverlayEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).get('svgOverlay') === '1'
  } catch {
    return false
  }
}

/** Grid shell that binds the controller runtime to DOM references and overlays. */
export function SpreadsheetGridView(props: { runtime: GridRuntime }) {
  const { runtime } = props
  const {
    props: gridProps,
    store,
    showGridlines,
    showHeadings,
    getScrollViewportStyle,
    handleViewportScroll,
    handleGridKeyDown,
    freezeRowCount,
    freezeColCount,
    getFreezeBoundaryX,
    getFreezeBoundaryY,
    getOverlayCellRect,
    getOverlaySurfaceSize,
    getOverlayCells,
    getOverlayFreezeOrigin,
    getRows,
    getCols,
    resolveSelectionRect,
  } = runtime
  createEffect(() => {
    getRows()
    getCols()
    const selection = runtime.selectionSnapshot()
    if (
      !selection.activeCell.sheetId &&
      gridProps.viewport.rowCount > 0 &&
      gridProps.viewport.colCount > 0
    ) {
      store.setter(selectCellAtom, {
        sheetId: gridProps.sheetId,
        coord: { row: 0, col: 0 },
      })
      return
    }
    syncGridActiveDescendant({
      gridRoot: runtime.dom.gridRoot(),
      sheetId: gridProps.sheetId,
      activeCell: selection.activeCell,
      findMergeAnchorCovering: runtime.findMergeAnchorCovering,
    })
  })
  return (
    <div
      ref={runtime.dom.setGridRoot}
      class={`spreadsheet-grid ${gridProps.class ?? ''} ${showGridlines() ? '' : 'spreadsheet-grid--no-gridlines'} ${showHeadings() ? '' : 'spreadsheet-grid--no-headings'}`
        .replace(/\s+/g, ' ')
        .trim()}
      data-show-gridlines={showGridlines() ? 'true' : 'false'}
      data-show-headings={showHeadings() ? 'true' : 'false'}
      data-testid={gridProps['data-testid'] ?? 'spreadsheet-grid'}
      tabIndex={0}
      role="grid"
      aria-label="Spreadsheet grid"
      aria-rowcount={gridProps.viewport.rowCount}
      aria-colcount={gridProps.viewport.colCount}
      aria-multiselectable="true"
      style={{ position: 'relative' }}
      onKeyDown={(event) => {
        if (
          shouldLeaveGridOnTab(event, {
            sheetId: gridProps.sheetId,
            rowCount: gridProps.viewport.rowCount,
            colCount: gridProps.viewport.colCount,
            activeCell: runtime.selectionSnapshot().activeCell,
          })
        )
          return
        void handleGridKeyDown(event).catch((error: unknown) => reportCommandFailure(store, error))
      }}
    >
      <SpreadsheetGridFormatPainterCursor gridRoot={runtime.dom.gridRoot} />
      {/*
        tabIndex={-1}:Chrome 会把可滚动容器默认纳入 Tab 序,-1 把它按 Tab
        边界契约(94c269f,grid-tab-boundary.spec.ts)摘出来 —— 键盘滚动由
        grid 本体(role=grid, tabIndex=0)的方向键导航代理。代价是 axe 把
        "可编程聚焦的无角色 div"记为 grid 的非法子节点 + 不可聚焦滚动区,
        两条以设计冲突登记在 a11y-surfaces.spec.ts 的 KNOWN_ISSUES(带撤销
        条件),不要在这里加 role 绕 —— rowgroup/presentation 都会把违规
        转移到 tbody 的 required-parent 上。
      */}
      <div
        ref={runtime.dom.setScrollRoot}
        class="spreadsheet-grid-scroll-viewport"
        tabIndex={-1}
        style={getScrollViewportStyle()}
        onScroll={handleViewportScroll}
      >
        <SpreadsheetGridTable runtime={runtime} />
      </div>
      <Show when={freezeRowCount() > 0 || freezeColCount() > 0}>
        <svg
          class="spreadsheet-grid-freeze-boundary"
          aria-hidden="true"
          data-testid="freeze-boundary"
          width="100%"
          height="100%"
        >
          <Show when={freezeRowCount() > 0}>
            <line
              data-testid="freeze-boundary-horizontal"
              x1={0}
              x2="100%"
              y1={getFreezeBoundaryY()}
              y2={getFreezeBoundaryY()}
            />
          </Show>
          <Show when={freezeColCount() > 0}>
            <line
              data-testid="freeze-boundary-vertical"
              x1={getFreezeBoundaryX()}
              x2={getFreezeBoundaryX()}
              y1={0}
              y2="100%"
            />
          </Show>
        </svg>
      </Show>
      <div class="spreadsheet-grid-overlay-layer" aria-hidden="true">
        <Show
          when={useSvgOverlayEnabled()}
          fallback={
            <SpreadsheetGridOverlay
              sheetId={gridProps.sheetId}
              getCellRect={getOverlayCellRect}
              getSurfaceSize={getOverlaySurfaceSize}
              getCells={getOverlayCells}
              getFreezeOrigin={getOverlayFreezeOrigin}
              getVisibleRows={getRows}
              getVisibleCols={getCols}
            />
          }
        >
          <SpreadsheetGridOverlaySvg
            sheetId={gridProps.sheetId}
            getCellRect={getOverlayCellRect}
            getSurfaceSize={getOverlaySurfaceSize}
            getCells={getOverlayCells}
            getFreezeOrigin={getOverlayFreezeOrigin}
            getVisibleRows={getRows}
            getVisibleCols={getCols}
          />
        </Show>
      </div>
      <SpreadsheetPresenceOverlay
        activeSheetId={gridProps.sheetId}
        resolveSelectionRect={resolveSelectionRect}
        cursorTestIdPrefix="remote-cursor"
      />
    </div>
  )
}
