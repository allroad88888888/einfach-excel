import type { SpreadsheetPlugin } from '@einfach-excel/react-excel'
import { SPARKLINE_KIND } from './core'
import { labels, messages } from './messages'
import { SparklineDialog } from './SparklineDialog'
import { SparklineTools } from './SparklineTools'
import { SparklineView } from './SparklineView'
import './sparkline.css'

/** 迷你图插件：单元格内的折线、柱形、盈亏图；一组迷你图存成一个格内对象。 */
export const sparklinePlugin: SpreadsheetPlugin = {
  id: 'sparkline',
  ribbon: [{ id: 'sparkline', tab: 'Insert', Group: SparklineTools }],
  drawings: [{ kind: SPARKLINE_KIND, label: labels.sparkline, Renderer: SparklineView,
    placement: 'cell' }],
  panels: [SparklineDialog],
  messages,
}
