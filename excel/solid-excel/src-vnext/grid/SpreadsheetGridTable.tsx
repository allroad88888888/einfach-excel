import { openFilterDropdownAtom, selectAllAtom } from '@einfach/spreadsheet-ui-core'
import { For, Show } from 'solid-js'
import { SpreadsheetGridDataRow } from './SpreadsheetGridDataRow'
import { SpreadsheetGridOutline } from './SpreadsheetGridOutline'
import { getColumnLabel } from './grid-constants'
import { type GridRuntime } from './grid-runtime'

/** Renders the virtualized table, including row and column headers. */
export function SpreadsheetGridTable(props: { runtime: GridRuntime }) {
  const { runtime } = props
  const {
    props: gridProps,
    store,
    getTotalTableWidth,
    getRows,
    getCols,
    hasColOutline,
    hasRowOutline,
    showHeadings,
    getColOutlineBandHeight,
    getRowOutlineGutterWidth,
    getLeftSpacerWidth,
    getRightSpacerWidth,
    getColumnStyle,
    isColumnSelected,
    freezeColCount,
    colHasFilterRule,
    bumpRender,
    startColumnResize,
    autoFitColumn,
    getTopSpacerHeight,
    getBottomSpacerHeight,
    getVirtualColumnSpan,
    getCornerStyle,
    isAllSelected,
    focusGrid,
    openContextMenu,
  } = runtime
  return (
    <table class="spreadsheet-grid-table" style={{ width: `${getTotalTableWidth()}px`, 'min-width': `${getTotalTableWidth()}px` }}>
      <tbody>
        <Show when={getRows().length > 0 && getCols().length > 0}>
          <Show when={hasColOutline()}>
            <tr class="spreadsheet-grid-outline-col-row" data-testid="outline-col-band">
              <Show when={hasRowOutline() || showHeadings()}>
                <th class="spreadsheet-grid-outline-corner" data-testid="outline-col-levels" colSpan={(hasRowOutline() ? 1 : 0) + (showHeadings() ? 1 : 0)} style={{ height: `${getColOutlineBandHeight()}px` }}>
                  <SpreadsheetGridOutline runtime={runtime} axis="column" />
                </th>
              </Show>
              <Show when={getLeftSpacerWidth() > 0}><th class="spreadsheet-grid-virtual-spacer" aria-hidden="true" style={{ width: `${getLeftSpacerWidth()}px` }} /></Show>
              <For each={getCols()}>{(col) => <th class="spreadsheet-grid-outline-col-cell" data-outline-col={col} style={{ height: `${getColOutlineBandHeight()}px` }}><SpreadsheetGridOutline runtime={runtime} axis="column" index={col} /></th>}</For>
              <Show when={getRightSpacerWidth() > 0}><th class="spreadsheet-grid-virtual-spacer" aria-hidden="true" style={{ width: `${getRightSpacerWidth()}px` }} /></Show>
            </tr>
          </Show>
          <Show when={showHeadings()}>
            <tr>
              <Show when={hasRowOutline()}>
                <th class="spreadsheet-grid-outline-header" data-testid="outline-row-levels" style={{ width: `${getRowOutlineGutterWidth()}px`, ...(hasColOutline() ? { top: `${getColOutlineBandHeight()}px` } : {}) }}>
                  <SpreadsheetGridOutline runtime={runtime} axis="row" />
                </th>
              </Show>
              <th
                class="spreadsheet-grid-corner"
                style={getCornerStyle()}
                data-selected={isAllSelected() ? 'true' : 'false'}
                onClick={() => {
                  store.setter(selectAllAtom, gridProps.sheetId)
                  bumpRender()
                  focusGrid()
                }}
                onContextMenu={(event) => openContextMenu(event, { kind: 'all' })}
              />
              <Show when={getLeftSpacerWidth() > 0}><th class="spreadsheet-grid-virtual-spacer" aria-hidden="true" style={{ width: `${getLeftSpacerWidth()}px` }} /></Show>
              <For each={getCols()}>
                {(col) => {
                  const selected = () => isColumnSelected(col)
                  return (
                    <th
                      class={`spreadsheet-grid-col-header ${selected() ? 'is-selected' : ''}`.trim()}
                      data-col={col}
                      data-selected={selected() ? 'true' : 'false'}
                      data-frozen-col={col < freezeColCount() ? 'true' : undefined}
                      data-freeze-boundary-right={freezeColCount() > 0 && col === freezeColCount() - 1 ? 'true' : undefined}
                      style={getColumnStyle(col)}
                      onClick={(event) => runtime.selectColumn(col, event.shiftKey, event.ctrlKey || event.metaKey)}
                      onContextMenu={(event) => openContextMenu(event, { kind: 'column', col })}
                    >
                      <span class="spreadsheet-grid-header-label">{getColumnLabel(col)}</span>
                      <Show when={colHasFilterRule(col)}>
                        <button
                          type="button"
                          class="spreadsheet-grid-filter-chevron"
                          data-testid={`filter-chevron-${col}`}
                          aria-label={`Filter column ${getColumnLabel(col)}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            store.setter(openFilterDropdownAtom, { sheetId: gridProps.sheetId, colIndex: col })
                            bumpRender()
                          }}
                        >
                          ▾
                        </button>
                      </Show>
                      <button
                        type="button"
                        class="spreadsheet-grid-col-resize-handle"
                        data-testid={`col-resize-${col}`}
                        aria-label={`Resize column ${getColumnLabel(col)}`}
                        onPointerDown={(event) => startColumnResize(event, col)}
                        onDblClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          void autoFitColumn(col)
                        }}
                      />
                    </th>
                  )
                }}
              </For>
              <Show when={getRightSpacerWidth() > 0}><th class="spreadsheet-grid-virtual-spacer" aria-hidden="true" style={{ width: `${getRightSpacerWidth()}px` }} /></Show>
            </tr>
          </Show>
          <Show when={getTopSpacerHeight() > 0}>
            <tr class="spreadsheet-grid-virtual-spacer-row" aria-hidden="true"><td class="spreadsheet-grid-virtual-spacer" colSpan={getVirtualColumnSpan()} style={{ height: `${getTopSpacerHeight()}px` }} /></tr>
          </Show>
          <For each={getRows()}>{(row) => <SpreadsheetGridDataRow runtime={runtime} row={row} />}</For>
          <Show when={getBottomSpacerHeight() > 0}>
            <tr class="spreadsheet-grid-virtual-spacer-row" aria-hidden="true"><td class="spreadsheet-grid-virtual-spacer" colSpan={getVirtualColumnSpan()} style={{ height: `${getBottomSpacerHeight()}px` }} /></tr>
          </Show>
        </Show>
      </tbody>
    </table>
  )
}
