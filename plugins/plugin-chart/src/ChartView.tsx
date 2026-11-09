import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import type { DrawingRendererProps } from '@einfach-excel/react-excel'
import { useEffect, useRef } from 'react'
import { chartRevisionAtom, loadChartGridAtom, openChartSettingsAtom, selectChartPointAtom,
  type ChartOption } from './core'
import type { EChartsType } from './echarts-runtime'
import { labels } from './messages'
import { useChartOption } from './use-chart-option'
import './chart.css'

interface PointEvent {
  readonly seriesIndex?: number
  readonly dataIndex?: number
  readonly data?: unknown
}

/** 图表内容：数据格 → 整形 → 转换器 → ECharts。实例只是 DOM 资源，状态全在 atom 与 Rust。 */
export function ChartView({ drawing, width, height }: DrawingRendererProps) {
  const { i18n } = useLingui()
  const { entry, spec, data, option, plottable, issue } = useChartOption(drawing)
  const load = useSetAtom(loadChartGridAtom)
  const selectPoint = useSetAtom(selectChartPointAtom)
  const openSettings = useSetAtom(openChartSettingsAtom)
  const revision = useAtomValue(chartRevisionAtom)
  const host = useRef<HTMLDivElement>(null)
  const chart = useRef<EChartsType | null>(null)
  const latest = useRef<ChartOption | null>(null)
  /**
   * 对象框为了拖动在 pointerdown 上 preventDefault，浏览器就不再派发 mousedown / mouseup，
   * ECharts 自己的 click 因此不触发。悬停不受影响：记下鼠标下的数据点，原生 click 时取用。
   */
  const hovered = useRef<PointEvent | null>(null)
  const pickPoint = () => {
    const params = hovered.current
    const single = spec.type === 'pie' || spec.type === 'doughnut'
    const series = params?.seriesIndex ?? -1
    // 趋势线、误差线追加在数据系列之后，不对应单元格；点到空白处取消数据点高亮。
    if (!params || series < 0 || series >= (single ? 1 : data?.series.length ?? 0))
      return selectPoint(null)
    const slot = (params.data as { slot?: number } | undefined)?.slot
    selectPoint({ chartId: drawing.id, series, point: slot ?? params.dataIndex ?? 0 })
  }

  // 修订版推进（编辑、公式重算、撤销）或数据区域改变后重读；同修订在 Core 内去重。
  useEffect(() => { void load(drawing) }, [load, drawing, revision])

  useEffect(() => {
    let disposed = false
    void import('./echarts-runtime').then(({ init }) => {
      if (disposed || !host.current) return
      chart.current = init(host.current, undefined, { renderer: 'canvas' })
      chart.current.on('mouseover', (params) => { hovered.current = params as PointEvent })
      chart.current.on('mouseout', () => { hovered.current = null })
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

  const failure = entry?.status === 'error' ? entry.error! : issue
  const message = failure ? i18n._({ id: failure, message: failure })
    : !entry || (entry.status === 'loading' && !entry.grid) ? i18n._(labels.loading)
      : !plottable ? i18n._(labels.empty) : null
  return (
    <div className="plugin-chart" onDoubleClick={() => openSettings(drawing.id)}>
      <div ref={host} className="plugin-chart-canvas" style={{ width, height }}
        role="img" aria-label={spec.title || i18n._(labels.chart)} onClick={pickPoint} />
      {message && <div className="plugin-chart-message" role={failure
        ? 'alert' : 'status'}>{message}</div>}
    </div>
  )
}
