import type { DisplayCell } from '@einfach/spreadsheet-ui-core'
import './cell-data-bar.css'

/** 只绘制 Rust 返回的百分比几何；不扫描数值、不计算阈值、不改基础样式。 */
export function CellDataBar({ bar }: { readonly bar: DisplayCell['dataBar'] }) {
  if (!bar) return null
  return <span aria-hidden="true" className="cell-data-bar" data-data-bar="true">
    <span className="cell-data-bar-fill" style={{
      left: `${bar.left}%`, width: `${bar.width}%`, backgroundColor: bar.color,
    }} />
    {bar.axis !== undefined && <span className="cell-data-bar-axis" style={{ left: `${bar.axis}%` }} />}
  </span>
}
