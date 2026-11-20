import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import type { DrawingRendererProps } from '@einfach-excel/react-excel'
import { useEffect, useRef } from 'react'
import {
  chartRevisionAtom,
  chartSectionForComponent,
  loadChartGridAtom,
  openChartSettingsAtom,
  selectChartPointAtom,
  type ChartOption,
  type ChartSpec,
} from './core'
import type { EChartsType } from './echarts-runtime'
import { labels } from './messages'
import { useChartOption } from './use-chart-option'
import './chart.css'

interface ChartElementEvent {
  readonly componentType?: string
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
  const latestSpec = useRef<ChartSpec>(spec)
  latestSpec.current = spec
  const latestId = useRef(drawing.id)
  latestId.current = drawing.id
  /**
   * 对象框为了拖动在 pointerdown 上 preventDefault，浏览器不再派发 mousedown / mouseup；
   * 同时监听 ECharts dblclick 与悬停元素，确保双击标题/图例/坐标轴/系列均能精准定位设置分组。
   */
  const hovered = useRef<ChartElementEvent | null>(null)
  const handledDblClick = useRef(false)

  const pickPoint = () => {
    const params = hovered.current
    const single = spec.type === 'pie' || spec.type === 'doughnut'
    const series = params?.seriesIndex ?? -1
    if (
      !params ||
      params.componentType !== 'series' ||
      series < 0 ||
      series >= (single ? 1 : (data?.series.length ?? 0))
    )
      return selectPoint(null)
    const slot = (params.data as { slot?: number } | undefined)?.slot
    selectPoint({ chartId: drawing.id, series, point: slot ?? params.dataIndex ?? 0 })
  }

  useEffect(() => {
    void load(drawing)
  }, [load, drawing, revision])

  useEffect(() => {
    let disposed = false
    void import('./echarts-runtime').then(({ init }) => {
      if (disposed || !host.current) return
      const instance = init(host.current, undefined, { renderer: 'canvas' })
      chart.current = instance
      instance.on('mouseover', (params) => {
        hovered.current = params as ChartElementEvent
      })
      instance.on('mouseout', () => {
        hovered.current = null
      })
      instance.on('dblclick', (params) => {
        const event = params as ChartElementEvent
        handledDblClick.current = true
        openSettings({
          id: latestId.current,
          section: chartSectionForComponent(event.componentType, latestSpec.current),
        })
      })
      if (latest.current) instance.setOption(latest.current, { notMerge: true })
    })
    return () => {
      disposed = true
      chart.current?.dispose()
      chart.current = null
    }
  }, [openSettings])

  useEffect(() => {
    latest.current = option
    if (option) chart.current?.setOption(option, { notMerge: true })
    else chart.current?.clear()
  }, [option])
  useEffect(() => {
    chart.current?.resize({ width, height })
  }, [width, height])

  const failure = entry?.status === 'error' ? entry.error! : issue
  const message = failure
    ? i18n._({ id: failure, message: failure })
    : !entry || (entry.status === 'loading' && !entry.grid)
      ? i18n._(labels.loading)
      : !plottable
        ? i18n._(labels.empty)
        : null
  return (
    <div
      className="plugin-chart"
      data-dark={spec.dark || undefined}
      onDoubleClick={() => {
        if (handledDblClick.current) {
          handledDblClick.current = false
          return
        }
        openSettings({
          id: drawing.id,
          section: chartSectionForComponent(hovered.current?.componentType, spec),
        })
      }}
    >
      <div
        ref={host}
        className="plugin-chart-canvas"
        style={{ width, height }}
        role="img"
        aria-label={spec.title || i18n._(labels.chart)}
        onClick={pickPoint}
      />
      {message && (
        <div className="plugin-chart-message" role={failure ? 'alert' : 'status'}>
          {message}
        </div>
      )}
    </div>
  )
}
