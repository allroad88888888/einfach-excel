import { useAtomValue } from '@einfach/react'
import {
  activeWorkbookSheetAtom,
  workbookHighlightsAtom,
  viewportMetricsAtom,
  viewportGeometrySizesAtom,
  projectedFreezeAtom,
  getRangeScreenRectangle,
} from '@einfach-excel/spreadsheet-ui-core'
import { useGridGutter } from './grid-gutter'
import './host-highlights.css'

export function HostHighlights() {
  const highlights = useAtomValue(workbookHighlightsAtom)
  const sheet = useAtomValue(activeWorkbookSheetAtom)
  const metrics = useAtomValue(viewportMetricsAtom)
  const sizes = useAtomValue(viewportGeometrySizesAtom)
  const freeze = useAtomValue(projectedFreezeAtom)
  const { gutter, heading } = useGridGutter()
  if (!highlights.length || !sheet || metrics.sheetId !== sheet.id) return null
  return (
    <div
      className="host-highlights"
      aria-hidden="true"
      style={{ width: metrics.viewportWidth + gutter, height: metrics.viewportHeight + heading }}
    >
      {highlights
        .filter((item) => item.sheetId === sheet.id)
        .map((item) => {
          const frame = getRangeScreenRectangle(
            item.range,
            metrics,
            sizes,
            freeze?.sheetId === sheet.id ? freeze : null,
          )
          if (frame.width <= 0 || frame.height <= 0) return null
          return (
            <div
              key={item.id}
              data-host-highlight={item.id}
              className="host-highlight"
              style={{
                left: frame.left + gutter,
                top: frame.top + heading,
                width: frame.width,
                height: frame.height,
                borderColor: item.color,
                backgroundColor: `${item.color}18`,
                borderTopWidth: frame.edges.top ? 2 : 0,
                borderBottomWidth: frame.edges.bottom ? 2 : 0,
                borderLeftWidth: frame.edges.left ? 2 : 0,
                borderRightWidth: frame.edges.right ? 2 : 0,
              }}
            />
          )
        })}
    </div>
  )
}
