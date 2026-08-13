import {
  getFrozenWindows,
  type CellRange,
  type DisplayCell,
  type ViewportMetrics,
} from '@einfach/spreadsheet-ui-core'
import { defineComponent, h, type PropType } from 'vue'
import { SpreadsheetGridView } from './SpreadsheetGridView'

type FrozenGridPane = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

const NO_FREEZE = { rows: 0, cols: 0 }

/** Inputs for the controlled, read-only frozen spreadsheet grid projection. */
export interface SpreadsheetFrozenGridViewProps {
  readonly metrics: ViewportMetrics
  readonly freeze?: Readonly<{ rows: number; cols: number }>
  readonly cells: readonly DisplayCell[]
  readonly selected?: CellRange | null
}

function hasCells(window: CellRange): boolean {
  return window.rowStart <= window.rowEnd && window.colStart <= window.colEnd
}

/** Projects caller-owned cells into the visible frozen spreadsheet quadrants. */
export const SpreadsheetFrozenGridView = defineComponent({
  name: 'SpreadsheetFrozenGridView',
  props: {
    metrics: { type: Object as PropType<ViewportMetrics>, required: true },
    freeze: {
      type: Object as PropType<Readonly<{ rows: number; cols: number }>>,
      default: () => NO_FREEZE,
    },
    cells: { type: Array as PropType<readonly DisplayCell[]>, required: true },
    selected: { type: Object as PropType<CellRange | null>, default: null },
  },
  setup(props) {
    return () => {
      const windows = getFrozenWindows(props.metrics, props.freeze)
      const panes: ReadonlyArray<readonly [FrozenGridPane, CellRange]> = [
        ['top-left', windows.topLeft],
        ['top-right', windows.topRight],
        ['bottom-left', windows.bottomLeft],
        ['bottom-right', windows.bottomRight],
      ]

      return h(
        'div',
        { class: 'spreadsheet-frozen-grid' },
        panes.flatMap(([pane, window]) =>
          hasCells(window)
            ? h(
                'div',
                {
                  class: `spreadsheet-frozen-grid-${pane}`,
                  'data-frozen-quadrant': pane,
                },
                [
                  h(SpreadsheetGridView, {
                    cells: props.cells,
                    range: window,
                    selected: props.selected,
                  }),
                ],
              )
            : [],
        ),
      )
    }
  },
})
