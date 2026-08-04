import { formulaReferenceSessionAtom, selectCellAtom } from '@einfach/spreadsheet-ui-core'
import { Show } from 'solid-js'
import { SpreadsheetCellBorders } from './SpreadsheetCellBorders'
import { SpreadsheetCellDisplayValue } from './SpreadsheetCellDisplayValue'
import { SpreadsheetGridCellEditor } from './SpreadsheetGridCellEditor'
import {
  getCellBordersAttr,
  getCellFormatStyle,
  getCellRichUrl,
  getCellValidationMessage,
  getCellValidationSeverity,
  getDisplayCellFormat,
} from './cell-format'
import { getCellAddress } from './grid-constants'
import { type GridRuntime } from './grid-runtime'

export interface SpreadsheetGridCellProps {
  runtime: GridRuntime
  row: number
  col: number
}

/** One rendered body cell, including selection, editing and fill affordances. */
export function SpreadsheetGridCell(props: SpreadsheetGridCellProps) {
  const { runtime, row, col } = props
  const {
    props: gridProps,
    store,
    getCell,
    isSelected,
    isActive,
    isEditing,
    isCellMergeAnchor,
    getSpillRole,
    isCellCoveredByMerge,
    freezeRowCount,
    freezeColCount,
    isFillPreviewCell,
    getCellRowSpan,
    getCellColSpan,
    getCellBoxStyle,
    startFormulaReferenceDragPick,
    startDragSelection,
    startEditingCell,
    openContextMenu,
    getCellContextTarget,
    bumpRender,
    focusGrid,
    isFillHandleHost,
    isSheetEditing,
    startFillHandle,
    executeFillHandleDoubleClick,
  } = runtime
  const addr = getCellAddress(row, col)
  const cell = () => getCell(row, col)
  const selected = () => isSelected(row, col)
  const active = () => isActive(row, col)
  const editing = () => isEditing(row, col)
  const mergeAnchor = () => isCellMergeAnchor(row, col)
  const validationSeverity = () => getCellValidationSeverity(cell())
  const spillRole = () => getSpillRole(row, col)

  return (
    <Show when={!isCellCoveredByMerge(row, col)}>
      <td
        class={`spreadsheet-grid-cell cell ${selected() ? 'is-selected cell-in-range' : ''} ${active() ? 'cell-active' : ''} ${isFillPreviewCell(row, col) ? 'cell-fill-preview' : ''} ${mergeAnchor() ? 'cell-merge-anchor' : ''} ${validationSeverity() ? `cell-validation-${validationSeverity()}` : ''} ${cell()?.valueKind ? `kind-${cell()?.valueKind}` : ''} ${spillRole() ? `cell-spill cell-spill-${spillRole()}` : ''}`.trim()}
        data-row={row}
        data-col={col}
        data-cell-addr={addr}
        data-frozen-row={row < freezeRowCount() ? 'true' : undefined}
        data-frozen-col={col < freezeColCount() ? 'true' : undefined}
        data-freeze-boundary-bottom={freezeRowCount() > 0 && row === freezeRowCount() - 1 ? 'true' : undefined}
        data-freeze-boundary-right={freezeColCount() > 0 && col === freezeColCount() - 1 ? 'true' : undefined}
        data-selected={selected() ? 'true' : 'false'}
        data-active={active() ? 'true' : 'false'}
        data-merge-anchor={mergeAnchor() ? 'true' : 'false'}
        data-spill={spillRole()}
        data-validation-code={cell()?.validation?.code}
        data-validation-severity={validationSeverity()}
        data-has-conditional-format={cell()?.conditionalFormat ? 'true' : 'false'}
        data-rich-kind={cell()?.richValue?.kind}
        data-rich-url={getCellRichUrl(cell())}
        data-borders={getCellBordersAttr(cell())}
        role="gridcell"
        aria-selected={selected() ? 'true' : 'false'}
        title={getCellValidationMessage(cell())}
        rowSpan={getCellRowSpan(row, col)}
        colSpan={getCellColSpan(row, col)}
        style={getCellBoxStyle(row, col)}
        onClick={(event) => {
          if (store.getter(formulaReferenceSessionAtom)) return
          runtime.selectCellFromEvent(row, col, event)
        }}
        onMouseDown={(event) => {
          if (!event.shiftKey || event.ctrlKey || event.metaKey) return
          event.preventDefault()
          store.setter(selectCellAtom, { sheetId: gridProps.sheetId, coord: { row, col }, extend: true })
          bumpRender()
          focusGrid()
        }}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return
          if (store.getter(formulaReferenceSessionAtom)) {
            event.preventDefault()
            event.stopPropagation()
            startFormulaReferenceDragPick(event, row, col)
            return
          }
          if (event.shiftKey || event.ctrlKey || event.metaKey) return
          startDragSelection(event, row, col)
        }}
        onDblClick={() => startEditingCell(row, col, 'cell')}
        onContextMenu={(event) => openContextMenu(event, getCellContextTarget(row, col))}
      >
        <SpreadsheetCellBorders borders={cell()?.format?.borders} />
        <Show
          when={editing()}
          fallback={
            <div class="spreadsheet-grid-cell-button">
              <span class="cell-display" style={getCellFormatStyle(getDisplayCellFormat(cell()))}>
                <SpreadsheetCellDisplayValue cell={cell()} />
              </span>
            </div>
          }
        >
          <SpreadsheetGridCellEditor runtime={runtime} editing={editing} />
        </Show>
        <Show when={isFillHandleHost(row, col) && !isSheetEditing()}>
          <button
            type="button"
            class="spreadsheet-grid-fill-handle"
            data-testid={`fill-handle-${addr}`}
            aria-label={`Fill from ${addr}`}
            onPointerDown={startFillHandle}
            onDblClick={executeFillHandleDoubleClick}
          />
        </Show>
      </td>
    </Show>
  )
}
