import { useAtomValue, useSetAtom } from '@einfach/react'
import type { DrawingRendererProps } from '@einfach-excel/react-excel'
import { getViewportRangeRectangle, viewportGeometrySizesAtom,
  viewportMetricsAtom } from '@einfach-excel/spreadsheet-ui-core'
import { useEffect } from 'react'
import { loadSparklineDataAtom, parseSparklineSpec, sparklineDataAtom, sparklineMarks,
  sparklineRevisionAtom, sparklineSlots } from './core'

/** 一组迷你图：整块位置区域一张 SVG，按各格实际行高列宽切开，每格画自己那一行数据。 */
export function SparklineView({ drawing, width, height }: DrawingRendererProps) {
  const revision = useAtomValue(sparklineRevisionAtom)
  const load = useSetAtom(loadSparklineDataAtom)
  const entry = useAtomValue(sparklineDataAtom)[drawing.id]
  const metrics = useAtomValue(viewportMetricsAtom)
  const sizes = useAtomValue(viewportGeometrySizesAtom)
  useEffect(() => { void load(drawing) }, [drawing, revision, load])
  const [location, data] = drawing.refs
  if (!location || !data || !entry?.series) return null
  const layout = sparklineSlots(location, data)
  if ('error' in layout) return null
  const spec = parseSparklineSpec(drawing.payload)
  const origin = getViewportRangeRectangle(metrics, sizes, { rowStart: location.startRow,
    rowEnd: location.startRow, colStart: location.startCol, colEnd: location.startCol })
  return (
    <svg className="plugin-sparkline" width={width} height={height} data-sparkline-type={spec.type}>
      {layout.slots.map((slot, index) => {
        const box = getViewportRangeRectangle(metrics, sizes,
          { rowStart: slot.row, rowEnd: slot.row, colStart: slot.col, colEnd: slot.col })
        if (!box.width || !box.height) return null
        const marks = sparklineMarks(entry.series![index] ?? [], spec, box.width, box.height)
        return (
          <g key={index} data-sparkline-cell={`${slot.row}:${slot.col}`}
            transform={`translate(${box.left - origin.left} ${box.top - origin.top})`}>
            {marks.map((mark, at) => mark.kind === 'line'
              ? <polyline key={at} points={mark.points} fill="none" stroke={mark.color}
                strokeWidth={1.25} strokeLinejoin="round" />
              : mark.kind === 'rect'
                ? <rect key={at} x={mark.x} y={mark.y} width={mark.width} height={mark.height}
                  fill={mark.color} />
                : mark.kind === 'dot'
                  ? <circle key={at} cx={mark.x} cy={mark.y} r={2} fill={mark.color} />
                  : <line key={at} x1={0} x2={box.width} y1={mark.y} y2={mark.y}
                    stroke={mark.color} strokeWidth={0.75} />)}
          </g>
        )
      })}
    </svg>
  )
}
