import { Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { nativeConditionalFormatPanelAtom, runNativeConditionalFormatAtom,
  type TimePeriodRule } from '@einfach-excel/spreadsheet-ui-core'
import { useConditionalTimePeriodLabels } from './conditional-time-period-labels'

/** Date choices update only the draft; Rust evaluates the calendar predicate. */
export function ConditionalTimePeriodFields({ idPrefix }: { idPrefix: string }) {
  const { rule } = useAtomValue(nativeConditionalFormatPanelAtom)
  const run = useSetAtom(runNativeConditionalFormatAtom)
  const labels = useConditionalTimePeriodLabels()
  if (rule.kind !== 'time-period') return null
  return <>
    <label htmlFor={`${idPrefix}-period`}><Trans>Date period</Trans></label>
    <select id={`${idPrefix}-period`} value={rule.period}
      onChange={(event) => void run({ type: 'draft', rule: {
        period: event.currentTarget.value as TimePeriodRule['period'],
      } })}>
      {Object.entries(labels).map(([value, label]) => (
        <option key={value} value={value}>{label}</option>
      ))}
    </select>
    <p><Trans>
      Uses the current local date when the sheet refreshes. Weeks start on Sunday.
    </Trans></p>
  </>
}
