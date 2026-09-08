import { Suspense } from 'react'
import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  selectionAggregatesAtom, selectionStatisticsPreferencesAtom, selectionStatisticLabels,
  copySelectionStatisticAtom, selectionStatisticCopyFeedbackAtom,
} from '@einfach/spreadsheet-ui-core'
import { writeBrowserClipboardText } from '../../clipboard/browser-clipboard'
import { SelectionStatisticsSettings } from './SelectionStatisticsSettings'
import './selection-status.css'

const formatNumber = (value: number) => value.toLocaleString(undefined, {
  maximumSignificantDigits: 12,
  notation: Math.abs(value) >= 1e12 || (value !== 0 && Math.abs(value) < 1e-6) ? 'scientific' : 'standard',
})

/** React 只格式化 Rust 结果，不从显示文本反推数值。 */
function SelectionNumbers() {
  const state = useAtomValue(selectionAggregatesAtom)
  const { visible } = useAtomValue(selectionStatisticsPreferencesAtom)
  const { busy } = useAtomValue(selectionStatisticCopyFeedbackAtom)
  const copy = useSetAtom(copySelectionStatisticAtom)
  if (state.status === 'idle') return <span>Select cells to calculate</span>
  if (state.status === 'error')
    return <span className="selection-statistics-error" title={state.message}>Statistics unavailable</span>
  return visible.map((statistic) => {
    const value = state.numbers[statistic]
    const label = selectionStatisticLabels[statistic]
    const display = value === null
      ? (statistic === 'sum' && state.numbers.numericCount > 0 ? 'Out of range' : '—')
      : formatNumber(value)
    return <button key={statistic} type="button" className="selection-statistic"
      aria-label={`Copy ${label}`} title={value === null ? undefined : String(value)}
      disabled={busy || value === null}
      onClick={() => void copy({ statistic, value, write: writeBrowserClipboardText })}>
      {label}: {display}
    </button>
  })
}

/** 仅状态栏局部等待，不能让整张表因为统计查询变为 loading。 */
export function SelectionStatus() {
  const { visible } = useAtomValue(selectionStatisticsPreferencesAtom)
  const feedback = useAtomValue(selectionStatisticCopyFeedbackAtom)
  return <div className="selection-status">
    <div className="selection-statistics" role="status" aria-label="Selection statistics" aria-atomic="true">
      {visible.length === 0 ? <span>No statistics selected</span> :
        <Suspense fallback={<span>Calculating selection…</span>}><SelectionNumbers /></Suspense>}
    </div>
    <SelectionStatisticsSettings />
    {feedback.message && <span className="statistic-copy-feedback"
      role={feedback.error ? 'alert' : 'status'} aria-label="Statistic copy status">
      {feedback.message}
    </span>}
  </div>
}
