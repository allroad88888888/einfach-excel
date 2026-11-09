import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import type { SheetDrawing } from '@einfach-excel/spreadsheet-ui-core'
import { useEffect } from 'react'
import { copyChartPng, downloadChartImage, renderChartPng, renderChartSvg } from './chart-image'
import { chartExportFeedbackAtom, resetChartExportAtom, runChartExportAtom } from './core'
import { designLabels } from './design-messages'
import { labels } from './messages'
import { useChartOption } from './use-chart-option'

const DONE =
  { copy: labels.copied, png: labels.downloaded, svg: designLabels.downloadedSvg } as const

/** 设置栏底部：把当前图表按屏幕上的同一份配置导出为 PNG（复制或下载）或 SVG。 */
export function ChartExportActions({ drawing }: { readonly drawing: SheetDrawing }) {
  const { i18n } = useLingui()
  const { option, spec } = useChartOption(drawing)
  const feedback = useAtomValue(chartExportFeedbackAtom)
  const run = useSetAtom(runChartExportAtom)
  const reset = useSetAtom(resetChartExportAtom)
  useEffect(() => { reset() }, [drawing.id, reset])
  const { width, height } = drawing.anchor
  const name = spec.title || i18n._(labels.chart)
  const png = () => renderChartPng(option!, width, height)
  const disabled = !option || feedback.busy
  return <div className="plugin-chart-export">
    <div className="plugin-chart-range">
      <button type="button" disabled={disabled}
        onClick={() => void run({ kind: 'copy', write: () => copyChartPng(png()) })}>
        {i18n._(labels.copyImage)}</button>
      <button type="button" disabled={disabled}
        onClick={() => void run({ kind: 'png',
          write: () => downloadChartImage(png(), name, 'png') })}>
        {i18n._(labels.downloadPng)}</button>
      <button type="button" disabled={disabled}
        onClick={() => void run({ kind: 'svg', write: () =>
          downloadChartImage(renderChartSvg(option!, width, height), name, 'svg') })}>
        {i18n._(designLabels.downloadSvg)}</button>
    </div>
    {feedback.error && <p className="plugin-chart-error" role="alert">
      {i18n._({ id: feedback.error, message: feedback.error })}</p>}
    {feedback.done && <p role="status">{i18n._(DONE[feedback.done])}</p>}
  </div>
}
