import { useLingui, Trans } from '@lingui/react/macro'
import { useAtomValue, useSetAtom } from '@einfach/react'
import { numberFormatPanelAtom, runNumberFormatPanelAtom } from '@einfach-excel/spreadsheet-ui-core'
import { numberFormatCodeMessage } from './number-format-code-errors'

/** Custom 类别的代码输入：错误码由 Rust 预览给出，这里只显示可纠正的提示。 */
export function CustomNumberFormatFields({ id }: { readonly id: string }) {
  const { i18n } = useLingui()
  const state = useAtomValue(numberFormatPanelAtom)
  const run = useSetAtom(runNumberFormatPanelAtom)
  const invalid = state.preview !== null && 'invalidCode' in state.preview
    ? state.preview.invalidCode : null
  return <>
    <label className="number-format-wide" htmlFor={`${id}-code`}><Trans>Format code</Trans></label>
    <input className="number-format-wide number-format-code" id={`${id}-code`} type="text"
      maxLength={255} spellCheck={false} autoComplete="off" disabled={state.busy}
      value={state.draft.code} aria-invalid={invalid !== null || undefined}
      aria-describedby={invalid !== null ? `${id}-code-error` : `${id}-code-hint`}
      onChange={(event) => void run({ type: 'draft', patch: { code: event.currentTarget.value } })} />
    {invalid !== null
      ? <p id={`${id}-code-error`} className="number-format-hint" role="alert">
        {numberFormatCodeMessage(i18n, invalid)}</p>
      : <p id={`${id}-code-hint`} className="number-format-hint"><Trans>
        Up to four sections: positive;negative;zero;text. For example #,##0.00;[Red](#,##0.00).
      </Trans></p>}
  </>
}
