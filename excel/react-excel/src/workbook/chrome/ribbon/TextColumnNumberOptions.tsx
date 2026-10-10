import { useAtomValue, useSetAtom } from '@einfach/react'
import { runTextColumnsPanelAtom, textColumnsPanelAtom } from '@einfach/spreadsheet-ui-core'

/** 输入地区约定只传给 Rust；界面不做字符串替换或数值转换。 */
export function TextColumnNumberOptions() {
  const state = useAtomValue(textColumnsPanelAtom)
  const run = useSetAtom(runTextColumnsPanelAtom)
  const options = state.draft.numberOptions
  return <details className="text-columns-number-options">
    <summary>Advanced number parsing</summary>
    <fieldset disabled={state.status !== 'idle'}>
    <legend>General fields</legend>
    <div className="text-columns-fields">
      <label>Decimal separator
        <select value={options.decimalSeparator} onChange={(event) => void run({
          type: 'draft', patch: { numberOptions: { ...options,
            decimalSeparator: event.currentTarget.value as '.' | ',' } },
        })}><option value=".">Dot (.)</option><option value=",">Comma (,)</option></select>
      </label>
      <label>Thousands separator
        <select value={options.groupSeparator ?? ''} onChange={(event) => void run({
          type: 'draft', patch: { numberOptions: { ...options,
            groupSeparator: event.currentTarget.value || null } },
        })}>
          <option value="">None</option><option value=",">Comma (,)</option>
          <option value=".">Dot (.)</option><option value=" ">Space</option>
          <option value={'\u00a0'}>Nonbreaking space</option>
          <option value={'\u202f'}>Narrow nonbreaking space</option>
          <option value="'">Apostrophe (&apos;)</option>
        </select>
      </label>
    </div>
    <label className="text-columns-check"><input type="checkbox" checked={options.trailingMinus}
      onChange={(event) => void run({ type: 'draft', patch: { numberOptions: {
        ...options, trailingMinus: event.currentTarget.checked,
      } } })} />Allow trailing minus (123- becomes -123)</label>
    <p className="text-columns-hint">
      Input rules only; Text and Date fields are unchanged.
      Thousands groups must contain three digits.
      Invalid numbers keep their original text. Change options, then update the preview.
    </p>
    </fieldset>
  </details>
}
