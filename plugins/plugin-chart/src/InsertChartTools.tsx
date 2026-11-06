import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLingui } from '@lingui/react'
import { CHART_TYPES, dismissChartErrorAtom, insertChartAtom, insertChartFeedbackAtom,
  openChartSettingsAtom, selectedChartAtom, type ChartType } from './core'
import { labels, typeLabels } from './messages'

const ICONS: Record<ChartType, string> = {
  column: '▥', bar: '☰', line: '⟋', area: '◭', pie: '◔', doughnut: '◎', scatter: '⁘',
}

/** 「插入」分组：按类型插入图表；选中图表时可打开设置。 */
export function InsertChartTools() {
  const { i18n } = useLingui()
  const insert = useSetAtom(insertChartAtom)
  const openSettings = useSetAtom(openChartSettingsAtom)
  const dismiss = useSetAtom(dismissChartErrorAtom)
  const feedback = useAtomValue(insertChartFeedbackAtom)
  const selected = useAtomValue(selectedChartAtom)
  return (
    <div className="plugin-chart-tools" role="group" aria-label={i18n._(labels.insert)}>
      {CHART_TYPES.map((type) => {
        const name = i18n._(typeLabels[type])
        return <button key={type} type="button" className="tool-button" data-chart-type={type}
          aria-label={`${i18n._(labels.insert)}: ${name}`} title={name} disabled={feedback.busy}
          onClick={() => void insert(type)}>{ICONS[type]}</button>
      })}
      <button type="button" className="tool-button" disabled={!selected}
        aria-label={i18n._(labels.settings)} title={i18n._(labels.settings)}
        onClick={() => openSettings()}>⚙</button>
      {feedback.error && (
        <span className="plugin-chart-error" role="alert">
          {i18n._({ id: feedback.error, message: feedback.error })}
          <button type="button" aria-label={i18n._(labels.close)} onClick={() => dismiss()}>×</button>
        </span>
      )}
    </div>
  )
}
