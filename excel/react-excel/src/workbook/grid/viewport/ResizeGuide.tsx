import { useAtomValue } from '@einfach/react'
import {
  getViewportRangeRectangle,
  projectedFreezeAtom,
  resizeDragAtom,
  viewportGeometrySizesAtom,
  viewportMetricsAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { useGridGutter } from './grid-gutter'

/** 参考线放在统一视口，避免被普通／冻结表头的容器裁掉。 */
export function ResizeGuide() {
  const { gutter, heading } = useGridGutter()
  const drag = useAtomValue(resizeDragAtom)
  const metrics = useAtomValue(viewportMetricsAtom)
  const sizes = useAtomValue(viewportGeometrySizesAtom)
  const freeze = useAtomValue(projectedFreezeAtom)
  if (!drag || drag.sheetId !== metrics.sheetId) return null
  const row = drag.axis === 'row' ? drag.index : 0
  const col = drag.axis === 'column' ? drag.index : 0
  const rect = getViewportRangeRectangle(metrics, sizes, {
    rowStart: row,
    rowEnd: row,
    colStart: col,
    colEnd: col,
  })
  const frozen =
    freeze?.sheetId === drag.sheetId &&
    drag.index < (drag.axis === 'row' ? freeze.rows : freeze.cols)
  const style =
    drag.axis === 'row'
      ? {
          top: heading + rect.top + drag.pixels + (frozen ? metrics.scrollTop : 0),
          left: metrics.scrollLeft,
          width: metrics.viewportWidth + gutter,
        }
      : {
          left:
            gutter +
            rect.left +
            drag.pixels +
            (frozen ? metrics.scrollLeft : 0),
          top: metrics.scrollTop,
          height: metrics.viewportHeight + heading,
        }
  return (
    <div className={`resize-guide resize-guide-${drag.axis}`} style={style}>
      <output aria-live="polite">{drag.pixels} px</output>
    </div>
  )
}
