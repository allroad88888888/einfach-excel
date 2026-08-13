import type { CellRange, DisplayCell } from '@einfach/spreadsheet-ui-core'
import { defineComponent, h, type PropType } from 'vue'

export interface SpreadsheetGridViewProps {
  cells: readonly DisplayCell[]
  range: CellRange
  selected?: CellRange | null
}

function cellKey(row: number, col: number): string {
  return `${row}:${col}`
}

function contains(range: CellRange | null | undefined, row: number, col: number): boolean {
  return Boolean(
    range &&
      row >= range.rowStart &&
      row <= range.rowEnd &&
      col >= range.colStart &&
      col <= range.colEnd,
  )
}

/** Renders one projected cell range as a read-only HTML grid. */
export const SpreadsheetGridView = defineComponent({
  name: 'SpreadsheetGridView',
  props: {
    cells: { type: Array as PropType<readonly DisplayCell[]>, required: true },
    range: { type: Object as PropType<CellRange>, required: true },
    selected: { type: Object as PropType<CellRange | null>, default: null },
  },
  setup(props) {
    return () => {
      const cellsByCoordinate = new Map(
        props.cells.map((cell) => [cellKey(cell.row, cell.col), cell]),
      )
      const rowCount = props.range.rowEnd - props.range.rowStart + 1
      const colCount = props.range.colEnd - props.range.colStart + 1
      const rows = Array.from({ length: rowCount }, (_, rowOffset) => {
        const row = props.range.rowStart + rowOffset
        const cells = Array.from({ length: colCount }, (_, colOffset) => {
          const col = props.range.colStart + colOffset
          const cell = cellsByCoordinate.get(cellKey(row, col))
          const selected = contains(props.selected, row, col)
          return h(
            'td',
            {
              'aria-selected': selected ? 'true' : 'false',
              'data-col': col,
              'data-row': row,
              'data-selected': selected ? 'true' : 'false',
              role: 'gridcell',
            },
            cell?.displayValue ?? '',
          )
        })
        return h('tr', { 'data-row': row, role: 'row' }, cells)
      })

      return h(
        'table',
        {
          'aria-colcount': colCount,
          'aria-rowcount': rowCount,
          'data-testid': 'spreadsheet-grid-view',
          role: 'grid',
        },
        [h('tbody', rows)],
      )
    }
  },
})
