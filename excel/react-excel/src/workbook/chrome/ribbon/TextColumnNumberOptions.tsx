import { Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { runTextColumnsPanelAtom, textColumnsPanelAtom } from '@einfach-excel/spreadsheet-ui-core'

/** 输入地区约定只传给 Rust；界面不做字符串替换或数值转换。 */
export function TextColumnNumberOptions() {
  const state = useAtomValue(textColumnsPanelAtom)
  const run = useSetAtom(runTextColumnsPanelAtom)
  const options = state.draft.numberOptions
  return <details className="text-columns-number-options">
    <summary><Trans>Advanced number parsing</Trans></summary>
    <fieldset disabled={state.status !== 'idle'}>
    <legend><Trans>General fields</Trans></legend>
    <div className="text-columns-fields">
      <label><Trans>Decimal separator
        </Trans><select value={options.decimalSeparator} onChange={(event) => void run({
          type: 'draft', patch: { numberOptions: { ...options,
            decimalSeparator: event.currentTarget.value as '.' | ',' } },
        })}><option value="."><Trans>Dot (.)</Trans></option><option value=","><Trans>Comma (,)</Trans></option></select>
      </label>
      <label><Trans>Thousands separator
        </Trans><select value={options.groupSeparator ?? ''} onChange={(event) => void run({
          type: 'draft', patch: { numberOptions: { ...options,
            groupSeparator: event.currentTarget.value || null } },
        })}>
          <option value=""><Trans>None</Trans></option><option value=","><Trans>Comma (,)</Trans></option>
          <option value="."><Trans>Dot (.)</Trans></option><option value=" "><Trans>Space</Trans></option>
          <option value={'\u00a0'}><Trans>Nonbreaking space</Trans></option>
          <option value={'\u202f'}><Trans>Narrow nonbreaking space</Trans></option>
          <option value="'"><Trans>Apostrophe (&apos;)</Trans></option>
        </select>
      </label>
    </div>
    <label className="text-columns-check"><input type="checkbox" checked={options.trailingMinus}
      onChange={(event) => void run({ type: 'draft', patch: { numberOptions: {
        ...options, trailingMinus: event.currentTarget.checked,
      } } })} /><Trans>Allow trailing minus (123- becomes -123)</Trans></label>
    <p className="text-columns-hint"><Trans>
      Input rules only; Text and Date fields are unchanged.
      Thousands groups must contain three digits.
      Invalid numbers keep their original text. Change options, then update the preview.
    </Trans></p>
    </fieldset>
  </details>
}
