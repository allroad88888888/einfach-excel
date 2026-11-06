import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import type { SheetDrawing } from '@einfach-excel/spreadsheet-ui-core'
import { useEffect } from 'react'
import { copyChartPng, downloadChartPng, renderChartPng } from './chart-image'
import { chartExportFeedbackAtom, resetChartExportAtom, runChartExportAtom } from './core'
import { labels } from './messages'
import { useChartOption } from './use-chart-option'

/** 设置栏底部：把当前图表按屏幕上的同一份配置导出为 PNG（复制或下载）。 */
export function ChartExportActions({ drawing }: { readonly drawing: SheetDrawing }) {
  const { i18n } = useLingui()
  const { option, spec } = useChartOption(drawing)
  const feedback = useAtomValue(chartExportFeedbackAtom)
  const run = useSetAtom(runChartExportAtom)
  const reset = useSetAtom(resetChartExportAtom)
  useEffect(() => { reset() }, [drawing.id, reset])
  const { width, height } = drawing.anchor
  const png = () => renderChartPng(option!, width, height)
  return <div className="plugin-chart-export">
    <div className="plugin-chart-range">
      <button type="button" disabled={!option || feedback.busy}
        onClick={() => void run({ kind: 'copy', write: () => copyChartPng(png()) })}>
        {i18n._(labels.copyImage)}</button>
      <button type="button" disabled={!option || feedback.busy}
        onClick={() => void run({ kind: 'download',
          write: () => downloadChartPng(png(), spec.title || i18n._(labels.chart)) })}>
        {i18n._(labels.downloadPng)}</button>
    </div>
    {feedback.error && <p className="plugin-chart-error" role="alert">
      {i18n._({ id: feedback.error, message: feedback.error })}</p>}
    {feedback.done && <p role="status">
      {i18n._(feedback.done === 'copy' ? labels.copied : labels.downloaded)}</p>}
  </div>
}
