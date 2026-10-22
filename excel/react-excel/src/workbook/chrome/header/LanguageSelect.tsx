import { useLingui } from '@lingui/react/macro'
import { useContext } from 'react'
import { supportedUiLocale } from '../../../i18n/runtime'
import { WorkbookPresentationContext } from '../../../page/WorkbookPresentationProvider'

/** 只切换界面词典，不触碰工作簿 locale、数据、选区或编辑草稿。 */
export function LanguageSelect() {
  const { i18n, t } = useLingui()
  const { controlledLocale } = useContext(WorkbookPresentationContext)
  return (
    <select
      className="language-select"
      aria-label={t`Interface language`}
      value={i18n.locale}
      disabled={controlledLocale}
      onChange={(event) => {
        const locale = supportedUiLocale(event.currentTarget.value)
        if (locale) i18n.activate(locale)
      }}
    >
      {!['en', 'zh'].includes(i18n.locale) && <option value={i18n.locale}>{i18n.locale}</option>}
      <option value="en" lang="en">English</option>
      <option value="zh" lang="zh">中文</option>
    </select>
  )
}
