import { useAtomValue } from '@einfach/react'
import { projectionSnapshotAtom, type DisplayCell } from '@einfach-excel/spreadsheet-ui-core'
import { SpreadsheetGrid, MergedCells, type SpreadsheetGridProps } from '@einfach-excel/react-cells'
import { CanvasCells } from './CanvasCells'
import { useLingui } from '@lingui/react/macro'
import { useContext } from 'react'
import { WorkbookPresentationContext } from '../../../page/WorkbookPresentationProvider'

/** Select the display backend while preserving the host's viewport and interaction commands. */
export function CellRenderer(props: SpreadsheetGridProps & {
  anchors?: readonly DisplayCell[]
  interactive?: boolean
}) {
  const { t } = useLingui()
  const metadataLabels = { note: t`Cell has a note`, comment: t`Cell has comments` }
  const projection = useAtomValue(projectionSnapshotAtom).result
  const anchors = props.anchors ?? (projection?.kind === 'visible-window' ? projection.mergeAnchors : undefined)
  const { renderer } = useContext(WorkbookPresentationContext)
  if (renderer === 'canvas') return <CanvasCells {...props} mergeAnchors={anchors} />
  return <><SpreadsheetGrid {...props} metadataLabels={metadataLabels} />
    <MergedCells window={props.window} anchors={props.anchors} metadataLabels={metadataLabels} /></>
}
