import { Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { nativeConditionalFormatPanelAtom, runNativeConditionalFormatAtom,
  type AverageRule } from '@einfach-excel/spreadsheet-ui-core'

export function ConditionalAverageFields({ idPrefix }: { idPrefix: string }) {
  const { rule } = useAtomValue(nativeConditionalFormatPanelAtom)
  const run = useSetAtom(runNativeConditionalFormatAtom)
  if (rule.kind !== 'above-average') return null
  return <>
    <label htmlFor={`${idPrefix}-average-direction`}><Trans>Average comparison</Trans></label>
    <select id={`${idPrefix}-average-direction`} value={rule.direction}
      onChange={(event) => void run({ type: 'average-direction',
        direction: event.currentTarget.value as AverageRule['direction'] })}>
      <option value="above"><Trans>Above average</Trans></option>
      <option value="below"><Trans>Below average</Trans></option>
    </select>
    <label htmlFor={`${idPrefix}-equal-average`}><Trans>Include equal average</Trans></label>
    <input id={`${idPrefix}-equal-average`} type="checkbox" checked={!!rule.equalAverage}
      onChange={(event) => void run({ type: 'draft', rule: {
        equalAverage: event.currentTarget.checked,
      } })} />
    <p><Trans>
      All finite numbers in the applied ranges count, including hidden cells.
      Text, blanks and errors are ignored.
    </Trans></p>
  </>
}
