import {
  getFrozenWindows,
  type CellRange,
  type DisplayCell,
  type ViewportMetrics,
} from '@einfach/spreadsheet-ui-core'
import { SpreadsheetGridView } from './SpreadsheetGridView'

type FrozenGridPane = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

const NO_FREEZE = { rows: 0, cols: 0 }

/** Inputs for the controlled, read-only frozen spreadsheet grid projection. */
export interface SpreadsheetFrozenGridViewProps {
  readonly metrics: ViewportMetrics
  readonly freeze?: Readonly<{ rows: number; cols: number }>
  readonly cells: readonly DisplayCell[]
  readonly selected?: CellRange
}

function hasCells(window: CellRange): boolean {
  return window.rowStart <= window.rowEnd && window.colStart <= window.colEnd
}

/** Projects caller-owned cells into the visible frozen spreadsheet quadrants. */
export function SpreadsheetFrozenGridView({
  metrics,
  freeze = NO_FREEZE,
  cells,
  selected,
}: SpreadsheetFrozenGridViewProps) {
  const windows = getFrozenWindows(metrics, freeze)
  const panes: ReadonlyArray<readonly [FrozenGridPane, CellRange]> = [
    ['top-left', windows.topLeft],
    ['top-right', windows.topRight],
    ['bottom-left', windows.bottomLeft],
    ['bottom-right', windows.bottomRight],
  ]

  return (
    <div className="spreadsheet-frozen-grid">
      {panes.map(([pane, window]) =>
        hasCells(window) ? (
          <div className={`spreadsheet-frozen-grid-${pane}`} data-frozen-quadrant={pane} key={pane}>
            <SpreadsheetGridView cells={cells} selected={selected} window={window} />
          </div>
        ) : null,
      )}
    </div>
  )
}
