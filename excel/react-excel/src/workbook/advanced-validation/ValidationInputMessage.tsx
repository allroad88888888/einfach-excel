import { useAtomValue } from '@einfach/react'
import { useLingui } from '@lingui/react/macro'
import { nativeValidationListAtom } from '@einfach-excel/spreadsheet-ui-core'
import './advanced-validation.css'

/** 活动格规则已由原生读取缓存加载；提示不会写值、发命令或创建历史。 */
export function ValidationInputMessage() {
  const { t } = useLingui()
  const state = useAtomValue(nativeValidationListAtom)
  const message = state.rule?.inputMessage
  if (!message || (!message.title && !message.message)) return null
  return <aside className="validation-input-message" aria-label={t`Validation input message`}>
    {message.title && <strong>{message.title}</strong>}
    {message.message && <p>{message.message}</p>}
  </aside>
}
