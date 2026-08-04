import { For, Show } from 'solid-js'
import { SpreadsheetGridCell } from './SpreadsheetGridCell'
import { SpreadsheetGridOutline } from './SpreadsheetGridOutline'
import { type GridRuntime } from './grid-runtime'

export interface SpreadsheetGridDataRowProps {
  runtime: GridRuntime
  row: number
}

/** Renders one visible data row with its headers, spacers and grid cells. */
export function SpreadsheetGridDataRow(props: SpreadsheetGridDataRowProps) {
  const { runtime, row } = props
  const {
    hasRowOutline,
    showHeadings,
    getRowOutlineGutterWidth,
    getRenderedRowHeight,
    isRowSelected,
    freezeRowCount,
    getRowHeaderStyle,
    selectRow,
    openContextMenu,
    getLeftSpacerWidth,
    getCols,
    getRightSpacerWidth,
    startRowResize,
    autoFitRow,
  } = runtime
  return (
    <tr class="spreadsheet-grid-row">
      <Show when={hasRowOutline()}>
        <th
          class="spreadsheet-grid-outline-row-cell"
          data-outline-row={row}
          style={{ width: `${getRowOutlineGutterWidth()}px`, height: `${getRenderedRowHeight(row)}px` }}
        >
          <SpreadsheetGridOutline runtime={runtime} axis="row" index={row} />
        </th>
      </Show>
      <Show when={showHeadings()}>
        <th
          class={`spreadsheet-grid-row-header ${isRowSelected(row) ? 'is-selected' : ''}`.trim()}
          data-row={row}
          data-selected={isRowSelected(row) ? 'true' : 'false'}
          data-frozen-row={row < freezeRowCount() ? 'true' : undefined}
          data-freeze-boundary-bottom={freezeRowCount() > 0 && row === freezeRowCount() - 1 ? 'true' : undefined}
          style={getRowHeaderStyle(row)}
          onClick={(event) => selectRow(row, event.shiftKey, event.ctrlKey || event.metaKey)}
          onContextMenu={(event) => openContextMenu(event, { kind: 'row', row })}
        >
          <span class="spreadsheet-grid-header-label">{row + 1}</span>
          <button
            type="button"
            class="spreadsheet-grid-row-resize-handle"
            data-testid={`row-resize-${row}`}
            aria-label={`Resize row ${row + 1}`}
            onPointerDown={(event) => startRowResize(event, row)}
            onDblClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void autoFitRow(row)
            }}
          />
        </th>
      </Show>
      <Show when={getLeftSpacerWidth() > 0}>
        <td class="spreadsheet-grid-virtual-spacer" aria-hidden="true" style={{ width: `${getLeftSpacerWidth()}px` }} />
      </Show>
      <For each={getCols()}>{(col) => <SpreadsheetGridCell runtime={runtime} row={row} col={col} />}</For>
      <Show when={getRightSpacerWidth() > 0}>
        <td class="spreadsheet-grid-virtual-spacer" aria-hidden="true" style={{ width: `${getRightSpacerWidth()}px` }} />
      </Show>
    </tr>
  )
}
