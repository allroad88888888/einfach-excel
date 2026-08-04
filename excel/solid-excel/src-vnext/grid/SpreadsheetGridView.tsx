import { For, Show } from 'solid-js'
import { reportCommandFailure } from '../provider'
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
    getRemoteCursorsForSheet,
    getRemoteCursorStyle,
  } = runtime
  return (
    <div
      ref={(element) => { runtime.gridRoot = element }}
      class={`spreadsheet-grid ${gridProps.class ?? ''} ${showGridlines() ? '' : 'spreadsheet-grid--no-gridlines'} ${showHeadings() ? '' : 'spreadsheet-grid--no-headings'}`.replace(/\s+/g, ' ').trim()}
      data-show-gridlines={showGridlines() ? 'true' : 'false'}
      data-show-headings={showHeadings() ? 'true' : 'false'}
      data-testid={gridProps['data-testid'] ?? 'spreadsheet-grid'}
      tabIndex={0}
      style={{ position: 'relative' }}
      onKeyDown={(event) => {
        void handleGridKeyDown(event).catch((error: unknown) => reportCommandFailure(store, error))
      }}
    >
      <div ref={(element) => { runtime.scrollRoot = element }} class="spreadsheet-grid-scroll-viewport" style={getScrollViewportStyle()} onScroll={handleViewportScroll}>
        <SpreadsheetGridTable runtime={runtime} />
      </div>
      <Show when={freezeRowCount() > 0 || freezeColCount() > 0}>
        <svg class="spreadsheet-grid-freeze-boundary" aria-hidden="true" data-testid="freeze-boundary" width="100%" height="100%">
          <Show when={freezeRowCount() > 0}><line data-testid="freeze-boundary-horizontal" x1={0} x2="100%" y1={getFreezeBoundaryY()} y2={getFreezeBoundaryY()} /></Show>
          <Show when={freezeColCount() > 0}><line data-testid="freeze-boundary-vertical" x1={getFreezeBoundaryX()} x2={getFreezeBoundaryX()} y1={0} y2="100%" /></Show>
        </svg>
      </Show>
      <div class="spreadsheet-grid-overlay-layer" aria-hidden="true">
        <Show
          when={useSvgOverlayEnabled()}
          fallback={<SpreadsheetGridOverlay sheetId={gridProps.sheetId} getCellRect={getOverlayCellRect} getSurfaceSize={getOverlaySurfaceSize} getCells={getOverlayCells} getFreezeOrigin={getOverlayFreezeOrigin} getVisibleRows={getRows} getVisibleCols={getCols} />}
        >
          <SpreadsheetGridOverlaySvg sheetId={gridProps.sheetId} getCellRect={getOverlayCellRect} getSurfaceSize={getOverlaySurfaceSize} getCells={getOverlayCells} getFreezeOrigin={getOverlayFreezeOrigin} getVisibleRows={getRows} getVisibleCols={getCols} />
        </Show>
      </div>
      <For each={getRemoteCursorsForSheet()}>
        {(cursor) => <div class="spreadsheet-remote-cursor" data-testid={`remote-cursor-${cursor.participantId}`} style={getRemoteCursorStyle(cursor)} />}
      </For>
    </div>
  )
}
