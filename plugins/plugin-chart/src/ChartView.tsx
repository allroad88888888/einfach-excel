import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import type { DrawingRendererProps } from '@einfach-excel/react-excel'
import { useEffect, useRef } from 'react'
import { chartRevisionAtom, loadChartGridAtom, openChartSettingsAtom, type ChartOption } from './core'
import type { EChartsType } from './echarts-runtime'
import { labels } from './messages'
import { useChartOption } from './use-chart-option'
import './chart.css'

/** 图表内容：数据格 → 整形 → 转换器 → ECharts。实例只是 DOM 资源，状态全在 atom 与 Rust。 */
export function ChartView({ drawing, width, height }: DrawingRendererProps) {
  const { i18n } = useLingui()
  const { entry, spec, option, plottable } = useChartOption(drawing)
  const load = useSetAtom(loadChartGridAtom)
  const openSettings = useSetAtom(openChartSettingsAtom)
  const revision = useAtomValue(chartRevisionAtom)
  const host = useRef<HTMLDivElement>(null)
  const chart = useRef<EChartsType | null>(null)
  const latest = useRef<ChartOption | null>(null)

  // 修订版推进（编辑、公式重算、撤销）或数据区域改变后重读；同修订在 Core 内去重。
  useEffect(() => { void load(drawing) }, [load, drawing, revision])

  useEffect(() => {
    let disposed = false
    void import('./echarts-runtime').then(({ init }) => {
      if (disposed || !host.current) return
      chart.current = init(host.current, undefined, { renderer: 'canvas' })
      if (latest.current) chart.current.setOption(latest.current, { notMerge: true })
    })
    return () => {
      disposed = true
      chart.current?.dispose()
      chart.current = null
    }
  }, [])
  useEffect(() => {
    latest.current = option
    if (option) chart.current?.setOption(option, { notMerge: true })
    else chart.current?.clear()
  }, [option])
  useEffect(() => { chart.current?.resize({ width, height }) }, [width, height])

  const message = entry?.status === 'error' ? i18n._({ id: entry.error!, message: entry.error! })
    : !entry || (entry.status === 'loading' && !entry.grid) ? i18n._(labels.loading)
      : !plottable ? i18n._(labels.empty) : null
  return (
    <div className="plugin-chart" onDoubleClick={() => openSettings(drawing.id)}>
      <div ref={host} className="plugin-chart-canvas" style={{ width, height }}
        role="img" aria-label={spec.title || i18n._(labels.chart)} />
      {message && <div className="plugin-chart-message" role={entry?.status === 'error'
        ? 'alert' : 'status'}>{message}</div>}
    </div>
  )
}
