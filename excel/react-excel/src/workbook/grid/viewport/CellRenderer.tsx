import { useAtomValue } from '@einfach/react'
import { projectionSnapshotAtom, type DisplayCell } from '@einfach/spreadsheet-ui-core'
import { SpreadsheetGrid, MergedCells, type SpreadsheetGridProps } from '@einfach/react-cells'
import { CanvasCells } from './CanvasCells'

/** Select the display backend while preserving the host's viewport and interaction commands. */
export function CellRenderer(props: SpreadsheetGridProps & {
  anchors?: readonly DisplayCell[]
  interactive?: boolean
}) {
  const projection = useAtomValue(projectionSnapshotAtom).result
  const anchors = props.anchors ?? (projection?.kind === 'visible-window' ? projection.mergeAnchors : undefined)
  const canvas = new URLSearchParams(globalThis.location?.search).get('renderer') === 'canvas'
  if (canvas) return <CanvasCells {...props} mergeAnchors={anchors} />
  return <><SpreadsheetGrid {...props} />
    <MergedCells window={props.window} anchors={props.anchors} /></>
}
