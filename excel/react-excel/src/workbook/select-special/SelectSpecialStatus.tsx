import { useLingui } from '@lingui/react/macro'
import { useAtomValue } from '@einfach/react'
import { selectSpecialFeedbackAtom } from '@einfach-excel/spreadsheet-ui-core'
import { translateSelectSpecial } from '../../i18n/translate-select-special'

/** 快捷键触发的选择助手没有对话框，成功提示与失败原因在这里朗读和显示。 */
export function SelectSpecialStatus() {
  const { i18n, t } = useLingui()
  const { error, notice } = useAtomValue(selectSpecialFeedbackAtom)
  return <>
    {error && <div className="selection-limit-note sheet-command-error" role="alert"
      aria-label={t`Select special error`}>{translateSelectSpecial(i18n, error)}</div>}
    {notice && <span className="visually-hidden" role="status" aria-label={t`Select special`}>
      {translateSelectSpecial(i18n, notice)}</span>}
  </>
}
