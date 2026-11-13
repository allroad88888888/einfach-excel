import { Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { nativeConditionalFormatPanelAtom, runNativeConditionalFormatAtom,
  type CellStateRule } from '@einfach-excel/spreadsheet-ui-core'
import { useConditionalCellStateLabels } from './conditional-cell-state-labels'

export function ConditionalCellStateFields({ idPrefix }: { idPrefix: string }) {
  const { rule } = useAtomValue(nativeConditionalFormatPanelAtom)
  const run = useSetAtom(runNativeConditionalFormatAtom)
  const labels = useConditionalCellStateLabels()
  if (rule.kind !== 'cell-state') return null
  return <>
    <label htmlFor={`${idPrefix}-cell-state`}><Trans>Cell condition</Trans></label>
    <select id={`${idPrefix}-cell-state`} value={rule.condition}
      onChange={(event) => void run({ type: 'cell-state-condition',
        condition: event.currentTarget.value as CellStateRule['condition'] })}>
      {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>
        {label}
      </option>)}
    </select>
    <p><Trans>
      Blank includes empty results and ordinary spaces. Errors match neither blank nor non-blank.
    </Trans></p>
  </>
}
