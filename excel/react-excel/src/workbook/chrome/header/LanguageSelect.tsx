import { useLingui } from '@lingui/react/macro'
import { activateUiLocale, supportedUiLocale } from '../../../i18n/runtime'

/** 只切换界面词典，不触碰工作簿 locale、数据、选区或编辑草稿。 */
export function LanguageSelect() {
  const { i18n, t } = useLingui()
  return (
    <select
      className="language-select"
      aria-label={t`Interface language`}
      value={i18n.locale}
      onChange={(event) => {
        const locale = supportedUiLocale(event.currentTarget.value)
        if (locale) activateUiLocale(locale)
      }}
    >
      <option value="en" lang="en">English</option>
      <option value="zh" lang="zh">中文</option>
    </select>
  )
}
