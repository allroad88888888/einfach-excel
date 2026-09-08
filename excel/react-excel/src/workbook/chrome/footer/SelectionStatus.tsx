import { Suspense } from 'react'
import { useAtomValue } from '@einfach/react'
import { selectionAggregatesAtom } from '@einfach/spreadsheet-ui-core'
import './selection-status.css'

const formatNumber = (value: number) => value.toLocaleString(undefined, {
  maximumSignificantDigits: 12,
  notation: Math.abs(value) >= 1e12 || (value !== 0 && Math.abs(value) < 1e-6) ? 'scientific' : 'standard',
})

/** React 只格式化 Rust 结果，不从显示文本反推数值。 */
function SelectionNumbers() {
  const state = useAtomValue(selectionAggregatesAtom)
  if (state.status === 'idle') return <span>Select cells to calculate</span>
  if (state.status === 'error')
    return <span className="selection-statistics-error" title={state.message}>Statistics unavailable</span>
  const { count, numericCount, sum, average, min, max } = state.numbers
  return <>
    <span title="Non-empty cells, including text, booleans and errors">Count: {count.toLocaleString()}</span>
    <span>Numerical count: {numericCount.toLocaleString()}</span>
    <span title={sum === null ? undefined : String(sum)}>
      Sum: {sum === null ? (numericCount === 0 ? '—' : 'Out of range') : formatNumber(sum)}
    </span>
    <span title={average === null ? undefined : String(average)}>
      Average: {average === null ? '—' : formatNumber(average)}
    </span>
    <span title={min === null ? undefined : String(min)}>
      Min: {min === null ? '—' : formatNumber(min)}
    </span>
    <span title={max === null ? undefined : String(max)}>
      Max: {max === null ? '—' : formatNumber(max)}
    </span>
  </>
}

/** 仅状态栏局部等待，不能让整张表因为统计查询变为 loading。 */
export function SelectionStatus() {
  return <div className="selection-statistics" role="status" aria-label="Selection statistics" aria-atomic="true">
    <Suspense fallback={<span>Calculating selection…</span>}>
      <SelectionNumbers />
    </Suspense>
  </div>
}
